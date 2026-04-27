"""
pyccmeter — Python companion for ccmeter.

Wraps the ccmeter CLI so you can read your Claude Code spend analysis as
ordinary Python dataclasses. Useful for piping into pandas, plotting in
matplotlib, building per-team rollups, etc.

Why a wrapper instead of a re-port:
  - The TypeScript ccmeter is the source of truth (parser, pricing, rules).
  - Re-implementing all that in Python would mean two copies that drift.
  - This module shells out to `ccmeter export --format json` and parses
    the output. Stable schema (versioned via `schemaVersion`), zero copies.

Usage:
    from pyccmeter import load_analysis
    a = load_analysis(days=30)
    print(f"${a.totals.total_cost:.2f}")
    for s in sorted(a.sessions, key=lambda s: s.cost.total_cost, reverse=True)[:5]:
        print(s.id, s.project_path, s.cost.total_cost)

Requirements: Python 3.9+, ccmeter on PATH.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# --- public dataclasses ----------------------------------------------------


@dataclass
class Cost:
    input_cost: float
    output_cost: float
    cache_write_cost: float
    cache_read_cost: float
    total_cost: float
    input_tokens: int
    output_tokens: int
    cache_write_tokens: int
    cache_read_tokens: int
    model: str
    cache_tier: str


@dataclass
class CacheBust:
    ts: int
    tier: str
    gap_seconds: float
    wasted_cost: float
    session_id: str


@dataclass
class Session:
    id: str
    project_path: str
    start_ms: int
    end_ms: int
    duration_ms: int
    primary_model: str
    turn_count: int
    tool_use_count: int
    cost: Cost
    cache_busts: List[CacheBust]
    shape: str
    tag: Optional[str]
    tool_calls: Dict[str, int] = field(default_factory=dict)
    tool_cost: Dict[str, float] = field(default_factory=dict)


@dataclass
class Totals:
    total_cost: float
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    busts: int
    bust_cost: float
    cache_hit_ratio: float
    sessions: int
    turns: int


@dataclass
class Recommendation:
    id: str
    severity: str
    title: str
    body: str
    estimated_monthly_savings: float


@dataclass
class Analysis:
    schema_version: int
    generated_at: int
    range_start_ms: int
    range_end_ms: int
    sessions: List[Session]
    totals: Totals
    recommendations: List[Recommendation]


# --- public API ------------------------------------------------------------


def load_analysis(days: int = 30, ccmeter_bin: str = "ccmeter") -> Analysis:
    """Run ccmeter export and parse it into Python objects.

    Raises RuntimeError if ccmeter isn't installed or returns non-zero.
    """
    if shutil.which(ccmeter_bin) is None:
        raise RuntimeError(
            f"could not find `{ccmeter_bin}` on PATH. "
            "Install with: npm i -g ccmeter (or use `npx ccmeter`)."
        )
    proc = subprocess.run(
        [ccmeter_bin, "export", "--format", "json", "--days", str(days)],
        capture_output=True, text=True, check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ccmeter exited {proc.returncode}: {proc.stderr.strip()}")
    return _parse(json.loads(proc.stdout))


# --- internal: untyped JSON → typed dataclasses ----------------------------


def _parse(j: Dict[str, Any]) -> Analysis:
    return Analysis(
        schema_version=int(j.get("schemaVersion", 1)),
        generated_at=int(j.get("generatedAt", 0)),
        range_start_ms=int(j.get("rangeStartMs", 0)),
        range_end_ms=int(j.get("rangeEndMs", 0)),
        sessions=[_session(s) for s in j.get("sessions", [])],
        totals=_totals(j.get("totals", {})),
        recommendations=[_rec(r) for r in j.get("recommendations", [])],
    )


def _session(s: Dict[str, Any]) -> Session:
    return Session(
        id=s["id"],
        project_path=s.get("projectPath", ""),
        start_ms=int(s.get("startMs", 0)),
        end_ms=int(s.get("endMs", 0)),
        duration_ms=int(s.get("durationMs", 0)),
        primary_model=s.get("primaryModel", ""),
        turn_count=int(s.get("turnCount", 0)),
        tool_use_count=int(s.get("toolUseCount", 0)),
        cost=_cost(s.get("cost", {})),
        cache_busts=[_bust(b) for b in s.get("cacheBusts", [])],
        shape=s.get("shape", ""),
        tag=s.get("tag"),
        tool_calls=dict(s.get("toolCalls", {})),
        tool_cost={k: float(v) for k, v in s.get("toolCost", {}).items()},
    )


def _cost(c: Dict[str, Any]) -> Cost:
    return Cost(
        input_cost=float(c.get("inputCost", 0)),
        output_cost=float(c.get("outputCost", 0)),
        cache_write_cost=float(c.get("cacheWriteCost", 0)),
        cache_read_cost=float(c.get("cacheReadCost", 0)),
        total_cost=float(c.get("totalCost", 0)),
        input_tokens=int(c.get("inputTokens", 0)),
        output_tokens=int(c.get("outputTokens", 0)),
        cache_write_tokens=int(c.get("cacheWriteTokens", 0)),
        cache_read_tokens=int(c.get("cacheReadTokens", 0)),
        model=c.get("model", ""),
        cache_tier=c.get("cacheTier", "none"),
    )


def _bust(b: Dict[str, Any]) -> CacheBust:
    return CacheBust(
        ts=int(b.get("ts", 0)),
        tier=b.get("tier", "5m"),
        gap_seconds=float(b.get("gapSeconds", 0)),
        wasted_cost=float(b.get("wastedCost", 0)),
        session_id=b.get("sessionId", ""),
    )


def _totals(t: Dict[str, Any]) -> Totals:
    return Totals(
        total_cost=float(t.get("totalCost", 0)),
        input_tokens=int(t.get("inputTokens", 0)),
        output_tokens=int(t.get("outputTokens", 0)),
        cache_read_tokens=int(t.get("cacheReadTokens", 0)),
        cache_write_tokens=int(t.get("cacheWriteTokens", 0)),
        busts=int(t.get("busts", 0)),
        bust_cost=float(t.get("bustCost", 0)),
        cache_hit_ratio=float(t.get("cacheHitRatio", 0)),
        sessions=int(t.get("sessions", 0)),
        turns=int(t.get("turns", 0)),
    )


def _rec(r: Dict[str, Any]) -> Recommendation:
    return Recommendation(
        id=r.get("id", ""),
        severity=r.get("severity", "info"),
        title=r.get("title", ""),
        body=r.get("body", ""),
        estimated_monthly_savings=float(r.get("estimatedMonthlySavings", 0)),
    )


if __name__ == "__main__":
    import sys
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    a = load_analysis(days=days)
    print(f"ccmeter — last {days} days")
    print(f"  total spend:    ${a.totals.total_cost:.2f}")
    print(f"  sessions:       {a.totals.sessions}")
    print(f"  cache hit rate: {a.totals.cache_hit_ratio * 100:.1f}%")
    print(f"  busts:          {a.totals.busts} (wasted ${a.totals.bust_cost:.2f})")
    if a.recommendations:
        print("\n  top recommendation:")
        r = a.recommendations[0]
        print(f"    [{r.severity}] {r.title} (~${r.estimated_monthly_savings:.0f}/mo)")
