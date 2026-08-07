/**
 * The statuses DynamoDB reports a table's time to live in.
 *
 * An update moves it to ENABLING or DISABLING and it settles on ENABLED or
 * DISABLED, the same two-step a table's own status goes through.
 */
export type SimDynamoDbTimeToLiveStatus =
  | "ENABLING"
  | "DISABLING"
  | "ENABLED"
  | "DISABLED";

/**
 * Minimal structural sim DynamoDB TimeToLiveSpecification.
 *
 * Both fields are required by real DynamoDB, including when switching time to
 * live off, so both are typed as loosely as the wire carries them and checked
 * rather than being made optional here.
 */
export interface SimDynamoDbTimeToLiveSpecificationInput {
  readonly AttributeName?: string | undefined;
  readonly Enabled?: boolean | undefined;
}

/**
 * Minimal structural sim DynamoDB TimeToLiveDescription.
 *
 * `AttributeName` is left out once time to live is DISABLED, as real DynamoDB
 * leaves it out: the table no longer expires items by any attribute.
 */
export interface SimDynamoDbTimeToLiveDescription {
  readonly TimeToLiveStatus: SimDynamoDbTimeToLiveStatus;
  readonly AttributeName?: string | undefined;
}
