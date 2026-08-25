import { randomUUID } from "node:crypto";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";
import { SimAthenaQueryExecution } from "../../execution/sim-athena-query-execution.js";
import type { SimAthenaWorkGroup } from "../../workgroup/sim-athena-work-group.js";
import { queryOutputLocation } from "./sim-athena-query-output-location.js";
import type { SimStartQueryExecutionCommandInput } from "./execution.command.js";

/**
 * Build the execution one `StartQueryExecution` asks for.
 *
 * Everything a query cannot run without is refused here, before it is queued.
 * A caller that gets an execution id back has a query that will reach one of
 * the states it can end in rather than one that was never viable.
 */
export function startedQueryExecution(
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
