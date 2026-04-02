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

type VercelRequest = {
  method?: string;
  body?: unknown;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const LEADERBOARD_KEY = "neon-harvest:leaderboard";

function setCors(response: VercelResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function fetchRedisRest(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!baseUrl || !token) {
    throw new Error("REST backend not configured");
  }

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

async function readScoresViaRest(): Promise<ScoreEntry[]> {
  const response = await fetchRedisRest(`/get/${encodeURIComponent(LEADERBOARD_KEY)}`);
  const payload = (await response.json()) as { result?: string | null };
  if (!payload.result) {
    return [];
  }

  try {
    const parsed = JSON.parse(payload.result) as ScoreEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeScoresViaRest(entries: ScoreEntry[]): Promise<void> {
  await fetchRedisRest(`/set/${encodeURIComponent(LEADERBOARD_KEY)}`, {
    method: "POST",
    body: JSON.stringify(entries)
  });
}

async function withRedisUrl<T>(action: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const redisUrl =
    process.env.REDIS_URL ??
    process.env.UPSTASH_REDIS_REST_REDIS_URL ??
    process.env.UPSTASH_REDIS_REDIS_URL;

  if (!redisUrl) {
    throw new Error("Redis URL backend not configured");
  }

  const client = createClient({
    url: redisUrl
  });

  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.disconnect();
  }
}

async function readScoresViaRedisUrl(): Promise<ScoreEntry[]> {
  return withRedisUrl(async (client) => {
    const payload = await client.get(LEADERBOARD_KEY);
    if (!payload) {
      return [];
    }

    try {
      const parsed = JSON.parse(payload) as ScoreEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
}

async function writeScoresViaRedisUrl(entries: ScoreEntry[]): Promise<void> {
  await withRedisUrl(async (client) => {
    await client.set(LEADERBOARD_KEY, JSON.stringify(entries));
  });
}

async function readScores(): Promise<ScoreEntry[]> {
  const hasRest = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  if (hasRest) {
    return readScoresViaRest();
  }
  return readScoresViaRedisUrl();
}

async function writeScores(entries: ScoreEntry[]): Promise<void> {
  const hasRest = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  if (hasRest) {
    await writeScoresViaRest(entries);
    return;
  }
  await writeScoresViaRedisUrl(entries);
}

function normalizeEntry(input: unknown): ScoreEntry | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const entry = input as Record<string, unknown>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.recordedAt !== "number" ||
    typeof entry.playerName !== "string" ||
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
    id: entry.id,
    recordedAt: entry.recordedAt,
    playerName: entry.playerName.trim().slice(0, 24) || "匿名回收员",
    weaponId: entry.weaponId,
    score: entry.score,
    result: entry.result,
    duration: entry.duration,
    level: entry.level,
    enemiesDestroyed: entry.enemiesDestroyed
  };
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.status(204).json({});
    return;
  }

  try {
    if (request.method === "GET") {
      const entries = await readScores();
      response.status(200).json({ entries });
      return;
    }

    if (request.method === "POST") {
      const entry = normalizeEntry(request.body);
      if (!entry) {
        response.status(400).json({ error: "Invalid score payload" });
        return;
      }

      const entries = await readScores();
      const nextEntries = [...entries.filter((item) => item.id !== entry.id), entry]
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }
          if (right.level !== left.level) {
            return right.level - left.level;
          }
          return right.recordedAt - left.recordedAt;
        })
        .slice(0, 20);

      await writeScores(nextEntries);
      response.status(200).json({ ok: true, entries: nextEntries });
      return;
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    response.status(503).json({
      error: error instanceof Error ? error.message : "Leaderboard unavailable"
    });
  }
}
