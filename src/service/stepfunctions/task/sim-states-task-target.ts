import type { JSONValue } from "../../../util/type-guard/json.js";

/**
 * The function one `Task` state invocation names, and what it sends.
 */
export interface SimStatesTaskCall {
  readonly functionNameOrArn: string;
  readonly payload: JSONValue;
}

/**
 * What a `Task` state's `Resource` named.
 *
 * The two forms a `Task` state invokes a function through differ in three
 * places, and this is each of them: which function the state is talking to,
 * what the state gets back, and what a handler raising is called. Everything
 * between those, from assuming the execution role to running the handler, is
 * the same for both.
 */
export abstract class SimStatesTaskTarget {
  /**
   * The function to invoke and the payload to send it, read from what the
   * state's data-flow fields produced.
   */
  abstract call(payload: JSONValue, stateName: string): SimStatesTaskCall;

  /**
   * The result the state produces from what the handler answered.
   */
  abstract answer(result: JSONValue, executedVersion: string): JSONValue;

  /**
   * What a handler raising fails the task with.
   *
   * The Amazon States Language error name is read here rather than where the
   * failure is recorded, because the two forms report a handler error
   * differently and `Retry` and `Catch` match on exactly that name.
   */
  abstract handlerFailure(error: unknown, stateName: string): Error;
}
