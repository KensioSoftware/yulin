import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { JSONValue } from "../../../util/type-guard/json.js";

/**
 * One `Task` state's work, as the target receives it.
 */
export interface SimStatesTaskRequest {
  readonly stateName: string;

  /**
   * What the state's `InputPath` and `Parameters` produced. That is the
   * request the target sends.
   */
  readonly payload: JSONValue;

  /**
   * The state machine's execution role, already assumed. Everything the task
   * reaches, it reaches as this.
   */
  readonly caller: SimAwsCaller;

  /**
   * The whole simulation, because a task can reach another Account or Region.
   */
  readonly simAws: SimAws;

  /**
   * The state machine's own Account and Region. A target naming no other one
   * does its work there.
   */
  readonly scope: SimAwsAccountRegionScope;
}

/**
 * What a `Task` state's `Resource` named.
 *
 * The `Resource` forms differ in what they call, what the state gets back and
 * what a failure is called, and this is each of them. What is the same for all
 * of them is around this: the execution role is assumed once per invocation,
 * and the data-flow fields build the request and shape the result.
 */
export abstract class SimStatesTaskTarget {
  /**
   * Do the task's work, as the execution role, and answer with the result the
   * state carries on with.
   */
  abstract run(request: SimStatesTaskRequest): Promise<JSONValue>;

  /**
   * What a failure the work raised is called.
   *
   * The Amazon States Language error name is read here rather than where the
   * failure is recorded, because each `Resource` form reports the same failure
   * differently and `Retry` and `Catch` match on exactly that name.
   */
  abstract handlerFailure(error: unknown, stateName: string): Error;
}
