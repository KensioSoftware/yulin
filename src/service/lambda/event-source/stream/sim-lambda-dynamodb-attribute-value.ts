/**
 * One attribute value in the images a stream record carries.
 *
 * Exactly one tag is set and the rest are absent, which is how the AWS SDK
 * declares an attribute value. Saying that, rather than allowing any
 * combination, is what lets a handler pass an image straight to `unmarshall`
 * without a cast.
 *
 * This is declared here rather than taken from simulated DynamoDB so that
 * neither service imports the other. What crosses between them is the shape of
 * a record, not either service's own types.
 */
export type SimLambdaDynamoDbAttributeValue =
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
      readonly $unknown?: never;
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
      readonly $unknown?: never;
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
      readonly $unknown?: never;
    }
  | {
      readonly L: SimLambdaDynamoDbAttributeValue[];
      readonly B?: never;
      readonly BOOL?: never;
      readonly BS?: never;
      readonly M?: never;
      readonly N?: never;
      readonly NS?: never;
      readonly NULL?: never;
      readonly S?: never;
      readonly SS?: never;
      readonly $unknown?: never;
    }
  | {
      readonly M: Readonly<Record<string, SimLambdaDynamoDbAttributeValue>>;
      readonly B?: never;
      readonly BOOL?: never;
      readonly BS?: never;
      readonly L?: never;
      readonly N?: never;
      readonly NS?: never;
      readonly NULL?: never;
      readonly S?: never;
      readonly SS?: never;
      readonly $unknown?: never;
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
      readonly $unknown?: never;
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
      readonly $unknown?: never;
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
      readonly $unknown?: never;
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
      readonly $unknown?: never;
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
 * One item image as a stream record carries it.
 */
export type SimLambdaDynamoDbImage = Readonly<
  Record<string, SimLambdaDynamoDbAttributeValue>
>;
