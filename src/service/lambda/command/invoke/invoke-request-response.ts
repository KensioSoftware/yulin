import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import { simLambdaInvokeRequestContext } from "../../function/invoke/sim-lambda-invoke-request-context.js";
import {
  functionErrorPayload,
  parseInvokeEvent,
  resultPayload,
  sizedResponse,
} from "./invoke-payload.js";
import {
  simLambdaInvokeRequestOf,
  simLambdaLogResult,
} from "./invoke-request.js";
import type {
  SimInvokeCommand,
  SimInvokeCommandOutput,
} from "./invoke.command.js";

/**
 * Run a RequestResponse invocation and build the Invoke output, telling the
 * handler the ARN the request named as its `invokedFunctionArn`.
 *
 * A handler error is answered as a function error in the payload, as on real
 * Lambda. A throttle is thrown, since nothing ran.
 */
export async function simLambdaRequestResponse(
  simFunction: SimLambdaFunction,
  command: SimInvokeCommand,
  invokedFunctionArn: string,
): Promise<SimInvokeCommandOutput> {
  // Read before the attempt, so a payload that is not JSON reaches the
  // caller as a request error rather than as a handler failure.
  const event = parseInvokeEvent(command.input.Payload);
  const request = simLambdaInvokeRequestOf(
    command.input,
    simFunction.logGroupName,
  );

  const refusalsBefore = simFunction.concurrency.refusals;
  const invocation = simLambdaInvokeRequestContext.run(request, async () =>
    simFunction.invoke(event, invokedFunctionArn),
  );
  // Read straight after starting: the reservation turns an invocation away
  // before anything awaits, so a refusal counted here is this invocation's.
  const refused = simFunction.concurrency.refusals > refusalsBefore;
  const answered = {
    $metadata: {},
    StatusCode: 200,
    ExecutedVersion: simFunction.version,
  };

  try {
    const payload = resultPayload(await invocation);

    return {
      ...answered,
      ...simLambdaLogResult(request),
      ...sizedResponse(payload, undefined),
    };
  } catch (error) {
    // A throttled invocation never ran, so real Lambda refuses the request
    // rather than reporting a function error. A throttle the handler met
    // while invoking another function is that handler's own error.
    if (refused) {
      throw error;
    }

    return {
      ...answered,
      ...simLambdaLogResult(request),
      ...sizedResponse(functionErrorPayload(error), "Unhandled"),
    };
  }
}
