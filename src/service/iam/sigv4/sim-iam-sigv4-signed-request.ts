/**
 * A request as received, in the shape SigV4 verification needs it.
 *
 * The body is passed alongside rather than read from the request, because a
 * request body can only be consumed once and the caller serving the request
 * needs it too. Whoever receives the request buffers it once and hands the same
 * bytes to both.
 */
export interface SimIamSigV4SignedRequest {
  readonly method: string;
  readonly url: URL;
  readonly headers: Headers;
  readonly body?: Uint8Array | undefined;
}

/**
 * Build the verification input from a Fetch request and its buffered body.
 */
export function simIamSigV4SignedRequest(
  request: Request,
  body?: Uint8Array,
): SimIamSigV4SignedRequest {
  return {
    method: request.method,
    url: new URL(request.url),
    headers: request.headers,
    body,
  };
}
