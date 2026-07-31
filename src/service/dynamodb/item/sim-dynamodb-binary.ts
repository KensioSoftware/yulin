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

/**
 * Take a copy of some binary value.
 *
 * A `Uint8Array` a request hands in stays the caller's to change, and one a
 * response hands back is the caller's to change too. Copying at both edges is
 * what keeps a stored item the item that was written, whatever happens to the
 * arrays either side of it.
 */
export function simDynamoDbBinaryCopy(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes);
}
