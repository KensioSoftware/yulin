import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

/** What `approx_percentile` carries between rows. */
interface SimAthenaPercentileState {
  readonly values: number[];
  percentile: number;
}

/**
 * Trino's two approximate aggregates, computed exactly.
 *
 * Real Athena answers both from a sketch and this answers from the values
 * themselves, so the simulation is the more accurate of the two. At the scale
 * a test seeds that difference cannot show, and the alternative is a query
 * that refuses to run at all.
 *
 * The state travels as JSON because SQLite carries an aggregate's accumulator
 * as one of its own values rather than as an object.
 */
export function simAthenaInstallAggregateShims(database: DatabaseSync): void {
  database.aggregate("approx_distinct", {
    start: "[]",
    step: (accumulator: string, value: SQLOutputValue) => {
      const seen = new Set(JSON.parse(accumulator) as unknown[]);

      if (value !== null) {
        seen.add(typeof value === "bigint" ? String(value) : value);
      }

      return JSON.stringify([...seen]);
    },
    result: (accumulator: string) =>
      (JSON.parse(accumulator) as unknown[]).length,
  });

  database.aggregate("approx_percentile", {
    start: () => JSON.stringify({ values: [], percentile: 0.5 }),
    step: (accumulator: string, value: SQLOutputValue, at: SQLOutputValue) => {
      const state = JSON.parse(accumulator) as SimAthenaPercentileState;

      if (value !== null) {
        state.values.push(Number(value));
      }

      if (at !== null) {
        state.percentile = Number(at);
      }

      return JSON.stringify(state);
    },
    result: (accumulator: string) =>
      percentileOf(JSON.parse(accumulator) as SimAthenaPercentileState),
  });
}

/**
 * The nearest rank percentile, which is what Trino documents its own
 * approximation as converging on.
 */
function percentileOf(state: SimAthenaPercentileState): number | null {
  if (state.values.length === 0) {
    return null;
  }

  const sorted = state.values.toSorted((one, other) => one - other);
  const index = Math.min(
    sorted.length - 1,
    Math.floor(state.percentile * sorted.length),
  );

  return sorted.at(index) ?? null;
}
