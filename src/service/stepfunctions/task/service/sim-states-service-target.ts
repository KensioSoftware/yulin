import type {
  JSONObject,
  JSONValue,
} from "../../../../util/type-guard/json.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import { SimStatesRuntimeFailure } from "../../error/sim-step-functions.error.js";
import {
  type SimStatesTaskRequest,
  SimStatesTaskTarget,
} from "../sim-states-task-target.js";
import {
  simStatesServiceResult,
  simStatesServiceRoute,
} from "./sim-states-service-call.js";
import { simStatesServiceFailure } from "./sim-states-service-failure.js";
import type { SimStatesServiceCall } from "./sim-states-service-shape.js";

/**
 * A `Task` state that calls an operation on a simulated service.
 *
 * Both integration forms end here. An `aws-sdk` integration sends its
 * `Parameters` as the request and answers with the response, and an optimized
 * integration is the same call with the request and the result shaped the way
 * that integration defines.
 *
 * The call reaches the simulated service the way an intercepted SDK client's
 * would, carrying the assumed execution role, so simulated IAM answers it
 * against the role's policies and the resource the request names.
 */
export class SimStatesServiceTarget extends SimStatesTaskTarget {
  readonly #call: SimStatesServiceCall;

  constructor(call: SimStatesServiceCall) {
    super();
    this.#call = call;
  }

  /**
   * Call the operation in the state machine's own Account and Region.
   */
  override async run(request: SimStatesTaskRequest): Promise<JSONValue> {
    const route = simStatesServiceRoute(request, this.#call);
    const input = this.parameters(request);

    let answered: unknown;

    try {
      answered = await route({ input }, { caller: request.caller });
    } catch (error) {
      throw this.handlerFailure(error, request.stateName);
    }

    const result = simStatesServiceResult(answered);

    return this.#call.shape?.answer?.(result) ?? result;
  }

  /**
   * A service refusing the call fails the task under the name Amazon States
   * Language gives that service's error.
   */
  override handlerFailure(error: unknown, stateName: string): Error {
    return simStatesServiceFailure(error, this.#call, stateName);
  }

  /**
   * Read the request the state's `Parameters` built.
   */
  private parameters(request: SimStatesTaskRequest): JSONObject {
    const { payload } = request;

    if (!isRecord(payload)) {
      throw new SimStatesRuntimeFailure(
        `The Task state ${request.stateName} calls ` +
          `${this.#call.operation} and built no request. Its Parameters are ` +
          "what the call is sent.",
      );
    }

    return this.#call.shape?.request?.(payload) ?? payload;
  }
}
