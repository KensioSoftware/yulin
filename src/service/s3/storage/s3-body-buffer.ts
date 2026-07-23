/**
 * Convert an AsyncIterable<Buffer> simulated S3 Object body to a Buffer.
 */
export async function simS3BodyToBuffer(
  body: AsyncIterable<Buffer>,
): Promise<Buffer> {
  const chunks: Buffer[] = await Array.fromAsync(body);

  return Buffer.concat(chunks);
}
