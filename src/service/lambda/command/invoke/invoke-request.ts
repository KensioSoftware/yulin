import { SimLambdaInvalidRequestContentException } from "../../error/sim-lambda.error.js";
import type { SimLambdaInvokeRequest } from "../../function/invoke/sim-lambda-invoke-request-context.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimInvokeCommandInput } from "./invoke.command.js";

/**
 * How much of the end of an invocation's log real Lambda returns as
 * `LogResult`.
 */
const tailBytes = 4096;

/**
 * What a synchronous Invoke request asks of its invocation besides the event.
 *
 * A `ClientContext` that is not base64-encoded JSON describing an object is
 * refused, as real Lambda refuses it.
 */
export function simLambdaInvokeRequestOf(
  input: SimInvokeCommandInput,
  logGroupName: string,
): SimLambdaInvokeRequest {
  return {
    logGroupName,
    clientContext: decodedClientContext(input.ClientContext),
    tail: input.LogType === "Tail" ? [] : undefined,
  };
}

/**
 * The `LogResult` real Lambda answers a request asking for the log tail with:
 * the last 4 KB of what the invocation wrote, base64-encoded.
 */
export function simLambdaLogResult(request: SimLambdaInvokeRequest): {
  LogResult?: string;
} {
  if (request.tail === undefined) {
    return {};
  }

  const log = Buffer.from(request.tail.join(""));

  return {
    LogResult: log
      .subarray(Math.max(0, log.length - tailBytes))
      .toString("base64"),
  };
}

function decodedClientContext(encoded: string | undefined): unknown {
  if (encoded === undefined) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as unknown;

    if (isRecord(decoded)) {
      return decoded;
    }
  } catch {
    // Refused below, with a JSON document that is not an object.
  }

  throw new SimLambdaInvalidRequestContentException(
    "Client context must be a valid Base64-encoded JSON object.",
  );
}
