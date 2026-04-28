import { useEffect, useState } from "react";
import {
  BarChart3,
  AlertTriangle,
  Database,
  Lightbulb,
  Settings as SettingsIcon,
  ListTree,
  Wand2,
  Wrench,
} from "lucide-react";
import { OverviewPage } from "./pages/Overview.js";
import { SessionsPage } from "./pages/Sessions.js";
import { CachePage } from "./pages/Cache.js";
import { RecommendationsPage } from "./pages/Recommendations.js";
import { SettingsPage } from "./pages/Settings.js";
import { WhatIfPage } from "./pages/WhatIf.js";
import { ToolsPage } from "./pages/Tools.js";
import { subscribeEvents } from "./lib/api.js";

type Tab =
  | "overview"
  | "sessions"
  | "cache"
  | "tools"
  | "recommendations"
  | "whatif"
  | "settings";

const TABS: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "sessions", label: "Sessions", icon: ListTree },
  { id: "cache", label: "Cache", icon: Database },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "recommendations", label: "Recommendations", icon: Lightbulb },
  { id: "whatif", label: "What-if", icon: Wand2 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>(() => {
    const h = window.location.hash.replace("#/", "");
    if (TABS.some((t) => t.id === h)) return h as Tab;
    return "overview";
  });
  const [days, setDays] = useState<number>(30);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const off = subscribeEvents((e) => {
      if (e.type === "analysis-updated") setPulse((p) => p + 1);
    });
    return off;
  }, []);

  useEffect(() => {
    window.location.hash = `/${tab}`;
  }, [tab]);

  // Keep tab state in sync with the URL hash so browser back/forward
  // and deep-link bookmarks (e.g. /?t=...#/cache) update the active tab.
  useEffect(() => {
    const onHash = (): void => {
      const h = window.location.hash.replace("#/", "");
      if (TABS.some((t) => t.id === h)) setTab(h as Tab);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header
        className="sticky top-0 z-10 px-6 py-3 flex items-center gap-6 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="mono font-bold text-base"
            style={{ color: "var(--accent)" }}
          >
            ccmeter
          </div>
          <div className="text-xs" style={{ color: "var(--text-dim)" }}>
            local · no telemetry
          </div>
        </div>
        <nav className="flex items-center gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                className="btn"
                data-active={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              className="btn"
              data-active={days === d}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
          <Pulse n={pulse} />
        </div>
      </header>

      <main className="flex-1 px-6 py-6">
        {tab === "overview" && <OverviewPage days={days} pulse={pulse} />}
        {tab === "sessions" && <SessionsPage days={days} pulse={pulse} />}
        {tab === "cache" && <CachePage days={days} pulse={pulse} />}
        {tab === "tools" && <ToolsPage pulse={pulse} />}
        {tab === "recommendations" && <RecommendationsPage pulse={pulse} />}
        {tab === "whatif" && <WhatIfPage days={days} />}
        {tab === "settings" && <SettingsPage />}
      </main>

      <footer
        className="px-6 py-3 border-t text-xs flex justify-between"
        style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
      >
        <div>
          ccmeter · MIT · <a href="https://github.com/vnmoorthy/ccmeter">github</a>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle size={12} />
          numbers approximate; verify large decisions in Anthropic Console.
        </div>
      </footer>
    </div>
  );
}

function Pulse({ n }: { n: number }): JSX.Element {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (n === 0) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 800);
    return () => clearTimeout(t);
  }, [n]);
  return (
    <div
      className="w-2 h-2 rounded-full transition-opacity"
      style={{
        background: "var(--accent)",
        opacity: show ? 1 : 0.25,
      }}
      title={show ? "data refreshed" : "live"}
    />
  );
}
