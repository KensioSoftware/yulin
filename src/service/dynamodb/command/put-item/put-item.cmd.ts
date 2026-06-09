/**
 * Minimal structural sim DynamoDB PutItem command.
 */
export interface SimPutItemCommand {
  readonly input: SimPutItemCommandInput;
}

/**
 * Minimal structural sim DynamoDB PutItem input.
 */
export interface SimPutItemCommandInput {
  readonly TableName?: string;
  readonly Item?: Record<string, SimDynamoDbAttributeValue>;
}

/**
 * Minimal structural sim DynamoDB PutItem output.
 */
export interface SimPutItemCommandOutput {
  readonly Attributes?: Record<string, SimDynamoDbAttributeValue>;
  readonly $metadata: Record<string, unknown>;
}

/**
 * Minimal structural sim DynamoDB AttributeValue.
 */
export type SimDynamoDbAttributeValue =
  | { readonly B: Uint8Array }
  | { readonly BOOL: boolean }
  | { readonly BS: readonly Uint8Array[] }
  | { readonly L: readonly SimDynamoDbAttributeValue[] }
  | { readonly M: Readonly<Record<string, SimDynamoDbAttributeValue>> }
  | { readonly N: string }
  | { readonly NS: readonly string[] }
  | { readonly NULL: boolean }
  | { readonly S: string }
  | { readonly SS: readonly string[] };
