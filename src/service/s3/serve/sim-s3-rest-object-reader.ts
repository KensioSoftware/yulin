import type { SimS3 } from "../sim-s3.js";
import type { SimS3RestObjectRoute } from "./sim-s3-route.js";
import type { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import { simS3ObjectResponseHeaders } from "../object/s3-object-response-headers.js";
import { simS3SystemMetadataHeadersFrom } from "../object/s3-system-metadata-read.js";

/**
 * Answers a `GET` or `HEAD` at the simulated S3 REST endpoint.
 *
 * The two share everything but the body, because a `HEAD` is a `GET` whose
 * response real S3 stops short of sending, so they are read the same way here
 * and differ only in what comes back.
 *
 * A `GET` may ask for part of the Object, and is answered with that part and
 * `206 Partial Content`. A `HEAD` may not. Simulated S3 describes the whole
 * Object however it is asked about, and HeadObject does the same for an
 * in-process caller.
 */
export class SimS3RestObjectReader {
  /**
   * Read an Object as the principal the boundary resolved.
   */
  async read(
    simS3: SimS3,
    route: SimS3RestObjectRoute,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    const { request } = serviceRequest;
    const head = request.method === "HEAD";

    const output = await simS3.getObject(
      {
        input: {
          Bucket: route.bucket.bucketName,
          Key: route.objectKey,
          Range: head ? undefined : (request.headers.get("range") ?? undefined),
        },
      },
      { caller: serviceRequest.caller.toCaller() },
    );

    const body = await bodyBytes(output.Body);
    const headers = simS3ObjectResponseHeaders({
      metadata: simS3SystemMetadataHeadersFrom(output),
      bodyLength: body.length,
      etag: output.ETag,
      lastModified: output.LastModified,
      contentRange: output.ContentRange,
    });

    if (head) {
      return new Response(undefined, { status: 200, headers });
    }

    return new Response(body, {
      status: output.ContentRange === undefined ? 200 : 206,
      headers,
    });
  }
}

/**
 * Read a GetObject response body into the bytes an HTTP response carries.
 */
async function bodyBytes(
  body: { [Symbol.asyncIterator](): AsyncIterator<unknown> } | undefined,
): Promise<Buffer> {
  /* v8 ignore if -- the loader always answers with a body */
  if (body === undefined) {
    return Buffer.alloc(0);
  }

  const chunks: Buffer[] = [];

  for await (const chunk of body) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }

  return Buffer.concat(chunks);
}
