import type { SimAws } from "../aws/sim-aws.js";

/** What one query came to, as a test reads it back. */
export interface SimAthenaRanQuery {
  readonly state: string | undefined;
  readonly reason: string | undefined;
  readonly scanned: number | undefined;
}

/** Run one query to completion and read the execution back. */
export async function aRanQuery(
  simAws: SimAws,
  workGroup: string,
  queryString: string,
  caller?: { kind: "arn"; arn: string },
): Promise<SimAthenaRanQuery> {
  const started = await simAws
    .athena()
    .startQueryExecution(
      { input: { QueryString: queryString, WorkGroup: workGroup } },
      caller === undefined ? undefined : { caller },
    );

  await simAws.backgroundTasksComplete();

  const execution = await simAws.athena().getQueryExecution({
    input: { QueryExecutionId: started.QueryExecutionId },
  });

  return {
    state: execution.QueryExecution?.Status?.State,
    reason: execution.QueryExecution?.Status?.StateChangeReason,
    scanned: execution.QueryExecution?.Statistics?.DataScannedInBytes,
  };
}
