import { Likelihood, OracleTable, OracleState } from './storage';
import React, { useEffect, useMemo, useState } from "react";
import { loadLoreTable, rollD6, rollFrom, LoreTableData } from "../core/loreTable";

export function weightedPick(entries: { text: string; weight?: number }[]): string {
  if (!entries.length) return '(empty table)';
  const weights = entries.map(e => Math.max(0, e.weight ?? 1));
  const total = weights.reduce((a,b)=>a+b,0);
  if (total <= 0) return entries[0]!.text;
  let r = Math.random() * total;
  for (let i=0;i<entries.length;i++){
    r -= weights[i]!;
    if (r <= 0) return entries[i]!.text;
  }
  return entries[entries.length-1]!.text;
}

// Generic "ask the oracle" engine.
// You will configure thresholds to match Strider Mode exactly in Settings.
export function askOracle(state: OracleState, likelihood: Likelihood): { roll: number; answer: 'Yes'|'No'|'Maybe' } {
  const t = state.likelihood[likelihood];
  const roll = Math.floor(Math.random() * 100) + 1; // 1-100
  if (roll <= t.yes) return { roll, answer: 'Yes' };
  if (roll <= t.maybe) return { roll, answer: 'Maybe' };
  return { roll, answer: 'No' };
}

export function findTable(state: OracleState, id: string): OracleTable | undefined {
  return state.tables.find(t => t.id === id);
}

export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}
