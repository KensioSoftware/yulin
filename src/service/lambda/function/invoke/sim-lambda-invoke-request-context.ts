import { AsyncLocalStorage } from "node:async_hooks";

import type { SimLambdaResponseStream } from "../stream/sim-lambda-response-stream.js";

/**
 * What a synchronous Invoke request asks of the invocation it starts, beyond
 * the event.
 */
export interface SimLambdaInvokeRequest {
  /** The log group of the function the request invokes. */
  readonly logGroupName: string;

  /** The `ClientContext` the request carried, decoded. */
  readonly clientContext?: unknown;

  /**
   * Where the invocation's log output is collected, for a request asking for
   * `LogType: "Tail"`.
   */
  readonly tail?: string[] | undefined;

  /**
   * Follow the response stream of a streaming handler as it is written, for a
   * Function URL in `RESPONSE_STREAM` mode.
   */
  readonly onResponseStream?:
    | ((stream: SimLambdaResponseStream) => void)
    | undefined;
}

const storage = new AsyncLocalStorage<SimLambdaInvokeRequest>();

/**
 * The Invoke request an invocation is running for, tracked with Node.js
 * asynchronous context tracking.
 *
 * The request reaches the handler's context and the function's log writer
 * this way, without passing through every layer between the Invoke command and
 * the invocation. Both read it by log group. A handler that invokes another
 * function inherits the outer request's context, and the other function's log
 * group keeps the outer request from reaching it.
 */
export const simLambdaInvokeRequestContext = {
  /**
   * Run an invocation for a request.
   */
  async run<T>(
    request: SimLambdaInvokeRequest,
    invocation: () => Promise<T>,
  ): Promise<T> {
    return await storage.run(request, invocation);
  },

  /**
   * The request the current invocation of a function is running for, if one
   * asked for anything.
   */
  of(logGroupName: string): SimLambdaInvokeRequest | undefined {
    const request = storage.getStore();

    return request?.logGroupName === logGroupName ? request : undefined;
  },
};
