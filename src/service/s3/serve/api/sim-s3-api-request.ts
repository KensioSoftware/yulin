/**
 * The hostname label S3's own REST endpoints carry.
 */
const s3EndpointLabel = "s3";

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
 * Read a request addressed to the S3 REST API as an S3 request.
 *
 * Both of the addressing styles real S3 offers are read, because both arrive
 * here. A client given an endpoint URL sends path style, with the Bucket as
 * the first path segment. An SDK resolving S3's own endpoint sends virtual
 * host style, with the Bucket in the hostname, and function code bundling the
 * SDK reaches this endpoint with exactly that.
 */
export function readSimS3ApiRequest(
  request: Request,
  body: Uint8Array,
): SimS3ApiRequest {
  const url = new URL(request.url);
  const { bucketName, objectKey } = simS3ApiRequestTargetNames(
    url.hostname,
    url.pathname.replace(/^\//, ""),
  );

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
 * Split what a request addressed into the Bucket it names and the Object key
 * below it, still encoded as they were sent.
 *
 * A virtual host request names its Bucket in the hostname, which leaves its
 * whole path as the key. A path style request names both in the path, where
 * the first segment is the Bucket and everything after it is the key, which
 * can itself contain slashes.
 */
function simS3ApiRequestTargetNames(
  hostname: string,
  path: string,
): { readonly bucketName: string; readonly objectKey: string } {
  const hostedBucketName = simS3VirtualHostBucketName(hostname);
  if (hostedBucketName !== undefined) {
    return { bucketName: hostedBucketName, objectKey: path };
  }

  const separator = path.indexOf("/");
  if (separator === -1) {
    return { bucketName: path, objectKey: "" };
  }

  return {
    bucketName: path.slice(0, separator),
    objectKey: path.slice(separator + 1),
  };
}

/**
 * The Bucket a virtual host style hostname names, or nothing for a hostname
 * that names none.
 *
 * S3's own endpoint hostnames carry an `s3` label, and virtual host style puts
 * the Bucket in front of it, as in `<bucket>.s3.<region>.amazonaws.com`. Path
 * style is the same hostname with nothing in front. The labels before the
 * first `s3` label are the Bucket, and an empty set of them is path style.
 *
 * A Bucket name can contain dots. One Bucket is then several hostname labels,
 * joined back together here.
 *
 * A hostname carrying no `s3` label names no Bucket. That covers the local
 * endpoint an `--endpoint-url` client sends, which addresses every service on
 * one hostname and can only be path style.
 */
function simS3VirtualHostBucketName(hostname: string): string | undefined {
  const labels = hostname.split(".");
  const endpoint = labels.indexOf(s3EndpointLabel);

  return endpoint <= 0 ? undefined : labels.slice(0, endpoint).join(".");
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
