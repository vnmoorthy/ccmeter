# Export schema

`ccmeter export --format json` produces a stable JSON document. The shape is versioned via the top-level field set; breaking changes will increment the major version of ccmeter.

```ts
interface Analysis {
  generatedAt: number;        // ms-since-epoch
  rangeStartMs: number;
  rangeEndMs: number;

  totals: {
    totalCost: number;        // USD
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    busts: number;
    bustCost: number;         // USD
    cacheHitRatio: number;    // 0..1
    sessions: number;
    turns: number;
  };

  sessions: Session[];
  daily: DailyBucket[];
  byProject: ProjectAggregate[];
  byModel: ModelAggregate[];
  recommendations: Recommendation[];

  parseStats: {
    files: number;
    bytes: number;
    turns: number;
    errors: number;
    cacheHits: number;
    cacheMisses: number;
    durationMs: number;
  };
}

interface Session {
  id: string;
  projectPath: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  models: string[];
  primaryModel: string;
  turnCount: number;
  toolUseCount: number;
  cost: Cost;
  cacheBusts: CacheBust[];
  shape: "interactive" | "agentic" | "mixed" | "burst";
  filePath: string;
}

interface Cost {
  inputCost: number;
  outputCost: number;
  cacheWriteCost: number;
  cacheWrite5mCost: number;
  cacheWrite1hCost: number;
  cacheReadCost: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  model: string;
  cacheTier: "5m" | "1h" | "mixed" | "none";
}

interface CacheBust {
  ts: number;
  tier: "5m" | "1h";
  gapSeconds: number;
  writeCost: number;
  hypotheticalReadCost: number;
  wastedCost: number;
  sessionId: string;
}

interface Recommendation {
  id: string;
  severity: "info" | "warn" | "high";
  title: string;
  body: string;
  estimatedMonthlySavings: number;
  evidence: Array<{
    sessionId: string;
    projectPath: string;
    ts: number;
    note?: string;
  }>;
}

interface DailyBucket {
  date: string;             // YYYY-MM-DD in user's local TZ
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  busts: number;
  bustCost: number;
  sessions: number;
  turns: number;
}

interface ProjectAggregate {
  projectPath: string;       // redacted by default; full path with --no-redact
  totalCost: number;
  sessions: number;
  turns: number;
  cacheHitRatio: number;     // 0..1
  bustCost: number;
}

interface ModelAggregate {
  model: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  turns: number;
}
```

## Anonymization

With `--anonymize`, `projectPath` becomes `anon://<8-char-hash>` and `id` becomes `id_<8-char-hash>`. This is one-way SHA-256.

## CSV format

`--format csv` outputs one row per session with columns:

```
sessionId, project, startedAt (ISO 8601), durationSec, model, turns, toolUses,
inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
totalCost, bustCount, bustCost, shape
```

## Markdown format

Human-readable single-document report, suitable for sharing. Includes totals, top models, top projects, and full recommendations with evidence. Default-redacted.
