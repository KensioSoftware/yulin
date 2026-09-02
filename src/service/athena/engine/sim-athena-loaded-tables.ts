import type { SimAthenaPlannedTable } from "../execution/sim-athena-query-refusal.js";
import type { SimAthenaEngineRun } from "./sim-athena-engine-run.js";
import {
  simAthenaTableRows,
  type SimAthenaLoadedTable,
} from "./sim-athena-table-rows.js";
import { simAthenaUnreadableFormat } from "./sim-athena-turn-down.js";

/**
 * Every table the query reads, loaded once each, or the reason one of them
 * could not be.
 *
 * A statement naming one table twice resolves to two entries, and loading each
 * of them would read the objects twice and then fail to create the table.
 */
export async function simAthenaLoadedTables(
  run: SimAthenaEngineRun,
): Promise<readonly SimAthenaLoadedTable[] | string> {
  const loaded = await Promise.all(
    distinctTables(run.tables).map(async (planned) => ({
      planned,
      rows: await simAthenaTableRows({
        planned,
        objects: run.objects,
        caller: run.caller,
      }),
    })),
  );
  const unread = loaded.find((one) => one.rows === undefined);

  if (unread !== undefined) {
    return simAthenaUnreadableFormat(unread.planned.table);
  }

  return loaded.flatMap((one) => one.rows ?? []);
}

function distinctTables(
  tables: readonly SimAthenaPlannedTable[],
): readonly SimAthenaPlannedTable[] {
  const seen = new Set<string>();

  return tables.filter((planned) => {
    const identity =
      `${planned.table.databaseName}.${planned.table.name}`.toLowerCase();

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);

    return true;
  });
}
