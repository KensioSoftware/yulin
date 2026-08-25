import type { SimAthenaResolvedResult } from "../../result/sim-athena-resolved-result.js";
import type {
  SimAthenaColumnInfo,
  SimAthenaResultSet,
  SimAthenaRow,
} from "./execution.command.js";

/**
 * Every row `GetQueryResults` carries, header first.
 *
 * Athena puts the column names in the first row of a `SELECT` result set and
 * the values after them, so a caller reading the rows has to skip one. That
 * catches people out often enough to be worth simulating rather than
 * smoothing over.
 */
export function queryResultRows(
  result: SimAthenaResolvedResult,
): readonly SimAthenaRow[] {
  const header = result.columns.map((column) => column.name);

  return [header, ...result.rows].map(resultRow);
}

/**
 * One page of results, with the columns they belong to.
 */
export function queryResultSet(
  result: SimAthenaResolvedResult,
  rows: readonly SimAthenaRow[],
): SimAthenaResultSet {
  return {
    Rows: rows,
    ResultSetMetadata: { ColumnInfo: result.columns.map(columnInfo) },
  };
}

function resultRow(values: readonly string[]): SimAthenaRow {
  return { Data: values.map((value) => ({ VarCharValue: value })) };
}

function columnInfo(column: {
  readonly name: string;
  readonly type?: string | undefined;
}): SimAthenaColumnInfo {
  return { Name: column.name, Type: column.type };
}
