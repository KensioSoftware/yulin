import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAthenaQueryExecutionStore } from "../../execution/sim-athena-query-execution-store.js";
import type { SimAthenaQueryRunner } from "../../execution/sim-athena-query-runner.js";
import type { SimAthenaQueryTokens } from "../../execution/sim-athena-query-tokens.js";
import { requestedWorkGroupName } from "../../workgroup/sim-athena-work-group-name.js";
import type { SimAthenaWorkGroupStore } from "../../workgroup/sim-athena-work-group-store.js";
import type { SimAthenaAuthorizer } from "../authorize/sim-athena-authorizer.js";
import type { SimAthenaRequestOptions } from "../sim-athena-request-options.js";
import { startQuery } from "./sim-athena-query-start.js";
import { stopQuery } from "./sim-athena-query-stop.js";
import type {
  SimStartQueryExecutionCommand,
  SimStartQueryExecutionCommandOutput,
  SimStopQueryExecutionCommand,
  SimStopQueryExecutionCommandOutput,
} from "./execution.command.js";

interface SimAthenaExecutionWritesProperties {
  readonly executions: SimAthenaQueryExecutionStore;
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly runner: SimAthenaQueryRunner;
  readonly tokens: SimAthenaQueryTokens;
  readonly authorizer: SimAthenaAuthorizer;
  readonly clock: SimClock;
}

/**
 * The commands that start and stop a query execution.
 */
export class SimAthenaExecutionWrites {
  readonly #properties: SimAthenaExecutionWritesProperties;

  constructor(properties: SimAthenaExecutionWritesProperties) {
    this.#properties = properties;
  }

  /**
   * Queue a query, and answer with the id everything else names it by.
   *
   * The query is queued rather than run. Whatever it answers with happens on
   * the background scheduler, so a caller polling sees it queued first, as it
   * would on real Athena.
   *
   * A repeated `ClientRequestToken` answers with the execution it started the
   * first time rather than running the query again.
   */
  startQueryExecution(
    command: SimStartQueryExecutionCommand,
    options?: SimAthenaRequestOptions,
  ): SimStartQueryExecutionCommandOutput {
    const input = command.input;
    const workGroupName = requestedWorkGroupName(input.WorkGroup);

    this.#properties.authorizer.authorizeWorkGroup(
      "athena:StartQueryExecution",
      workGroupName,
      options,
    );

    return startQuery(this.#properties, workGroupName, input, options?.caller);
  }

  /**
   * Give up on a query that has not finished.
   *
   * A query that already settled is left alone. Real Athena answers a stop
   * that arrived too late without changing anything, rather than failing.
   */
  stopQueryExecution(
    command: SimStopQueryExecutionCommand,
    options?: SimAthenaRequestOptions,
  ): SimStopQueryExecutionCommandOutput {
    const { executions, authorizer, clock } = this.#properties;

    stopQuery(
      executions,
      command.input.QueryExecutionId,
      clock,
      (execution) => {
        authorizer.authorizeWorkGroup(
          "athena:StopQueryExecution",
          execution.workGroupName,
          options,
        );
      },
    );

    return { $metadata: {} };
  }
}
