import { functionErrorDocument } from "../../lambda/command/invoke/invoke-payload.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesTaskHandlerFailure } from "../error/sim-step-functions.error.js";
import {
  SimStatesLambdaTarget,
  type SimStatesTaskCall,
} from "./sim-states-lambda-target.js";

interface SimStatesFunctionArnTargetProperties {
  readonly functionArn: string;
}

/**
 * A `Task` state whose `Resource` is a function ARN.
 *
 * The state is talking to the function rather than to the Lambda API, so what
 * it sends is its own input and what it gets back is what the handler
 * answered. CDK's `LambdaInvoke` emits this form for `payloadResponseOnly`.
 */
export class SimStatesFunctionArnTarget extends SimStatesLambdaTarget {
  readonly #functionArn: string;

  constructor(properties: SimStatesFunctionArnTargetProperties) {
    super();
    this.#functionArn = properties.functionArn;
  }

  /**
   * Send the state's own input to the function the `Resource` named.
   */
  override call(payload: JSONValue): SimStatesTaskCall {
    return { functionNameOrArn: this.#functionArn, payload };
  }

  /**
   * Answer with what the handler answered, with nothing around it.
   */
  override answer(result: JSONValue): JSONValue {
    return result;
  }

  /**
   * A handler raising fails the task under the handler's own error type, which
   * is the name a `Retry` or a `Catch` on this form matches.
   */
  override handlerFailure(error: unknown, stateName: string): Error {
    const document = functionErrorDocument(error);

    return new SimStatesTaskHandlerFailure(
      `The function the Task state ${stateName} invoked raised ` +
        `${document.errorType}: ${document.errorMessage}`,
      document.errorType,
    );
  }
}
