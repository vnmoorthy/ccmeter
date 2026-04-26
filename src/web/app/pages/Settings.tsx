import { ExternalLink, Shield, Trash2 } from "lucide-react";

export function SettingsPage(): JSX.Element {
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card p-4">
        <div className="font-medium flex items-center gap-2">
          <Shield size={14} /> Privacy
        </div>
        <div className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
          ccmeter reads only files under <code>~/.claude/projects</code> and writes a parsed cache
          to <code>~/.cache/ccmeter</code>. Default commands make zero network calls.
        </div>
        <div className="text-sm mt-3">
          Run <code>ccmeter check-privacy</code> in your terminal to see exactly what files would be
          touched.
        </div>
      </div>

      <div className="card p-4">
        <div className="font-medium">Pricing overrides</div>
        <div className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
          Anthropic adjusts prices regularly. ccmeter ships a built-in table verified on 2026-04-25.
          To override per-model pricing, create <code>~/.config/ccmeter/pricing.json</code> with
          your own values:
        </div>
        <pre
          className="mono text-xs p-3 mt-2 overflow-auto"
          style={{
            background: "var(--bg-elev2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
{`{
  "claude-sonnet-4-6": {
    "input": 3.0,
    "output": 15.0,
    "cache_5m_write": 3.75,
    "cache_1h_write": 6.0,
    "cache_read": 0.3
  }
}`}
        </pre>
      </div>

      <div className="card p-4">
        <div className="font-medium">Log directory</div>
        <div className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
          Default: <code>~/.claude/projects</code>. Override with <code>CCMETER_LOG_DIR=/path</code>{" "}
          or <code>--log-dir</code>.
        </div>
      </div>

      <div className="card p-4">
        <div className="font-medium flex items-center gap-2">
          <Trash2 size={14} /> Cache
        </div>
        <div className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
          Reset the parsed-result cache: <code>ccmeter clear-cache</code>. Safe to run any time —
          ccmeter will re-parse on next launch.
        </div>
      </div>

      <div className="card p-4">
        <div className="font-medium flex items-center gap-2">
          <ExternalLink size={14} /> Resources
        </div>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <a href="https://github.com/vnmoorthy/ccmeter">github.com/vnmoorthy/ccmeter</a>
          </li>
          <li>
            <a href="https://github.com/vnmoorthy/ccmeter/blob/main/README.md">documentation</a>
          </li>
          <li>
            <a href="https://github.com/vnmoorthy/ccmeter/blob/main/src/core/analysis/recommend">
              add a recommendation rule (PRs welcome)
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
