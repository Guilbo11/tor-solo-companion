export type LoreRow = { d6: number; action: string; aspect: string; focus: string };
export type LoreTableData = {
  id: string;
  label: string;
  version: string;
  tables: Record<string, LoreRow[]>;
};

export async function loadLoreTable(): Promise<LoreTableData> {
  const url = `${import.meta.env.BASE_URL}data/lore-table.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load lore table (${res.status})`);
  return res.json();
}

export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function rollFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
