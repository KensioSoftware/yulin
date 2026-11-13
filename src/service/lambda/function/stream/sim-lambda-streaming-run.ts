import { finished } from "node:stream/promises";

import type { SimLambdaInvokeContextBuilder } from "../invoke/sim-lambda-invoke-context-builder.js";
import { simLambdaInvokeRequestContext } from "../invoke/sim-lambda-invoke-request-context.js";
import type { SimLambdaContext } from "../sim-lambda-handler.type.js";
import {
  SimLambdaResponseStream,
  SimLambdaStreamedResponse,
} from "./sim-lambda-response-stream.js";

type SimLambdaStreamingHandler = (
  event: unknown,
  responseStream: SimLambdaResponseStream,
  context: SimLambdaContext,
) => unknown;

/**
 * Run a handler wrapped in `awslambda.streamifyResponse` to the end of its
 * response.
 *
 * The handler is given a response stream where another handler gets its
 * context, and the context third. The response is over once the handler has
 * finished and the stream has ended. A handler that finishes without ending
 * the stream has it ended for it, as the real runtime does. A handler that
 * destroys its stream with an error fails the invocation with it. A request
 * following the stream is handed it before the handler runs.
 */
export async function simLambdaStreamingRun(
  handler: unknown,
  event: unknown,
  contextBuilder: SimLambdaInvokeContextBuilder,
): Promise<SimLambdaStreamedResponse> {
  const stream = new SimLambdaResponseStream();
  // A handler destroying its stream with an error is read from `finished`
  // below. Without a listener the error would be thrown from the event.
  stream.on("error", () => {
    // Reported through `finished`.
  });
  const context = contextBuilder.build(() => {
    // A streaming handler answers through its stream, never this callback.
  });
  simLambdaInvokeRequestContext
    .of(context.logGroupName)
    ?.onResponseStream?.(stream);

  try {
    await (handler as SimLambdaStreamingHandler)(event, stream, context);
  } catch (error) {
    stream.destroy();
    throw error;
  }

  if (!stream.writableEnded) {
    stream.end();
  }
  await finished(stream);

  return new SimLambdaStreamedResponse(stream);
}
