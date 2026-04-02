import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "redis";

type ScoreEntry = {
  id: string;
  recordedAt: number;
  playerName: string;
  weaponId: string;
  score: number;
  result: "dead" | "extracted";
  duration: number;
  level: number;
  enemiesDestroyed: number;
};

type ScoreSummary = {
  result: "dead" | "extracted";
  duration: number;
  level: number;
  weaponId: string;
  weaponLevel: number;
  shardsBanked: number;
  enemiesDestroyed: number;
  objectivesCompleted: number;
  highestStage: number;
  buildRecap: string;
  keyUpgrades: string[];
  deathReason: string;
  extractionBonus: number;
};

type RunSession = {
  sessionId: string;
  weaponId: string;
  startedAt: number;
  submittedAt: number | null;
  entryId: string | null;
};

type StartRunPayload = {
  action: "start";
  weaponId: string;
};

type SubmitScorePayload = {
  action: "submit";
  sessionId: string;
  sessionToken: string;
  playerName: string;
  summary: ScoreSummary;
};

type VercelRequest = {
  method?: string;
  body?: unknown;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const LEADERBOARD_ZSET_KEY = "neon-harvest:leaderboard:zset";
const LEADERBOARD_HASH_KEY = "neon-harvest:leaderboard:entries";
const LEGACY_JSON_KEY = "neon-harvest:leaderboard";
const SESSION_PREFIX = "neon-harvest:run-session:";
const SESSION_TTL_SECONDS = 60 * 90;
const LEADERBOARD_LIMIT = 20;

function setCors(response: VercelResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getRedisUrl(): string {
  const redisUrl =
    process.env.REDIS_URL ??
    process.env.UPSTASH_REDIS_REST_REDIS_URL ??
    process.env.UPSTASH_REDIS_REDIS_URL;

  if (!redisUrl) {
    throw new Error("Leaderboard backend not configured");
  }

  return redisUrl;
}

function getSessionSecret(): string {
  return process.env.LEADERBOARD_SESSION_SECRET ?? process.env.REDIS_URL ?? "local-dev-secret";
}

async function withRedis<T>(action: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const client = createClient({ url: getRedisUrl() });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.disconnect();
  }
}

function signSession(sessionId: string, weaponId: string, startedAt: number): string {
  return createHmac("sha256", getSessionSecret()).update(`${sessionId}:${weaponId}:${startedAt}`).digest("hex");
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    return "匿名回收员";
  }
  return value.trim().slice(0, 24) || "匿名回收员";
}

function normalizeSummary(input: unknown): ScoreSummary | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const summary = input as Record<string, unknown>;
  if (
    (summary.result !== "dead" && summary.result !== "extracted") ||
    typeof summary.duration !== "number" ||
    typeof summary.level !== "number" ||
    typeof summary.weaponId !== "string" ||
    typeof summary.weaponLevel !== "number" ||
    typeof summary.shardsBanked !== "number" ||
    typeof summary.enemiesDestroyed !== "number" ||
    typeof summary.objectivesCompleted !== "number" ||
    typeof summary.highestStage !== "number" ||
    typeof summary.buildRecap !== "string" ||
    !Array.isArray(summary.keyUpgrades) ||
    typeof summary.deathReason !== "string" ||
    typeof summary.extractionBonus !== "number"
  ) {
    return null;
  }

  return {
    result: summary.result,
    duration: Math.max(0, summary.duration),
    level: Math.max(1, Math.floor(summary.level)),
    weaponId: summary.weaponId,
    weaponLevel: Math.max(1, Math.floor(summary.weaponLevel)),
    shardsBanked: Math.max(0, Math.floor(summary.shardsBanked)),
    enemiesDestroyed: Math.max(0, Math.floor(summary.enemiesDestroyed)),
    objectivesCompleted: Math.max(0, Math.floor(summary.objectivesCompleted)),
    highestStage: Math.max(1, Math.floor(summary.highestStage)),
    buildRecap: summary.buildRecap.slice(0, 200),
    keyUpgrades: summary.keyUpgrades.filter((item): item is string => typeof item === "string").slice(0, 8),
    deathReason: summary.deathReason.slice(0, 120),
    extractionBonus: Math.max(0, summary.extractionBonus)
  };
}

function isStartPayload(body: unknown): body is StartRunPayload {
  return !!body && typeof body === "object" && (body as Record<string, unknown>).action === "start" && typeof (body as Record<string, unknown>).weaponId === "string";
}

