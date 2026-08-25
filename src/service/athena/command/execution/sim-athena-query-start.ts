import { randomUUID } from "node:crypto";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";
import { SimAthenaQueryExecution } from "../../execution/sim-athena-query-execution.js";
import type { SimAthenaWorkGroup } from "../../workgroup/sim-athena-work-group.js";
import type { SimAthenaQueryExecutionStore } from "../../execution/sim-athena-query-execution-store.js";
import type { SimAthenaQueryRunner } from "../../execution/sim-athena-query-runner.js";
import type { SimAthenaQueryTokens } from "../../execution/sim-athena-query-tokens.js";
import type { SimAthenaWorkGroupStore } from "../../workgroup/sim-athena-work-group-store.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { queryOutputLocation } from "./sim-athena-query-output-location.js";
import type {
  SimStartQueryExecutionCommandInput,
  SimStartQueryExecutionCommandOutput,
} from "./execution.command.js";

interface SimAthenaQueryStartProperties {
  readonly executions: SimAthenaQueryExecutionStore;
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly runner: SimAthenaQueryRunner;
  readonly tokens: SimAthenaQueryTokens;
  readonly clock: SimClock;
}

/**
 * Queue one query, or answer with the one its token already started.
 *
 * A repeated `ClientRequestToken` answers with the execution it started the
 * first time rather than running the query again, which is what stops a
 * client's retry after a timeout being charged twice.
 */
export function startQuery(
  properties: SimAthenaQueryStartProperties,
  workGroupName: string,
  input: SimStartQueryExecutionCommandInput,
  caller: SimAwsCaller | undefined,
): SimStartQueryExecutionCommandOutput {
  const { executions, workGroups, runner, tokens, clock } = properties;
  const already = tokens.startedBy(
    input.ClientRequestToken,
    String(input.QueryString),
  );

  if (already !== undefined) {
    return { $metadata: {}, QueryExecutionId: already };
  }

  const execution = startedQueryExecution(
    workGroups.require(workGroupName),
    input,
    clock,
  );

  tokens.record(
    input.ClientRequestToken,
    execution.queryString,
    execution.queryExecutionId,
  );
  executions.put(execution);
  runner.run(execution, caller);

  return { $metadata: {}, QueryExecutionId: execution.queryExecutionId };
}

/**
 * Build the execution one `StartQueryExecution` asks for.
 *
 * Everything a query cannot run without is refused here, before it is queued.
 * A caller that gets an execution id back has a query that will reach one of
 * the states it can end in rather than one that was never viable.
 */
function startedQueryExecution(
  workGroup: SimAthenaWorkGroup,
  input: SimStartQueryExecutionCommandInput,
  clock: SimClock,
): SimAthenaQueryExecution {
  refuseDisabledWorkGroup(workGroup);

  return new SimAthenaQueryExecution({
    queryExecutionId: randomUUID(),
    queryString: requiredQueryString(input.QueryString),
    workGroupName: workGroup.name,
    outputLocation: queryOutputLocation(workGroup, input.ResultConfiguration),
    submittedAt: clock.now(),
    database: input.QueryExecutionContext?.Database,
    catalog: input.QueryExecutionContext?.Catalog,
  });
}

function requiredQueryString(queryString: string | undefined): string {
  if (queryString === undefined || queryString.trim() === "") {
    throw new SimAthenaInvalidRequestException("QueryString is required");
  }

  return queryString;
}

/**
 * Refuse a query in a workgroup that is turned off.
 *
 * Real Athena refuses one, and a stack disabling a workgroup to stop it
 * costing anything wants that proved rather than assumed.
 */
function refuseDisabledWorkGroup(workGroup: SimAthenaWorkGroup): void {
  if (workGroup.state === "DISABLED") {
    throw new SimAthenaInvalidRequestException(
      `WorkGroup ${workGroup.name} is disabled, and takes no queries.`,
    );
  }
}
