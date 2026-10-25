import { isRecord } from "../../util/type-guard/record.js";
import { simSdkWireJsonBody } from "./sim-sdk-wire-json.js";
import type { SimSdkWireResponse } from "./sim-sdk-wire.types.js";

/**
 * The JSON protocol version a request was sent with, echoed back on the
 * response as real AWS echoes it.
 */
const defaultContentType = "application/x-amz-json-1.0";

/**
 * Build the response for an operation the simulated service answered.
 */
export function simSdkWireOutputResponse(
  output: unknown,
  contentType: string = defaultContentType,
): SimSdkWireResponse {
  return {
    statusCode: 200,
    headers: responseHeaders(contentType),
    body: simSdkWireJsonBody(output),
  };
}

/**
 * Build the response for an operation the simulated service refused.
 *
 * AWS JSON protocol errors are a failure status with the exception name in
 * `__type` and in the error type header, which is what the SDK reads to decide
 * which exception class to throw. Simulated service errors already carry the
 * AWS exception name and the status real AWS answers with, so a handler
 * catching `ResourceNotFoundException` catches the same thing here as in
 * production.
 *
 * The body also carries the exception's modelled members, such as the
 * `CancellationReasons` of a DynamoDB `TransactionCanceledException`. The SDK
 * maps those from the body onto the exception it throws, so a member left out
 * here is undefined on the caller's side.
 */
export function simSdkWireErrorResponse(
  error: unknown,
  contentType: string = defaultContentType,
): SimSdkWireResponse {
  const errorType = error instanceof Error ? error.name : "InternalFailure";
  const message = error instanceof Error ? error.message : String(error);

  return {
    statusCode: simSdkWireErrorStatusCode(error),
    headers: {
      ...responseHeaders(contentType),
      ...Object.fromEntries([["x-amzn-errortype", errorType]]),
    },
    body: simSdkWireJsonBody(
      Object.fromEntries([
        ...errorMembers(error),
        ["__type", errorType],
        ["message", message],
      ]),
    ),
  };
}

/**
 * The modelled members a simulated service error carries.
 *
 * AWS names the members of its exception shapes in PascalCase, as it names
 * the members of every other shape. The lower-case properties of an Error are
 * either JavaScript's own or the simulator's diagnostics, such as the
 * principal an IAM denial names, and none of them is part of the response.
 */
function errorMembers(error: unknown): [string, unknown][] {
  if (!(error instanceof Error)) {
    return [];
  }

  return Object.entries(error).filter(([name]) => /^[A-Z]/u.test(name));
}

/**
 * The status a simulated service error is answered with.
 *
 * Simulated services state the status real AWS uses in their error metadata.
 * An error that states none is a client error rather than a fault: the request
 * was understood and refused, so retrying it would only fail again.
 *
 * Something thrown that is not an Error at all is the exception. It is
 * reported as InternalFailure, which real AWS answers with a server status,
 * and it means the simulator itself went wrong rather than the request.
 */
export function simSdkWireErrorStatusCode(error: unknown): number {
  if (!(error instanceof Error)) {
    return 500;
  }

  const metadata = (error as { $metadata?: unknown }).$metadata;
  const statusCode = isRecord(metadata)
    ? metadata["httpStatusCode"]
    : undefined;

  return typeof statusCode === "number" ? statusCode : 400;
}

function responseHeaders(contentType: string): Record<string, string> {
  return Object.fromEntries([["content-type", contentType]]);
}