function isSubmitPayload(body: unknown): body is SubmitScorePayload {
  if (!body || typeof body !== "object") {
    return false;
  }
  const payload = body as Record<string, unknown>;
  return (
    payload.action === "submit" &&
    typeof payload.sessionId === "string" &&
    typeof payload.sessionToken === "string" &&
    typeof payload.playerName === "string" &&
    typeof payload.summary === "object"
  );
}

function buildEntryId(sessionId: string): string {
  return `entry:${sessionId}`;
}

function scoreToSortedSetValue(entry: ScoreEntry): number {
  return entry.score * 1_000_000 + entry.level * 1_000 + entry.recordedAt / 1_000_000_000_000;
}

async function migrateLegacyLeaderboard(client: ReturnType<typeof createClient>): Promise<void> {
  const existingTop = await client.zRange(LEADERBOARD_ZSET_KEY, 0, 0, { REV: true });
  if (existingTop.length > 0) {
    return;
  }

  const legacy = await client.get(LEGACY_JSON_KEY);
  if (!legacy) {
    return;
  }

  try {
    const parsed = JSON.parse(legacy) as ScoreEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return;
    }

    const pipeline = client.multi();
    for (const [index, item] of parsed.slice(0, LEADERBOARD_LIMIT).entries()) {
      const entry = normalizeLegacyEntry(item, index);
      if (!entry) {
        continue;
      }
      pipeline.hSet(LEADERBOARD_HASH_KEY, entry.id, JSON.stringify(entry));
      pipeline.zAdd(LEADERBOARD_ZSET_KEY, { score: scoreToSortedSetValue(entry), value: entry.id });
    }
    await pipeline.exec();
  } catch {
    return;
  }
}

function normalizeLegacyEntry(input: unknown, index: number): ScoreEntry | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const entry = input as Record<string, unknown>;
  if (
    typeof entry.recordedAt !== "number" ||
    typeof entry.weaponId !== "string" ||
    typeof entry.score !== "number" ||
    (entry.result !== "dead" && entry.result !== "extracted") ||
    typeof entry.duration !== "number" ||
    typeof entry.level !== "number" ||
    typeof entry.enemiesDestroyed !== "number"
  ) {
    return null;
  }

  return {
    id: typeof entry.id === "string" ? entry.id : `legacy-${index}-${entry.recordedAt}`,
    recordedAt: entry.recordedAt,
    playerName: normalizeName(entry.playerName),
    weaponId: entry.weaponId,
    score: Math.max(0, Math.floor(entry.score)),
    result: entry.result,
    duration: Math.max(0, entry.duration),
    level: Math.max(1, Math.floor(entry.level)),
    enemiesDestroyed: Math.max(0, Math.floor(entry.enemiesDestroyed))
  };
}

async function readTopScores(client: ReturnType<typeof createClient>): Promise<ScoreEntry[]> {
  await migrateLegacyLeaderboard(client);
  const ids = await client.zRange(LEADERBOARD_ZSET_KEY, 0, LEADERBOARD_LIMIT - 1, { REV: true });
  if (ids.length === 0) {
    return [];
  }

  const rawEntries = await client.hmGet(LEADERBOARD_HASH_KEY, ids);
  const entries = rawEntries
    .map((item) => {
      if (!item) {
        return null;
      }
      try {
        return JSON.parse(item) as ScoreEntry;
      } catch {
        return null;
      }
    })
    .filter((item): item is ScoreEntry => Boolean(item));

  const order = new Map(ids.map((id, index) => [id, index]));
  return entries.sort((left, right) => (order.get(left.id) ?? 999) - (order.get(right.id) ?? 999));
}

async function createRunSession(client: ReturnType<typeof createClient>, weaponId: string): Promise<{ sessionId: string; sessionToken: string }> {
  const sessionId = randomUUID();
  const startedAt = Date.now();
  const session: RunSession = {
    sessionId,
    weaponId,
    startedAt,
    submittedAt: null,
    entryId: null
  };
  const sessionToken = signSession(sessionId, weaponId, startedAt);
  await client.set(`${SESSION_PREFIX}${sessionId}`, JSON.stringify(session), { EX: SESSION_TTL_SECONDS });
  return { sessionId, sessionToken };
}

