import type { JSONValue } from "../../../util/type-guard/json.js";
import { simStatesFunctionLocation } from "./sim-states-function-location.js";
import { SimStatesTaskFunction } from "./sim-states-task-function.js";
import {
  type SimStatesTaskRequest,
  SimStatesTaskTarget,
} from "./sim-states-task-target.js";

/**
 * The function one `Task` state invocation names, and what it sends.
 */
export interface SimStatesTaskCall {
  readonly functionNameOrArn: string;
  readonly payload: JSONValue;
}

/**
 * A `Task` state whose work is a Lambda function.
 *
 * The two forms a state invokes a function through agree on everything the
 * invocation itself does. They differ in which function is named, what the
 * state gets back and what a handler raising is called, and a subclass says
 * which.
 *
 * The function is looked up when the task runs rather than when the state
 * machine was created, so an alias moved to another version moves what runs
 * and a permission taken away stops the task.
 */
export abstract class SimStatesLambdaTarget extends SimStatesTaskTarget {
  /**
   * Invoke the function in its own Account and Region, which need not be the
   * state machine's.
   */
  override async run(request: SimStatesTaskRequest): Promise<JSONValue> {
    const { stateName } = request;
    const call = this.call(request.payload, stateName);
    const where = simStatesFunctionLocation(
      call.functionNameOrArn,
      request.scope,
      stateName,
    );

    return await new SimStatesTaskFunction({
      scope: request.simAws.accountRegionScope(
        where.accountId,
        where.regionName,
      ),
    }).invoke({
      stateName,
      target: this,
      reference: where.reference,
      named: call.functionNameOrArn,
      payload: call.payload,
      caller: request.caller,
    });
  }

  /**
   * The function to invoke and the payload to send it, read from what the
   * state's data-flow fields produced.
   */
  abstract call(payload: JSONValue, stateName: string): SimStatesTaskCall;

  /**
   * The result the state produces from what the handler answered.
   */
  abstract answer(result: JSONValue, executedVersion: string): JSONValue;
}
