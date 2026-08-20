import {
  SimLambdaError,
  SimLambdaInvalidRequestContentException,
} from "../../error/sim-lambda.error.js";
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
 * Parse an Invoke request payload into the handler invocation event.
 *
 * As on real Lambda, an omitted or empty payload invokes the handler with an
 * empty object event, and a payload that is not valid JSON is rejected.
 */
export function parseInvokeEvent(
  payload: SimInvokePayload | undefined,
): unknown {
  if (payload === undefined) {
    return {};
  }

  const text = payloadText(payload);
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
 * Serialise a handler result into an Invoke response payload.
 * A handler that resolves with undefined produces a null JSON payload, as on
 * real Lambda.
 */
export function resultPayload(result: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(result === undefined ? null : result));
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
