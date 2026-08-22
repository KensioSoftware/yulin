import { functionErrorDocument } from "../../lambda/command/invoke/invoke-payload.js";
import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import {
  SimStatesRuntimeFailure,
  SimStatesTaskFailure,
} from "../error/sim-step-functions.error.js";
import {
  SimStatesLambdaTarget,
  type SimStatesTaskCall,
} from "./sim-states-lambda-target.js";

/**
 * The `Resource` of the Lambda integration Step Functions optimises.
 */
export const simStatesLambdaInvokeResource = "arn:aws:states:::lambda:invoke";

/**
 * The two fields of the invocation this integration takes.
 */
export const simStatesLambdaInvokeParameters = [
  "FunctionName",
  "Payload",
] as const;

/**
 * A `Task` state invoking a function through `arn:aws:states:::lambda:invoke`.
 *
 * The state is talking to the Lambda API rather than to the function, so its
 * `Parameters` are an `Invoke` request and its result is an `Invoke` response.
 * That is the form CDK's `LambdaInvoke` emits by default.
 */
export class SimStatesLambdaInvokeTarget extends SimStatesLambdaTarget {
  /**
   * Read the `Invoke` request the state's `Parameters` built.
   */
  override call(payload: JSONValue, stateName: string): SimStatesTaskCall {
    if (!isRecord(payload)) {
      throw new SimStatesRuntimeFailure(
        `The Task state ${stateName} built no Invoke request. Its ` +
          "Parameters name the function to invoke.",
      );
    }

    const functionName = payload["FunctionName"];

    if (typeof functionName !== "string") {
      throw new SimStatesRuntimeFailure(
        `The Task state ${stateName} has a FunctionName that is not the ` +
          "name or ARN of a function.",
      );
    }

    return {
      functionNameOrArn: functionName,
      // A request carrying no Payload invokes the function with an empty
      // event, as an Invoke carrying no payload does.
      payload: payload["Payload"] ?? {},
    };
  }

  /**
   * Answer the way the Lambda API answers an `Invoke`.
   */
  override answer(result: JSONValue, executedVersion: string): JSONValue {
    return {
      ExecutedVersion: executedVersion,
      Payload: result,
      StatusCode: 200,
    };
  }

  /**
   * A handler raising fails the task under the name Step Functions gives a
   * task that failed, which is what a `Retry` or a `Catch` on this integration
   * matches.
   */
  override handlerFailure(error: unknown, stateName: string): Error {
    const document = functionErrorDocument(error);

    return new SimStatesTaskFailure(
      `The function the Task state ${stateName} invoked raised ` +
        `${document.errorType}: ${document.errorMessage}`,
    );
  }
}
