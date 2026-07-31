import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

const greatestSignificantDigits = 38;
const greatestAdjustedExponent = 125;
const leastAdjustedExponent = -130;

/**
 * Refuse a number outside the range real DynamoDB stores.
 *
 * How wide a number can be and how big it can get are limits of the store
 * rather than of how a number is written, so they are checked here rather than
 * beside the parsing.
 */
export function assertSimDynamoDbNumberInRange(
  value: string,
  significand: string,
  scale: number,
): void {
  if (significand.length > greatestSignificantDigits) {
    throw new SimDynamoDbValidationException(
      `Number ${value} has ${significand.length.toString()} significant ` +
        `digits, and DynamoDB numbers carry ${greatestSignificantDigits.toString()}`,
    );
  }

  // The exponent the number has when written as one digit, a point and the
  // rest, which is how DynamoDB documents its range.
  const adjustedExponent = scale + significand.length - 1;

  if (
    adjustedExponent > greatestAdjustedExponent ||
    adjustedExponent < leastAdjustedExponent
  ) {
    throw new SimDynamoDbValidationException(
      `Number ${value} is outside the range DynamoDB stores, which is ` +
        `1E-130 to 9.9999999999999999999999999999999999999E+125 and its ` +
        `negative mirror`,
    );
  }
}
