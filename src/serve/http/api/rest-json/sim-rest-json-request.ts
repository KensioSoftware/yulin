/**
 * One AWS REST-JSON request, taken apart as far as the route table reads it.
 *
 * REST-JSON names its operation in the method and the path, as REST-XML does,
 * and carries the rest of its input in a JSON body, in the query string and in
 * headers. The path is split before anything is matched against it, because a
 * route is a template of segments and matching one means comparing segments.
 */
export interface SimRestJsonRequest {
  readonly method: string;

  /** The path as it arrived, for naming one no route serves. */
  readonly path: string;

  /** The path split on its separators, each segment decoded. */
  readonly segments: readonly string[];

  readonly query: URLSearchParams;
  readonly headers: Headers;
  readonly body: Uint8Array;
}

/**
 * A body that states itself as JSON and is not.
 *
 * Real AWS answers this as `SerializationException`, and an SDK raises it under
 * that name rather than reporting whatever the parser happened to say.
 */
export class SimRestJsonSerializationError extends Error {
  public override readonly name = "SerializationException";
  public readonly $metadata = { httpStatusCode: 400 };
}

/**
 * Read a request that arrived at the served AWS API endpoint as a REST-JSON
 * request.
 *
 * A trailing separator is dropped, because AWS writes the path of a collection
 * operation both ways: `CreateEventSourceMapping` is documented at
 * `/2015-03-31/event-source-mappings/` and `CreateFunction` at
 * `/2015-03-31/functions`. Neither names a segment after the last one, so
 * neither is told from the other here.
 */
export function readSimRestJsonRequest(
  request: Request,
  body: Uint8Array,
): SimRestJsonRequest {
  const url = new URL(request.url);

  return {
    method: request.method,
    path: url.pathname,
    segments: simRestJsonPathSegments(url.pathname),
    query: url.searchParams,
    headers: request.headers,
    body,
  };
}

/**
 * Split a path into the segments a route template is matched against.
 *
 * Each segment is decoded on its own. A label carrying a separator sends it
 * encoded, so decoding the whole path at once would turn one segment into two
 * and match the request against a template it does not belong to.
 */
export function simRestJsonPathSegments(path: string): readonly string[] {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));
}

/**
 * Read a request body as the JSON object it states.
 *
 * An operation taking no body members sends none, which is the input `{}`.
 * Anything that is not an object is a body this endpoint has no members to
 * read out of, and is reported the same way an unparseable one is.
 */
export function readSimRestJsonBody(
  body: Uint8Array,
): Readonly<Record<string, unknown>> {
  if (body.byteLength === 0) {
    return {};
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(body).toString("utf8")) as unknown;
  } catch (error) {
    throw new SimRestJsonSerializationError(
      `Could not read the request body as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SimRestJsonSerializationError(
      "The request body is not a JSON object",
    );
  }

  return value as Record<string, unknown>;
}
