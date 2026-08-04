/**
 * Minimal structural sim DynamoDB stream specification, as a request carries
 * it.
 */
export interface SimDynamoDbStreamSpecification {
  readonly StreamEnabled?: boolean | undefined;
  readonly StreamViewType?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB stream specification, as a table reports it.
 *
 * A table that has a stream reports the view type it was enabled with. One that
 * had a stream and no longer does reports only that it is off, as real DynamoDB
 * does, since the view type belonged to the stream rather than to the table.
 */
export interface SimDynamoDbStreamSpecificationDescription {
  readonly StreamEnabled: boolean;
  readonly StreamViewType?: SimDynamoDbStreamViewType | undefined;
}

/**
 * Minimal structural sim DynamoDB stream view type.
 */
export type SimDynamoDbStreamViewType =
  "KEYS_ONLY" | "NEW_IMAGE" | "OLD_IMAGE" | "NEW_AND_OLD_IMAGES";
