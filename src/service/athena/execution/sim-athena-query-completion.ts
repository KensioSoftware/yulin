import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { simAthenaQueryAnswer } from "../result/sim-athena-query-answer.js";
import { simAthenaQueryOutcome } from "./sim-athena-query-outcome.js";
import type { SimAthenaQueryExecution } from "./sim-athena-query-execution.js";
import type { SimAthenaQueryRunnerProperties } from "./sim-athena-query-runner-properties.js";
import { simAthenaWriteFailureReason } from "./sim-athena-write-failure.js";

interface SimAthenaQueryCompletionRequest {
  readonly execution: SimAthenaQueryExecution;
  readonly caller: SimAwsCaller | undefined;
  readonly runner: SimAthenaQueryRunnerProperties;
}

/**
 * Finish one running query.
 *
 * The order is the one real Athena reaches each question in. The query is
 * planned and measured, the cutoff is checked against that measurement, and
 * only a query that got past all three goes on to be answered and written.
 *
 * A write that fails leaves the execution `FAILED` rather than raising at a
 * caller who was answered long ago and has gone away to poll.
 */
export async function simAthenaCompleteQuery(
  request: SimAthenaQueryCompletionRequest,
): Promise<void> {
  const { execution, caller, runner } = request;
  const declared = runner.results.resultFor({
    queryString: execution.queryString,
    workGroupName: execution.workGroupName,
  });

  const outcome = await simAthenaQueryOutcome({
    execution,
    result: declared,
    workGroups: runner.workGroups,
    catalog: runner.catalog,
    objects: runner.objects,
    caller,
    now: runner.background.now(),
  });

  execution.recordBytesScanned(outcome.bytesScanned);

  if (outcome.refusal !== undefined) {
    execution.fail(outcome.refusal, runner.background.now());

    return;
  }

  const answer = await simAthenaQueryAnswer({
    queryString: execution.queryString,
    sessionDatabase: execution.database,
    declared,
    results: runner.results,
    engine: runner.engine,
    tables: outcome.tables,
    objects: runner.tableObjects,
    caller,
  });

  try {
    await runner.writer.write(execution, answer.result, caller);
  } catch (error) {
    execution.fail(simAthenaWriteFailureReason(error), runner.background.now());

    return;
  }

  execution.succeed(answer.result, answer.source, runner.background.now());
}
