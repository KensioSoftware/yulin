import type { SimDynamoDbTimeToLiveSpecificationInput } from "../command/time-to-live/time-to-live.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

/**
 * DynamoDB attribute names run from 1 to 255 characters.
 */
const greatestAttributeNameLength = 255;

/**
 * What an UpdateTimeToLive request asks for, once it has been checked.
 *
 * Real DynamoDB requires both fields, including when switching time to live
 * off, so a request naming no attribute is refused rather than read as one
 * asking to leave the attribute as it was.
 */
export class SimDynamoDbTimeToLiveSpecification {
  public readonly attributeName: string;
  public readonly enabled: boolean;

  private constructor(attributeName: string, enabled: boolean) {
    this.attributeName = attributeName;
    this.enabled = enabled;
  }

  /**
   * Read the specification a request carries.
   */
  static fromInput(
    input: SimDynamoDbTimeToLiveSpecificationInput | undefined,
  ): SimDynamoDbTimeToLiveSpecification {
    if (input === undefined) {
      throw new SimDynamoDbValidationException(
        `TimeToLiveSpecification is required to update time to live`,
      );
    }

    return new this(
      this.readAttributeName(input.AttributeName),
      this.readEnabled(input.Enabled),
    );
  }

  /**
   * The attribute items are expired by.
   */
  private static readAttributeName(attributeName: string | undefined): string {
    if (attributeName === undefined || attributeName.length === 0) {
      throw new SimDynamoDbValidationException(
        `TimeToLiveSpecification.AttributeName is required, naming the ` +
          `attribute items expire by`,
      );
    }

    if (attributeName.length > greatestAttributeNameLength) {
      throw new SimDynamoDbValidationException(
        `TimeToLiveSpecification.AttributeName has a length of ` +
          `${attributeName.length.toString()}, where 1 to ` +
          `${greatestAttributeNameLength.toString()} characters is what ` +
          `DynamoDB takes`,
      );
    }

    return attributeName;
  }

  /**
   * Whether the request is switching time to live on or off.
   */
  private static readEnabled(enabled: boolean | undefined): boolean {
    if (typeof enabled !== "boolean") {
      throw new SimDynamoDbValidationException(
        `TimeToLiveSpecification.Enabled is required, and must be true or ` +
          `false`,
      );
    }

    return enabled;
  }
}
