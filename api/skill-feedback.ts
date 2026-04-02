import { createClient } from "redis";

import { type UpgradeId, upgradeDefinitions } from "../src/game/content/upgrades";

type SkillVoteKind = "up" | "down";

type StoredSkillFeedbackEntry = {
  skillId: UpgradeId;
  totalUp: number;
  totalDown: number;
  dailyUp: number;
  dailyDown: number;
  dailyDate: string;
};

type SkillFeedbackEntry = StoredSkillFeedbackEntry & {
  userVote: SkillVoteKind | null;
  userVotedToday: boolean;
};

type StoredVoteEntry = {
  vote: SkillVoteKind;
  votedOn: string;
};

type VotePayload = {
  skillId: UpgradeId;
  vote: SkillVoteKind;
  clientId: string;
};

type VercelRequest = {
  method?: string;
  url?: string;
  body?: unknown;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const SKILL_FEEDBACK_HASH_KEY = "neon-harvest:skill-feedback:stats";
const SKILL_FEEDBACK_VOTE_PREFIX = "neon-harvest:skill-feedback:votes:";
const VOTE_TTL_SECONDS = 60 * 60 * 24 * 180;

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
    throw new Error("Skill feedback backend not configured");
  }

  return redisUrl;
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

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function normalizeClientId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeVote(value: unknown): SkillVoteKind | null {
  return value === "up" || value === "down" ? value : null;
}

function parseStoredVoteEntry(raw: string | null): StoredVoteEntry | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredVoteEntry>;
    const vote = normalizeVote(parsed.vote);
    if (!vote || typeof parsed.votedOn !== "string" || !parsed.votedOn) {
      return null;
    }
    return {
      vote,
      votedOn: parsed.votedOn
    };
  } catch {
    const legacyVote = normalizeVote(raw);
    if (!legacyVote) {
      return null;
    }
    return {
      vote: legacyVote,
      votedOn: ""
    };
  }
}

