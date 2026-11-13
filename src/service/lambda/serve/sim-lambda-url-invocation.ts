import { simLambdaInvokeRequestContext } from "../function/invoke/sim-lambda-invoke-request-context.js";
import {
  type SimLambdaResponseStream,
  SimLambdaStreamedResponse,
} from "../function/stream/sim-lambda-response-stream.js";
import { simLambdaUrlStreamedResponse } from "./response/sim-lambda-url-streamed-response.js";
import type { SimLambdaFunctionUrlRoute } from "./sim-lambda-url-router.js";

/**
 * Invoke the function a Function URL routes to, and answer with its response.
 *
 * A streaming handler's response is passed on as it is written when the URL's
 * `InvokeMode` is `RESPONSE_STREAM`, and all at once when it is `BUFFERED`.
 * Any other handler's result is a Function URL response object, which
 * `buffered` reads.
 */
export async function simLambdaUrlInvoked(
  route: SimLambdaFunctionUrlRoute,
  event: unknown,
  buffered: (result: unknown) => Response,
): Promise<Response> {
  const streaming = route.functionUrl.invokeMode === "RESPONSE_STREAM";
  const announced = Promise.withResolvers<SimLambdaResponseStream | null>();
  const invocation = simLambdaInvokeRequestContext.run(
    {
      logGroupName: route.simFunction.logGroupName,
      onResponseStream: streaming ? announced.resolve : undefined,
    },
    async () => route.simFunction.invoke(event, route.resource.arn),
  );
  void settled(invocation, () => {
    announced.resolve(null);
  });

  const stream = await announced.promise;

  if (stream !== null) {
    return await simLambdaUrlStreamedResponse(stream, invocation);
  }

  const result = await invocation;

  return result instanceof SimLambdaStreamedResponse
    ? await simLambdaUrlStreamedResponse(result.stream, invocation)
    : buffered(result);
}

/**
 * Call back once an invocation has settled, whichever way it went.
 */
async function settled(
  invocation: Promise<unknown>,
  callback: () => void,
): Promise<void> {
  try {
    await invocation;
  } catch {
    // The caller reads the failure from the invocation itself.
  } finally {
    callback();
  }
}
