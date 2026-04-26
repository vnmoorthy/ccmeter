// Tiny config helper for the monthly budget. Stored at ~/.config/ccmeter/budget.json.

import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, getConfigDir } from "./paths.js";

export interface Budget {
  monthlyUsd: number;
  setAt: number;
}

export async function getBudget(): Promise<Budget | null> {
  const file = path.join(getConfigDir(), "budget.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const data = JSON.parse(raw);
    if (typeof data?.monthlyUsd === "number") return data as Budget;
    return null;
  } catch {
    return null;
  }
}

export async function setBudget(monthlyUsd: number): Promise<void> {
  await ensureDir(getConfigDir());
  const file = path.join(getConfigDir(), "budget.json");
  const b: Budget = { monthlyUsd, setAt: Date.now() };
  await fs.writeFile(file, JSON.stringify(b, null, 2));
}

export async function clearBudget(): Promise<void> {
  const file = path.join(getConfigDir(), "budget.json");
  try {
    await fs.unlink(file);
  } catch {
    /* ignore */
  }
}