function normalizeSkillId(value: unknown): UpgradeId | null {
  if (typeof value !== "string") {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(upgradeDefinitions, value) ? (value as UpgradeId) : null;
}

function isVotePayload(body: unknown): body is VotePayload {
  if (!body || typeof body !== "object") {
    return false;
  }
  const payload = body as Record<string, unknown>;
  return Boolean(normalizeSkillId(payload.skillId) && normalizeVote(payload.vote) && normalizeClientId(payload.clientId));
}

function createDefaultEntry(skillId: UpgradeId, dailyDate = todayKey()): StoredSkillFeedbackEntry {
  return {
    skillId,
    totalUp: 0,
    totalDown: 0,
    dailyUp: 0,
    dailyDown: 0,
    dailyDate
  };
}

function parseStoredEntry(raw: string | null, skillId: UpgradeId): StoredSkillFeedbackEntry {
  if (!raw) {
    return createDefaultEntry(skillId);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSkillFeedbackEntry>;
    return {
      skillId,
      totalUp: Math.max(0, Math.floor(parsed.totalUp ?? 0)),
      totalDown: Math.max(0, Math.floor(parsed.totalDown ?? 0)),
      dailyUp: Math.max(0, Math.floor(parsed.dailyUp ?? 0)),
      dailyDown: Math.max(0, Math.floor(parsed.dailyDown ?? 0)),
      dailyDate: typeof parsed.dailyDate === "string" && parsed.dailyDate ? parsed.dailyDate : todayKey()
    };
  } catch {
    return createDefaultEntry(skillId);
  }
}

function resetDailyCountsIfNeeded(entry: StoredSkillFeedbackEntry, currentDate: string): StoredSkillFeedbackEntry {
  if (entry.dailyDate === currentDate) {
    return entry;
  }
  return {
    ...entry,
    dailyUp: 0,
    dailyDown: 0,
    dailyDate: currentDate
  };
}

async function ensureSkillFeedbackCatalog(client: ReturnType<typeof createClient>): Promise<void> {
  const today = todayKey();
  const skillIds = Object.keys(upgradeDefinitions) as UpgradeId[];
  const rawEntries = await client.hmGet(SKILL_FEEDBACK_HASH_KEY, skillIds);
  const pipeline = client.multi();
  let changed = false;

  skillIds.forEach((skillId, index) => {
    const normalized = resetDailyCountsIfNeeded(parseStoredEntry(rawEntries[index], skillId), today);
    if (!rawEntries[index] || rawEntries[index] !== JSON.stringify(normalized)) {
      pipeline.hSet(SKILL_FEEDBACK_HASH_KEY, skillId, JSON.stringify(normalized));
      changed = true;
    }
  });

  if (changed) {
    await pipeline.exec();
  }
}

async function readSkillFeedbackEntries(
  client: ReturnType<typeof createClient>,
  clientId?: string | null
): Promise<SkillFeedbackEntry[]> {
  await ensureSkillFeedbackCatalog(client);
  const skillIds = Object.keys(upgradeDefinitions) as UpgradeId[];
  const rawEntries = await client.hmGet(SKILL_FEEDBACK_HASH_KEY, skillIds);
  const votes =
    clientId && clientId.length > 0
      ? await client.hmGet(`${SKILL_FEEDBACK_VOTE_PREFIX}${clientId}`, skillIds)
      : new Array(skillIds.length).fill(null);

  return skillIds.map((skillId, index) => ({
    ...parseStoredEntry(rawEntries[index], skillId),
    userVote: parseStoredVoteEntry(votes[index])?.vote ?? null,
    userVotedToday: parseStoredVoteEntry(votes[index])?.votedOn === todayKey()
  }));
}

async function applyVote(
  client: ReturnType<typeof createClient>,
  payload: VotePayload
): Promise<SkillFeedbackEntry[]> {
  await ensureSkillFeedbackCatalog(client);
  const skillId = payload.skillId;
  const voteKey = `${SKILL_FEEDBACK_VOTE_PREFIX}${payload.clientId}`;
  const today = todayKey();
  const rawEntry = await client.hGet(SKILL_FEEDBACK_HASH_KEY, skillId);
  let entry = resetDailyCountsIfNeeded(parseStoredEntry(rawEntry, skillId), today);
  const existingVoteEntry = parseStoredVoteEntry(await client.hGet(voteKey, skillId));
  const existingVote = existingVoteEntry?.vote ?? null;

  if (existingVoteEntry?.votedOn === today) {
    return readSkillFeedbackEntries(client, payload.clientId);
  }

  if (existingVote === "up") {
    entry.totalUp = Math.max(0, entry.totalUp - 1);
    if (entry.dailyDate === today) {
      entry.dailyUp = Math.max(0, entry.dailyUp - 1);
    }
  } else if (existingVote === "down") {
    entry.totalDown = Math.max(0, entry.totalDown - 1);
    if (entry.dailyDate === today) {
      entry.dailyDown = Math.max(0, entry.dailyDown - 1);
    }
  }

  if (payload.vote === "up") {
    entry.totalUp += 1;
    entry.dailyUp += 1;
  } else {
    entry.totalDown += 1;
    entry.dailyDown += 1;
  }

  const pipeline = client.multi();
  pipeline.hSet(SKILL_FEEDBACK_HASH_KEY, skillId, JSON.stringify(entry));
  pipeline.hSet(
    voteKey,
    skillId,
    JSON.stringify({
      vote: payload.vote,
      votedOn: today
    } satisfies StoredVoteEntry)
  );
  pipeline.expire(voteKey, VOTE_TTL_SECONDS);
  await pipeline.exec();

  return readSkillFeedbackEntries(client, payload.clientId);
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.status(200).json({ ok: true });
    return;
  }

  try {
    if (request.method === "GET") {
      const url = new URL(request.url ?? "/api/skill-feedback", "http://localhost");
      const clientId = normalizeClientId(url.searchParams.get("clientId"));
      const entries = await withRedis((client) => readSkillFeedbackEntries(client, clientId));
      response.status(200).json({ entries, dailyDate: todayKey() });
      return;
    }

    if (request.method === "POST") {
      if (!isVotePayload(request.body)) {
        response.status(400).json({ error: "Invalid feedback payload" });
        return;
      }

      const entries = await withRedis((client) =>
        applyVote(client, {
          skillId: request.body.skillId,
          vote: request.body.vote,
          clientId: request.body.clientId
        })
      );
      response.status(200).json({ entries, dailyDate: todayKey() });
      return;
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Skill feedback request failed"
    });
  }
}
