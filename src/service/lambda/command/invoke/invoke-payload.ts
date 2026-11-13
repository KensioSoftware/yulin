import {
  SimLambdaError,
  SimLambdaInvalidRequestContentException,
} from "../../error/sim-lambda.error.js";
import { SimLambdaRequestTooLargeException } from "../../error/sim-lambda-invoke.error.js";
import { SimLambdaStreamedResponse } from "../../function/stream/sim-lambda-response-stream.js";
import type { SimInvokePayload } from "./invoke.command.js";

/**
 * How a handler error is described to a caller and to a destination.
 */
export interface SimLambdaErrorDocument {
  readonly errorType: string;
  readonly errorMessage: string;
  readonly trace: readonly string[];
}

function payloadText(payload: SimInvokePayload): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload instanceof Uint8Array) {
    return Buffer.from(payload).toString();
  }
  throw new SimLambdaError(
    "Sim Lambda only supports string and Uint8Array Invoke payloads",
  );
}

/**
 * The largest synchronous Invoke request and response real Lambda accepts, 6
 * MB.
 */
export const simLambdaSyncPayloadLimit = 6_291_456;

/**
 * The largest asynchronous Invoke request real Lambda accepts, 1 MB.
 */
export const simLambdaAsyncPayloadLimit = 1_048_576;

/**
 * The response size real Lambda names when a handler answers with more than
 * a synchronous invocation can carry.
 */
const responseLimit = 6_291_556;

/**
 * Parse an Invoke request payload into the handler invocation event.
 *
 * As on real Lambda, an omitted or empty payload invokes the handler with an
 * empty object event, and a payload that is not valid JSON is rejected. A
 * payload larger than the invocation type allows is refused before it is read.
 */
export function parseInvokeEvent(
  payload: SimInvokePayload | undefined,
  limit = simLambdaSyncPayloadLimit,
): unknown {
  if (payload === undefined) {
    return {};
  }

  const text = payloadText(payload);
  if (Buffer.byteLength(text) > limit) {
    throw new SimLambdaRequestTooLargeException(
      `Request must be smaller than ${String(limit)} bytes for the ` +
        "InvokeFunction operation",
    );
  }

  if (text === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SimLambdaInvalidRequestContentException(
      "Could not parse request body into json: " +
        "Unexpected character found when parsing the payload",
    );
  }
}

/**
 * Serialise a handler result into an Invoke response payload. A streaming
 * handler's response is the bytes it wrote, as a buffered Invoke of one
 * answers on real Lambda.
 * A handler that resolves with undefined produces a null JSON payload, as on
 * real Lambda.
 */
export function resultPayload(result: unknown): Uint8Array {
  if (result instanceof SimLambdaStreamedResponse) {
    return result.stream.bytes();
  }

  return Buffer.from(JSON.stringify(result === undefined ? null : result));
}

/**
 * Whether a response payload is more than a synchronous invocation carries,
 * which real Lambda answers as a function error of its own.
 */
export function isOversizedResponse(payload: Uint8Array): boolean {
  return payload.byteLength > responseLimit;
}

/**
 * The function error real Lambda answers with for a handler whose response is
 * too large.
 */
export function oversizedResponsePayload(): Uint8Array {
  return Buffer.from(
    JSON.stringify({
      errorMessage:
        "Response payload size exceeded maximum allowed payload size " +
        `(${String(responseLimit)} bytes).`,
      errorType: "Function.ResponseSizeTooLarge",
    }),
  );
}

/**
 * Describe a handler error the way AWS reports one.
 *
 * Both the Invoke response payload and the record sent to a failure
 * destination carry this, so it is built once and serialised where it is
 * needed.
 */
export function functionErrorDocument(error: unknown): SimLambdaErrorDocument {
  const handlerError =
    error instanceof Error ? error : new Error(String(error));

  return {
    errorType: handlerError.name,
    errorMessage: handlerError.message,
    trace: (handlerError.stack ?? "").split("\n"),
  };
}

/**
 * Serialise a handler error into an AWS-like Invoke error response payload.
 */
export function functionErrorPayload(error: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(functionErrorDocument(error)));
}
