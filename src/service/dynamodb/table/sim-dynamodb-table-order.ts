/**
 * Order two pieces of text by their UTF-8 bytes.
 *
 * Comparing bytes keeps an order the same whatever locale the host is running
 * in, which is what lets a test create things concurrently and still assert a
 * deterministic listing.
 */
export function compareSimDynamoDbTextBytes(
  first: string,
  second: string,
): number {
  return Buffer.compare(
    Buffer.from(first, "utf8"),
    Buffer.from(second, "utf8"),
  );
}

/**
 * Order two table names the way DynamoDB orders them, by UTF-8 bytes.
 *
 * A table name is ASCII, so this is the same order the characters are in, but
 * comparing the bytes is what DynamoDB documents.
 */
export function compareSimDynamoDbTableNames(
  first: string,
  second: string,
): number {
  return compareSimDynamoDbTextBytes(first, second);
}
