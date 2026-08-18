import { simS3ObjectResponseHeaders } from "../../object/s3-object-response-headers.js";

/**
 * The responses a HEAD is answered with.
 *
 * HTTP forbids a body on a HEAD response, so everything the caller learns is
 * in the headers and the status. That is what separates these from the
 * operations that answer in XML.
 */

/**
 * Answer a HEAD with what a read would have said and none of the Object.
 *
 * The `content-length` describes the Object rather than the response, which is
 * what makes a HEAD worth sending.
 */
export function simS3HeadObjectResponse(
  output: Record<string, unknown>,
): Response {
  return new Response(undefined, {
    status: 200,
    headers: simS3ObjectResponseHeaders({
      metadata: output["Metadata"] as Record<string, string> | undefined,
      bodyLength: (output["ContentLength"] as number | undefined) ?? 0,
      etag: output["ETag"] as string | undefined,
      lastModified: output["LastModified"] as Date | undefined,
    }),
  });
}

/**
 * Answer that a Bucket is there and reachable.
 *
 * The Region it was found in travels in a header, since a HEAD has no body to
 * put it in, and the SDK reads that header back into `BucketRegion`.
 */
export function simS3HeadBucketResponse(
  output: Record<string, unknown>,
): Response {
  const region = output["BucketRegion"];

  return new Response(undefined, {
    status: 200,
    headers:
      typeof region === "string" ? { "x-amz-bucket-region": region } : {},
  });
}
