/**
 * Order two table names the way DynamoDB orders them, by UTF-8 bytes.
 *
 * A table name is ASCII, so this is the same order the characters are in, but
 * comparing the bytes is what DynamoDB documents, and it keeps the order the
 * same whatever locale the host is running in.
 */
export function compareSimDynamoDbTableNames(
  first: string,
  second: string,
): number {
  return Buffer.compare(
    Buffer.from(first, "utf8"),
    Buffer.from(second, "utf8"),
  );
}
