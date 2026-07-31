/**
 * Minimal structural sim DynamoDB AttributeValue.
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
      readonly BS: readonly Uint8Array[];
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
      readonly L: readonly SimDynamoDbAttributeValue[];
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
      readonly NS: readonly string[];
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
      readonly SS: readonly string[];
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
      readonly $unknown: readonly [string, unknown];
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
