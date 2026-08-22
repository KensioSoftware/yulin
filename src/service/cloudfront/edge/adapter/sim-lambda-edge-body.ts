import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";

/**
 * Reading and writing the bodies an edge function sees and produces.
 */

/**
 * The body a viewer-request event carries when `IncludeBody` is set.
 *
 * CloudFront sends it base64 encoded, and reports whether it had to truncate
 * it. Nothing here truncates, so a simulated body is always whole.
 */
export async function edgeRequestBody(
  request: Request,
): Promise<LambdaAtEdge.Body> {
  const bytes =
    request.body === null
      ? new Uint8Array()
      : new Uint8Array(await request.clone().arrayBuffer());

  return {
    inputTruncated: false,
    action: "read-only",
    encoding: "base64",
    data: Buffer.from(bytes).toString("base64"),
  };
}

/**
 * The body the request carries on to the origin with.
 *
 * A handler that set the body action to `replace` has written the body it
 * wants sent. Anything else leaves the viewer's own body in place, including a
 * handler that read the body and handed the event back untouched.
 */
export function replacementBody(
  edgeRequest: LambdaAtEdge.Request,
  originalRequest: Request,
): NonNullable<RequestInit["body"]> | null {
  if (/^(?:get|head)$/iu.test(edgeRequest.method)) {
    return null;
  }

  const body = edgeRequest.body;

  if (body?.action !== "replace") {
    return originalRequest.clone().body;
  }

  return body.encoding === "base64"
    ? Buffer.from(body.data, "base64")
    : body.data;
}

/**
 * The body of a response an edge function wrote.
 */
export function edgeResponseBody(
  edgeResponse: LambdaAtEdge.Response,
): Buffer | string | null {
  if (edgeResponse.body === undefined) {
    return null;
  }

  return edgeResponse.bodyEncoding === "base64"
    ? Buffer.from(edgeResponse.body, "base64")
    : edgeResponse.body;
}
