/**
 * The text form of some binary value, for comparing it by its bytes.
 *
 * Two `Uint8Array` values holding the same bytes are different objects, so
 * anything comparing binary values by identity gets the wrong answer. Base64 is
 * how binary goes over the wire to DynamoDB anyway, so it is what this
 * simulation compares and keys by.
 */
export function simDynamoDbBinaryText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
