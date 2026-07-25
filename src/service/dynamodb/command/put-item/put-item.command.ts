import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

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
  readonly TableName?: string | undefined;
  readonly Item?: Record<string, SimDynamoDbAttributeValue> | undefined;
}

/**
 * Minimal structural sim DynamoDB PutItem output.
 */
export interface SimPutItemCommandOutput {
  readonly Attributes?: Record<string, SimDynamoDbAttributeValue> | undefined;
  readonly $metadata: SimResponseMetadata;
}

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
