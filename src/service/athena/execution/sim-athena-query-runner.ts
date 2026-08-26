import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { simAthenaCompleteQuery } from "./sim-athena-query-completion.js";
import type { SimAthenaQueryExecution } from "./sim-athena-query-execution.js";
import type { SimAthenaQueryRunnerProperties } from "./sim-athena-query-runner-properties.js";

/**
 * Moves a query execution through its states on the background scheduler.
 *
 * A query is queued as soon as `StartQueryExecution` is answered and reaches
 * `RUNNING` on the simulator's background work, the way
 * `SimEcsServiceTaskStarter` schedules a task to reach `RUNNING`. Finishing is
 * scheduled again from there, so a caller polling `GetQueryExecution` sees each
 * state rather than a query that was already over by the time it looked.
 *
 * A query somebody stopped in between is left where it is. Nothing here brings
 * a settled execution back.
 */
export class SimAthenaQueryRunner {
  readonly #properties: SimAthenaQueryRunnerProperties;

  constructor(properties: SimAthenaQueryRunnerProperties) {
    this.#properties = properties;
  }

  /**
   * Run one queued execution, a state at a time.
   */
  run(
    execution: SimAthenaQueryExecution,
    caller: SimAwsCaller | undefined,
  ): void {
    this.#properties.background.schedule(() => {
      if (!execution.isSettled) {
        execution.start();
        this.#scheduleFinish(execution, caller);
      }

      return Promise.resolve();
    });
  }

  #scheduleFinish(
    execution: SimAthenaQueryExecution,
    caller: SimAwsCaller | undefined,
  ): void {
    this.#properties.background.schedule(async () => {
      if (!execution.isSettled) {
        await simAthenaCompleteQuery({
          execution,
          caller,
          runner: this.#properties,
        });
      }
    });
  }
}
