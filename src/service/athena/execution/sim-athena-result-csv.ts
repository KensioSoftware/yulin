import type { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";

/**
 * One query's result set as the CSV Athena writes to S3.
 *
 * Athena quotes every field of a CSV result rather than only the ones that
 * need it, and it writes the column names as the first line. A caller reading
 * the object back gets the header whether or not it asked for one, which is
 * the same thing `GetQueryResults` does with its first row.
 */
export function simAthenaResultCsv(result: SimAthenaResolvedResult): string {
  const header = result.columns.map((column) => column.name);
  const lines = [header, ...result.rows].map(csvLine);

  return `${lines.join("\n")}\n`;
}

function csvLine(values: readonly string[]): string {
  return values.map(csvField).join(",");
}

function csvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
