/**
 * Convert an AsyncIterable<Buffer> simulated S3 Object body to a Buffer.
 */
export async function simS3BodyToBuffer(
  body: AsyncIterable<Buffer>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
