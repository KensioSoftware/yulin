import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";
import type { SimAthenaQueryExecution } from "../../execution/sim-athena-query-execution.js";
import { SimAthenaPage } from "../sim-athena-page.js";
import { queryResultRows, queryResultSet } from "./sim-athena-query-rows.js";
import type {
  SimGetQueryResultsCommandInput,
  SimGetQueryResultsCommandOutput,
} from "./execution.command.js";

/**
 * The most rows one `GetQueryResults` carries.
 *
 * This paging is over rows rather than resources, and Athena lets it go far
 * past the 50 a listing of workgroups or named queries stops at.
 */
const maximumResultRows = 1000;

/**
 * One page of a finished query's rows.
 *
 * A query that has not succeeded has no rows to read, which real Athena
 * refuses rather than answering with nothing.
 */
export function queryResultsPage(
  execution: SimAthenaQueryExecution,
  input: SimGetQueryResultsCommandInput,
): SimGetQueryResultsCommandOutput {
  const result = execution.result;

  if (result === undefined) {
    throw new SimAthenaInvalidRequestException(
      `Query ${execution.queryExecutionId} has not yet finished. Its ` +
        `current state is ${execution.state}.`,
    );
  }

  const page = new SimAthenaPage({
    listed: queryResultRows(result),
    maxResults: input.MaxResults,
    nextToken: input.NextToken,
    minimumResults: 0,
    maximumResults: maximumResultRows,
  });

  return {
    $metadata: {},
    ResultSet: queryResultSet(result, page.items),
    NextToken: page.nextToken,
  };
}
