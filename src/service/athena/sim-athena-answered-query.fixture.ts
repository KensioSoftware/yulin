import type { SimAthenaAnswerSource } from "./result/sim-athena-query-answer.js";
import type { SimAthenaEngineSimulation } from "./sim-athena-engine.fixture.js";

/** What one query came to, as a test reads it back. */
export interface SimAthenaEngineQuery {
  readonly state: string | undefined;
  readonly answeredBy: SimAthenaAnswerSource | undefined;
  readonly columns: readonly (string | undefined)[];
  readonly rows: readonly (readonly (string | undefined)[])[];
}

/** Run one query to completion and read its result set back. */
export async function anAnsweredQuery(
  simulation: SimAthenaEngineSimulation,
  queryString: string,
  database?: string,
): Promise<SimAthenaEngineQuery> {
  const athena = simulation.simAws.athena();
  const started = await athena.startQueryExecution({
    input: {
      QueryString: queryString,
      WorkGroup: simulation.workGroup,
      ...(database !== undefined && {
        QueryExecutionContext: { Database: database },
      }),
    },
  });

  await simulation.simAws.backgroundTasksComplete();

  const id = started.QueryExecutionId;
  const execution = athena
    .queryExecutions()
    .find((one) => one.queryExecutionId === id);
  const answered = {
    state: execution?.state,
    answeredBy: execution?.answeredBy,
  };

  if (execution?.state !== "SUCCEEDED") {
    return { ...answered, columns: [], rows: [] };
  }

  const results = await athena.getQueryResults({
    input: { QueryExecutionId: id },
  });
  const set = results.ResultSet;

  return {
    ...answered,
    columns: (set?.ResultSetMetadata?.ColumnInfo ?? []).map(
      (column) => column.Type,
    ),
    rows: (set?.Rows ?? [])
      .slice(1)
      .map((row) => (row.Data ?? []).map((cell) => cell.VarCharValue)),
  };
}
