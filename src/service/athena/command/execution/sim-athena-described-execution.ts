import type { SimAthenaQueryExecution } from "../../execution/sim-athena-query-execution.js";
import { SimAthenaOutputLocation } from "../../execution/sim-athena-output-location.js";
import type { SimAthenaDescribedQueryExecution } from "./execution.command.js";

/**
 * One execution as `GetQueryExecution` answers with it.
 *
 * The result configuration names the object this query's results were written
 * to rather than the prefix they were written under, which is what real Athena
 * reports once a query has an execution id to name an object by.
 */
export function describedQueryExecution(
  execution: SimAthenaQueryExecution,
): SimAthenaDescribedQueryExecution {
  const location = new SimAthenaOutputLocation(execution.outputLocation);

  return {
    QueryExecutionId: execution.queryExecutionId,
    Query: execution.queryString,
    StatementType: "DML",
    WorkGroup: execution.workGroupName,
    QueryExecutionContext: {
      Database: execution.database,
      Catalog: execution.catalog,
    },
    ResultConfiguration: {
      OutputLocation: location.uriFor(execution.queryExecutionId),
    },
    Status: {
      State: execution.state,
      StateChangeReason: execution.stateChangeReason,
      SubmissionDateTime: execution.submittedAt,
      CompletionDateTime: execution.completedAt,
    },
    Statistics: {
      DataScannedInBytes: execution.bytesScanned,
      EngineExecutionTimeInMillis: executionMillis(execution),
      TotalExecutionTimeInMillis: executionMillis(execution),
    },
  };
}

/**
 * How long the query took, once it has finished.
 *
 * Simulated time is whatever the test's clock says, so a query that ran
 * between two ticks of a frozen clock took no time at all. That is the honest
 * answer rather than a made-up duration.
 */
function executionMillis(execution: SimAthenaQueryExecution): number {
  const completedAt = execution.completedAt;

  if (completedAt === undefined) {
    return 0;
  }

  return completedAt.getTime() - execution.submittedAt.getTime();
}
