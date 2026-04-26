// Thin API client. Bearer-token auth with the value injected into window.
// Throws on non-2xx — TanStack Query handles surfacing the error.

declare global {
  interface Window {
    __CCMETER_TOKEN__?: string;
  }
}

const TOKEN = (typeof window !== "undefined" && window.__CCMETER_TOKEN__) || "";

async function get<T>(path: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${path}${sep}t=${TOKEN}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface SummaryResponse {
  generatedAt: number;
  totals: {
    totalCost: number;
    sessions: number;
    turns: number;
    cacheHitRatio: number;
    busts: number;
    bustCost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  daily: DailyBucket[];
  byProject: ProjectAggregate[];
  byModel: ModelAggregate[];
  recommendationsCount: number;
}

export interface DailyBucket {
  date: string;
  totalCost: number;
  busts: number;
  bustCost: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  sessions: number;
  turns: number;
}

export interface ProjectAggregate {
  projectPath: string;
  totalCost: number;
  sessions: number;
  cacheHitRatio: number;
  bustCost: number;
}

export interface ModelAggregate {
  model: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  turns: number;
}

export interface SessionSummary {
  id: string;
  projectPath: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  turnCount: number;
  toolUseCount: number;
  primaryModel: string;
  shape: string;
  cost: {
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  cacheBusts: Array<{
    ts: number;
    tier: string;
    gapSeconds: number;
    wastedCost: number;
  }>;
}

export interface Recommendation {
  id: string;
  severity: "info" | "warn" | "high";
  title: string;
  body: string;
  estimatedMonthlySavings: number;
  evidence: Array<{ sessionId: string; projectPath: string; ts: number; note?: string }>;
}

export interface CacheResponse {
  busts: number;
  bustCost: number;
  hitRatio: number;
  daily: DailyBucket[];
}

export interface ToolAggregate {
  name: string;
  calls: number;
  sessionsUsedIn: number;
  attributedCost: number;
  avgCostPerCall: number;
}

export interface TagSummary {
  tag: string;
  sessions: number;
  cost: number;
}

export const api = {
  summary: (days = 30) => get<SummaryResponse>(`/api/summary?days=${days}`),
  sessions: (params: { top?: number; sort?: string; project?: string; days?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.top) q.set("top", String(params.top));
    if (params.sort) q.set("sort", params.sort);
    if (params.project) q.set("project", params.project);
    if (params.days) q.set("days", String(params.days));
    return get<SessionSummary[]>(`/api/sessions?${q.toString()}`);
  },
  session: (id: string) => get<SessionSummary>(`/api/sessions/${encodeURIComponent(id)}`),
  cache: (days = 30) => get<CacheResponse>(`/api/cache?days=${days}`),
  recommendations: () => get<Recommendation[]>(`/api/recommendations`),
  tools: () => get<ToolAggregate[]>(`/api/tools`),
  tags: () => get<TagSummary[]>(`/api/tags`),
};

export function subscribeEvents(onEvent: (e: { type: string }) => void): () => void {
  const es = new EventSource(`/api/events?t=${TOKEN}`);
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch {
      /* ignore */
    }
  };
  return () => es.close();
}
