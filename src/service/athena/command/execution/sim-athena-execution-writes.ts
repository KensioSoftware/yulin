import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";
import type { SimAthenaQueryExecutionStore } from "../../execution/sim-athena-query-execution-store.js";
import type { SimAthenaQueryRunner } from "../../execution/sim-athena-query-runner.js";
import { requestedWorkGroupName } from "../../workgroup/sim-athena-work-group-name.js";
import type { SimAthenaWorkGroupStore } from "../../workgroup/sim-athena-work-group-store.js";
import type { SimAthenaAuthorizer } from "../authorize/sim-athena-authorizer.js";
import type { SimAthenaRequestOptions } from "../sim-athena-request-options.js";
import { startedQueryExecution } from "./sim-athena-query-start.js";
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
   */
  startQueryExecution(
    command: SimStartQueryExecutionCommand,
    options?: SimAthenaRequestOptions,
  ): SimStartQueryExecutionCommandOutput {
    const { executions, workGroups, runner, authorizer, clock } =
      this.#properties;
    const input = command.input;
    const workGroupName = requestedWorkGroupName(input.WorkGroup);

    authorizer.authorizeWorkGroup(
      "athena:StartQueryExecution",
      workGroupName,
      options,
    );

    const execution = startedQueryExecution(
      workGroups.require(workGroupName),
      input,
      clock,
    );

    executions.put(execution);
    runner.run(execution, options?.caller);

    return { $metadata: {}, QueryExecutionId: execution.queryExecutionId };
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
    const queryExecutionId = command.input.QueryExecutionId;

    if (queryExecutionId === undefined || queryExecutionId === "") {
      throw new SimAthenaInvalidRequestException(
        "QueryExecutionId is required",
      );
    }

    const execution = executions.require(queryExecutionId);

    authorizer.authorizeWorkGroup(
      "athena:StopQueryExecution",
      execution.workGroupName,
      options,
    );

    if (!execution.isSettled) {
      execution.cancel(clock.now());
    }

    return { $metadata: {} };
  }
}
