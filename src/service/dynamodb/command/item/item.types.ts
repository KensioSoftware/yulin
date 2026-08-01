/**
 * Minimal structural sim DynamoDB AttributeValue.
 *
 * The arrays are mutable and `$unknown` is a mutable tuple, matching the shape
 * the AWS SDK declares, so a value the simulator answers with can be passed
 * straight back into an SDK Command. That is what a paging loop does with a
 * `LastEvaluatedKey`, and a readonly array here would make the SDK's own types
 * refuse it.
 */
export type SimDynamoDbAttributeValue =
  | {
      readonly B: Uint8Array;
      readonly BOOL?: never;
      readonly BS?: never;
      readonly L?: never;
      readonly M?: never;
      readonly N?: never;
      readonly NS?: never;
      readonly NULL?: never;
      readonly S?: never;
      readonly SS?: never;
    }
  | {
      readonly BOOL: boolean;
      readonly B?: never;
      readonly BS?: never;
      readonly L?: never;
      readonly M?: never;
      readonly N?: never;
      readonly NS?: never;
      readonly NULL?: never;
      readonly S?: never;
      readonly SS?: never;
    }
  | {
      readonly BS: Uint8Array[];
      readonly B?: never;
      readonly BOOL?: never;
      readonly L?: never;
      readonly M?: never;
      readonly N?: never;
      readonly NS?: never;
      readonly NULL?: never;
      readonly S?: never;
      readonly SS?: never;
    }
  | {
      readonly L: SimDynamoDbAttributeValue[];
      readonly B?: never;
      readonly BOOL?: never;
      readonly BS?: never;
      readonly M?: never;
      readonly N?: never;
      readonly NS?: never;
      readonly NULL?: never;
      readonly S?: never;
      readonly SS?: never;
    }
  | {
      readonly M: Readonly<Record<string, SimDynamoDbAttributeValue>>;
      readonly B?: never;
      readonly BOOL?: never;
      readonly BS?: never;
      readonly L?: never;
      readonly N?: never;
      readonly NS?: never;
      readonly NULL?: never;
      readonly S?: never;
      readonly SS?: never;
    }
  | {
      readonly N: string;
      readonly B?: never;
      readonly BOOL?: never;
      readonly BS?: never;
      readonly L?: never;
      readonly M?: never;
      readonly NS?: never;
      readonly NULL?: never;
      readonly S?: never;
      readonly SS?: never;
    }
  | {
      readonly NS: string[];
      readonly B?: never;
      readonly BOOL?: never;
      readonly BS?: never;
      readonly L?: never;
      readonly M?: never;
      readonly N?: never;
      readonly NULL?: never;
      readonly S?: never;
      readonly SS?: never;
    }
  | {
      readonly NULL: boolean;
      readonly B?: never;
      readonly BOOL?: never;
      readonly BS?: never;
      readonly L?: never;
      readonly M?: never;
      readonly N?: never;
      readonly NS?: never;
      readonly S?: never;
      readonly SS?: never;
    }
  | {
      readonly S: string;
      readonly B?: never;
      readonly BOOL?: never;
      readonly BS?: never;
      readonly L?: never;
      readonly M?: never;
      readonly N?: never;
      readonly NS?: never;
      readonly NULL?: never;
      readonly SS?: never;
    }
  | {
      readonly SS: string[];
      readonly B?: never;
      readonly BOOL?: never;
      readonly BS?: never;
      readonly L?: never;
      readonly M?: never;
      readonly N?: never;
      readonly NS?: never;
      readonly NULL?: never;
      readonly S?: never;
    }
  | {
      readonly $unknown: [string, unknown];
      readonly B?: never;
      readonly BOOL?: never;
      readonly BS?: never;
      readonly L?: never;
      readonly M?: never;
      readonly N?: never;
      readonly NS?: never;
      readonly NULL?: never;
      readonly S?: never;
      readonly SS?: never;
    };

/**
 * Minimal structural sim DynamoDB attribute value update.
 *
 * This is the older way of changing part of an item, which simulated DynamoDB
 * refuses rather than models. It is declared so a request carrying one is
 * refused by name.
 */
export interface SimDynamoDbAttributeValueUpdate {
  readonly Value?: SimDynamoDbAttributeValue | undefined;
  readonly Action?: string | undefined;
}

/**
 * Minimal structural sim DynamoDB legacy condition.
 *
 * This is the older way of saying which items a read wants, which
 * `KeyConditionExpression` and `FilterExpression` replaced. It is declared so a
 * request carrying one is refused by name.
 */
export interface SimDynamoDbLegacyCondition {
  readonly ComparisonOperator?: string | undefined;
  readonly AttributeValueList?:
    readonly SimDynamoDbAttributeValue[] | undefined;
}

/**
 * Minimal structural sim DynamoDB expected attribute value.
 *
 * This is the older conditional write input, which simulated DynamoDB refuses
 * rather than models. It is declared so a request carrying one is refused by
 * name.
 */
export interface SimDynamoDbExpectedAttributeValue {
  readonly Value?: SimDynamoDbAttributeValue | undefined;
  readonly Exists?: boolean | undefined;
  readonly ComparisonOperator?: string | undefined;
  readonly AttributeValueList?:
    readonly SimDynamoDbAttributeValue[] | undefined;
}
