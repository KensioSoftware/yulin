import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaQueryResults } from "../result/sim-athena-query-results.js";
import type { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";
import type { SimAthenaWorkGroupStore } from "../workgroup/sim-athena-work-group-store.js";
import type { SimAthenaQueryExecution } from "./sim-athena-query-execution.js";
import type { SimAthenaResultWriter } from "./sim-athena-result-writer.js";
import { simAthenaWriteFailureReason } from "./sim-athena-write-failure.js";

interface SimAthenaQueryRunnerProperties {
  readonly results: SimAthenaQueryResults;
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly writer: SimAthenaResultWriter;
  readonly background: BackgroundScheduler;
}

/**
 * Moves a query execution through its states on the background scheduler.
 *
 * A query is queued as soon as `StartQueryExecution` is answered and reaches
 * `RUNNING` on the simulator's background work, the way
 * `SimEcsServiceTaskStarter` schedules a task to reach `RUNNING`. Finishing is
 * scheduled again from there, so a caller polling `GetQueryExecution` sees
 * each state rather than a query that was already over by the time it looked.
 *
 * A query somebody stopped in between is left where it is. Nothing here brings
 * a settled execution back.
 */
export class SimAthenaQueryRunner {
  private readonly results: SimAthenaQueryResults;
  private readonly workGroups: SimAthenaWorkGroupStore;
  private readonly writer: SimAthenaResultWriter;
  private readonly background: BackgroundScheduler;

  constructor(properties: SimAthenaQueryRunnerProperties) {
    this.results = properties.results;
    this.workGroups = properties.workGroups;
    this.writer = properties.writer;
    this.background = properties.background;
  }

  /**
   * Run one queued execution, a state at a time.
   */
  run(
    execution: SimAthenaQueryExecution,
    caller: SimAwsCaller | undefined,
  ): void {
    this.background.schedule(() => {
      if (!execution.isSettled) {
        execution.start();
        this.scheduleFinish(execution, caller);
      }

      return Promise.resolve();
    });
  }

  private scheduleFinish(
    execution: SimAthenaQueryExecution,
    caller: SimAwsCaller | undefined,
  ): void {
    this.background.schedule(async () => {
      if (!execution.isSettled) {
        await this.finish(execution, caller);
      }
    });
  }

  private async finish(
    execution: SimAthenaQueryExecution,
    caller: SimAwsCaller | undefined,
  ): Promise<void> {
    const result = this.results.resultFor({
      queryString: execution.queryString,
      workGroupName: execution.workGroupName,
    });

    execution.recordBytesScanned(result.bytesScanned);

    const refusal = this.refusalFor(execution, result);

    if (refusal !== undefined) {
      execution.fail(refusal, this.background.now());

      return;
    }

    await this.write(execution, result, caller);
  }

  /**
   * Why this query cannot answer, where something says it cannot.
   *
   * The cutoff is checked against what the declaration says the query
   * scanned. That is the whole of the cost guardrail here, and it is the one
   * thing this simulation can enforce for real without a query engine.
   */
  private refusalFor(
    execution: SimAthenaQueryExecution,
    result: SimAthenaResolvedResult,
  ): string | undefined {
    if (result.failsWith !== undefined) {
      return result.failsWith;
    }

    const cutoff = this.workGroups.find(
      execution.workGroupName,
    )?.bytesScannedCutoffPerQuery;

    if (cutoff === undefined || result.bytesScanned <= cutoff) {
      return undefined;
    }

    return (
      `Bytes scanned limit was exceeded. The query scanned ` +
      `${String(result.bytesScanned)} bytes, and workgroup ` +
      `${execution.workGroupName} allows ${String(cutoff)} per query.`
    );
  }

  private async write(
    execution: SimAthenaQueryExecution,
    result: SimAthenaResolvedResult,
    caller: SimAwsCaller | undefined,
  ): Promise<void> {
    try {
      await this.writer.write(execution, result, caller);
    } catch (error) {
      execution.fail(simAthenaWriteFailureReason(error), this.background.now());

      return;
    }

    execution.succeed(result, this.background.now());
  }
}
