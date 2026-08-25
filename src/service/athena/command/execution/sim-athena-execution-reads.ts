import type { SimAthenaQueryExecutionStore } from "../../execution/sim-athena-query-execution-store.js";
import type { SimAthenaQueryExecution } from "../../execution/sim-athena-query-execution.js";
import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";
import type { SimAthenaAuthorizer } from "../authorize/sim-athena-authorizer.js";
import type { SimAthenaRequestOptions } from "../sim-athena-request-options.js";
import { describedQueryExecution } from "./sim-athena-described-execution.js";
import { queryResultsPage } from "./sim-athena-query-results-page.js";
import type {
  SimGetQueryExecutionCommand,
  SimGetQueryExecutionCommandOutput,
  SimGetQueryResultsCommand,
  SimGetQueryResultsCommandOutput,
} from "./execution.command.js";

interface SimAthenaExecutionReadsProperties {
  readonly executions: SimAthenaQueryExecutionStore;
  readonly authorizer: SimAthenaAuthorizer;
}

/**
 * The commands that read a query execution without changing it.
 */
export class SimAthenaExecutionReads {
  private readonly executions: SimAthenaQueryExecutionStore;
  private readonly authorizer: SimAthenaAuthorizer;

  constructor(properties: SimAthenaExecutionReadsProperties) {
    this.executions = properties.executions;
    this.authorizer = properties.authorizer;
  }

  /**
   * Report where a query has got to.
   *
   * This is what a client polls, and every state a query passes through is
   * visible here rather than only the one it ended in.
   */
  getQueryExecution(
    command: SimGetQueryExecutionCommand,
    options?: SimAthenaRequestOptions,
  ): SimGetQueryExecutionCommandOutput {
    const execution = this.required(command.input.QueryExecutionId);

    this.authorizer.authorizeWorkGroup(
      "athena:GetQueryExecution",
      execution.workGroupName,
      options,
    );

    return {
      $metadata: {},
      QueryExecution: describedQueryExecution(execution),
    };
  }

  /**
   * Read the rows a query answered.
   */
  getQueryResults(
    command: SimGetQueryResultsCommand,
    options?: SimAthenaRequestOptions,
  ): SimGetQueryResultsCommandOutput {
    const execution = this.required(command.input.QueryExecutionId);

    this.authorizer.authorizeWorkGroup(
      "athena:GetQueryResults",
      execution.workGroupName,
      options,
    );

    return queryResultsPage(execution, command.input);
  }

  private required(
    queryExecutionId: string | undefined,
  ): SimAthenaQueryExecution {
    if (queryExecutionId === undefined || queryExecutionId === "") {
      throw new SimAthenaInvalidRequestException(
        "QueryExecutionId is required",
      );
    }

    return this.executions.require(queryExecutionId);
  }
}
