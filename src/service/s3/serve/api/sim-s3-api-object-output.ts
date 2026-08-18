import { simS3ObjectResponseHeaders } from "../../object/s3-object-response-headers.js";

/**
 * Answer a read with the Object itself, headers and all.
 */
export async function simS3GetObjectResponse(
  output: Record<string, unknown>,
): Promise<Response> {
  const body = await objectBodyBytes(output["Body"]);

  return new Response(body, {
    status: 200,
    headers: simS3ObjectResponseHeaders({
      metadata: output["Metadata"] as Record<string, string> | undefined,
      bodyLength: body.length,
      etag: output["ETag"] as string | undefined,
      lastModified: output["LastModified"] as Date | undefined,
    }),
  });
}

/**
 * Read a GetObject body into the bytes an HTTP response carries.
 */
async function objectBodyBytes(body: unknown): Promise<Buffer> {
  /* v8 ignore if -- the loader always answers with a body */
  if (body === undefined || body === null) {
    return Buffer.alloc(0);
  }

  const chunks: Buffer[] = [];

  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