function validateSummaryAgainstSession(summary: ScoreSummary, session: RunSession): string | null {
  const elapsedSeconds = Math.max(0, (Date.now() - session.startedAt) / 1000);

  if (summary.weaponId !== session.weaponId) {
    return "Weapon mismatch";
  }
  if (summary.duration > elapsedSeconds + 15) {
    return "Duration exceeds session age";
  }
  if (summary.duration > SESSION_TTL_SECONDS) {
    return "Duration exceeds leaderboard session window";
  }
  if (summary.level > 1 + Math.floor(summary.duration / 6) + summary.highestStage * 2) {
    return "Level is not plausible for this run";
  }
  if (summary.enemiesDestroyed > Math.floor(summary.duration * 9) + summary.highestStage * 25) {
    return "Enemy count is not plausible for this run";
  }
  if (summary.objectivesCompleted > summary.highestStage) {
    return "Objective count is not plausible for this run";
  }
  if (summary.shardsBanked > summary.enemiesDestroyed * 180 + summary.objectivesCompleted * 600 + summary.duration * 35 + 2000) {
    return "Score is not plausible for this run";
  }
  return null;
}

async function submitScore(
  client: ReturnType<typeof createClient>,
  payload: SubmitScorePayload
): Promise<{ entries: ScoreEntry[] }> {
  const sessionRaw = await client.get(`${SESSION_PREFIX}${payload.sessionId}`);
  if (!sessionRaw) {
    throw new Error("Run session expired or missing");
  }

  const session = JSON.parse(sessionRaw) as RunSession;
  const expectedToken = signSession(session.sessionId, session.weaponId, session.startedAt);
  if (!safeEqualHex(payload.sessionToken, expectedToken)) {
    throw new Error("Invalid session token");
  }

  if (session.submittedAt && session.entryId) {
    return { entries: await readTopScores(client) };
  }

  const summary = normalizeSummary(payload.summary);
  if (!summary) {
    throw new Error("Invalid score summary");
  }

  const validationError = validateSummaryAgainstSession(summary, session);
  if (validationError) {
    throw new Error(validationError);
  }

  const entry: ScoreEntry = {
    id: buildEntryId(session.sessionId),
    recordedAt: Date.now(),
    playerName: normalizeName(payload.playerName),
    weaponId: summary.weaponId,
    score: summary.shardsBanked,
    result: summary.result,
    duration: summary.duration,
    level: summary.level,
    enemiesDestroyed: summary.enemiesDestroyed
  };

  const nextSession: RunSession = {
    ...session,
    submittedAt: Date.now(),
    entryId: entry.id
  };

  const pipeline = client.multi();
  pipeline.hSet(LEADERBOARD_HASH_KEY, entry.id, JSON.stringify(entry));
  pipeline.zAdd(LEADERBOARD_ZSET_KEY, { score: scoreToSortedSetValue(entry), value: entry.id });
  pipeline.set(`${SESSION_PREFIX}${session.sessionId}`, JSON.stringify(nextSession), { EX: SESSION_TTL_SECONDS });
  pipeline.zRemRangeByRank(LEADERBOARD_ZSET_KEY, 0, -(LEADERBOARD_LIMIT + 1));
  await pipeline.exec();

  const survivorIds = await client.zRange(LEADERBOARD_ZSET_KEY, 0, LEADERBOARD_LIMIT - 1, { REV: true });
  const keepSet = new Set(survivorIds);
  const allIds = await client.hKeys(LEADERBOARD_HASH_KEY);
  const staleIds = allIds.filter((id) => !keepSet.has(id));
  if (staleIds.length > 0) {
    await client.hDel(LEADERBOARD_HASH_KEY, staleIds);
  }

  return { entries: await readTopScores(client) };
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.status(204).json({});
    return;
  }

  try {
    if (request.method === "GET") {
      const entries = await withRedis((client) => readTopScores(client));
      response.status(200).json({ entries });
      return;
    }

    if (request.method === "POST") {
      if (isStartPayload(request.body)) {
        const session = await withRedis((client) => createRunSession(client, request.body.weaponId));
        response.status(200).json(session);
        return;
      }

      if (isSubmitPayload(request.body)) {
        const result = await withRedis((client) => submitScore(client, request.body));
        response.status(200).json({ ok: true, entries: result.entries });
        return;
      }

      response.status(400).json({ error: "Unsupported leaderboard action" });
      return;
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    response.status(503).json({
      error: error instanceof Error ? error.message : "Leaderboard unavailable"
    });
  }
}
