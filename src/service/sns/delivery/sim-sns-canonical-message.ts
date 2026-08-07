/**
 * The values real SNS signs, under the names it signs them by.
 *
 * A verifier rebuilds this from the document it received, so the names are the
 * document's rather than the simulator's.
 */
export interface SimSnsSignedValues {
  readonly Message: string;
  readonly MessageId: string;
  readonly Subject: string | undefined;
  readonly Timestamp: string;
  readonly TopicArn: string;
  readonly Type: string;
}

/**
 * The string real SNS signs, which is what a verifier rebuilds to check the
 * signature.
 *
 * Each signed field is its name and its value, both followed by a newline, in
 * the alphabetical order of the names. That order is the declaration order of
 * `SimSnsSignedValues`, since an object keeps the order its keys were written
 * in, and rebuilding the string in any other order fails to verify.
 *
 * A field with no value is left out rather than signed as an empty string,
 * which is what makes a message published without a subject verify.
 *
 * The message attributes are not signed, here or on real AWS, so changing one
 * in flight leaves the signature valid.
 */
export function simSnsCanonicalMessage(values: SimSnsSignedValues): string {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}\n${String(value)}\n`)
    .join("");
}
