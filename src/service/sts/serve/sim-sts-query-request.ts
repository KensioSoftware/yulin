/**
 * One AWS Query protocol request, as the form encoding carries it.
 *
 * Query is the oldest of the AWS protocols. It states the operation in an
 * `Action` field and its input in the same form encoding, either in the body
 * of a POST or in the query string of a GET.
 */
export interface SimStsQueryRequest {
  readonly action: string;
  readonly fields: URLSearchParams;
}

/**
 * Read a request as the Query protocol operation it names.
 *
 * Returns undefined when no `Action` is stated, which is what separates a
 * Query request from anything else that reached the endpoint.
 */
export function readSimStsQueryRequest(
  request: Request,
  body: Uint8Array,
): SimStsQueryRequest | undefined {
  const fields = queryFields(request, body);
  const action = fields.get("Action");

  return action === null || action.length === 0
    ? undefined
    : { action, fields };
}

/**
 * The form-encoded fields a request carried, wherever it put them.
 *
 * A POST carries them in the body and a GET in the query string, and the
 * `aws` CLI sends a POST while a browser or a hand-written GET sends the
 * other. Both are read so that neither has to be the supported one.
 */
function queryFields(request: Request, body: Uint8Array): URLSearchParams {
  if (body.byteLength > 0) {
    return new URLSearchParams(Buffer.from(body).toString("utf8"));
  }

  return new URL(request.url).searchParams;
}
