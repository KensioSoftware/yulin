/**
 * An S3 REST request as the route table reads it.
 *
 * The path has already been taken apart, because which operation a request
 * names depends on how many path segments it has: no Bucket is a service-level
 * operation, a Bucket alone is a Bucket-level one, and a Bucket with a key is
 * an Object operation.
 */
export interface SimS3ApiRequest {
  readonly method: string;
  /** Empty for a service-level request, such as ListBuckets. */
  readonly bucketName: string;
  /** Empty for a service-level or Bucket-level request. */
  readonly objectKey: string;
  readonly query: URLSearchParams;
  readonly headers: Headers;
  readonly body: Uint8Array;
}

/**
 * Read a request that arrived at the served AWS API endpoint as an S3 request.
 *
 * Only path-style addressing is read here. A virtual-host request names its
 * Bucket in the hostname, and simulated Route 53 resolves that to the Bucket's
 * own endpoint before this endpoint is ever reached, so a request that gets
 * this far put its Bucket in the path.
 */
export function readSimS3ApiRequest(
  request: Request,
  body: Uint8Array,
): SimS3ApiRequest {
  const url = new URL(request.url);

  // The first segment is the Bucket and everything after it is the key, which
  // can itself contain slashes.
  const path = url.pathname.replace(/^\//, "");
  const separator = path.indexOf("/");

  const bucketName = separator === -1 ? path : path.slice(0, separator);
  const objectKey = separator === -1 ? "" : path.slice(separator + 1);

  return {
    method: request.method,
    bucketName: decodeURIComponent(bucketName),
    objectKey: decodeSimS3ObjectKey(objectKey),
    query: url.searchParams,
    headers: request.headers,
    body,
  };
}

/**
 * Decode an Object key from the path it was sent in.
 *
 * Each segment is decoded on its own, because a key containing an encoded
 * slash names one segment of the key rather than two, and decoding the whole
 * path at once would lose that distinction.
 */
function decodeSimS3ObjectKey(path: string): string {
  return path
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

/**
 * Which level of the S3 API a request addressed, taken from its path.
 */
export function simS3ApiRequestTarget(
  request: SimS3ApiRequest,
): "service" | "bucket" | "object" {
  if (request.bucketName.length === 0) {
    return "service";
  }

  return request.objectKey.length === 0 ? "bucket" : "object";
}
