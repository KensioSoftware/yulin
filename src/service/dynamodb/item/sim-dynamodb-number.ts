import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { compareSimDynamoDbMagnitudes } from "./sim-dynamodb-number-order.js";
import { assertSimDynamoDbNumberInRange } from "./sim-dynamodb-number-range.js";
import { sumSimDynamoDbNumberTexts } from "./sim-dynamodb-number-sum.js";
import { simDynamoDbPlainDecimal } from "./sim-dynamodb-number-text.js";

/**
 * A number as DynamoDB takes it on the wire: digits, an optional fraction, and
 * an optional exponent. It arrives as a string and never as a JavaScript
 * number, which is the whole point of holding it this way.
 */
// Each part consumes a distinct character, so a value that fails to match
// backtracks a digit at a time rather than combinatorially.
// eslint-disable-next-line security/detect-unsafe-regex -- no nested quantifier.
const numberPattern = /^(-?)(\d+)(?:\.(\d+))?(?:[Ee]([+-]?\d+))?$/;

/**
 * One DynamoDB number.
 *
 * DynamoDB numbers carry up to 38 significant digits, where a JavaScript
 * number carries about 15, so the digits are kept as text and never converted.
 * An identifier, a monetary amount or a large counter comes back exactly as it
 * was written.
 *
 * The text is normalised: leading and trailing zeros are trimmed, and an
 * exponent is worked back into plain notation. Two numbers written differently
 * for the same value normalise to the same text, which is what makes a number
 * set compare by value.
 */
export class SimDynamoDbNumber {
  public readonly text: string;
  public readonly significantDigits: number;

  private constructor(text: string, significantDigits: number) {
    this.text = text;
    this.significantDigits = significantDigits;
  }

  /**
   * Read a number from the text a request carries.
   */
  static of(value: string): SimDynamoDbNumber {
    const match = numberPattern.exec(value);

    if (match === null) {
      throw new SimDynamoDbValidationException(
        `The parameter cannot be converted to a numeric value: ${value}`,
      );
    }

    const [
      ,
      sign = "",
      integerDigits = "",
      fractionDigits = "",
      exponent = "0",
    ] = match;
    const digits = integerDigits + fractionDigits;
    const scale = Number(exponent) - fractionDigits.length;

    return this.ofDigits(value, sign, digits, scale);
  }

  /**
   * Build a number from its digits and the power of ten they are scaled by.
   */
  private static ofDigits(
    value: string,
    sign: string,
    digits: string,
    scale: number,
  ): SimDynamoDbNumber {
    const withoutLeadingZeros = digits.replace(/^0+/, "");

    if (withoutLeadingZeros === "") {
      return new this("0", 1);
    }

    const significand = withoutLeadingZeros.replace(/0+$/, "");
    const trailingZeros = withoutLeadingZeros.length - significand.length;

    assertSimDynamoDbNumberInRange(value, significand, scale + trailingZeros);

    return new this(
      simDynamoDbPlainDecimal(sign, significand, scale + trailingZeros),
      significand.length,
    );
  }

  /**
   * Compare this number with another, as DynamoDB orders numbers.
   *
   * The digits are compared rather than converted, so two numbers past what a
   * JavaScript number holds still order by what they say. Converting them
   * would round both to the same value and call them equal.
   */
  compareTo(other: SimDynamoDbNumber): number {
    if (this.negative !== other.negative) {
      return this.signOrder();
    }

    const magnitude = compareSimDynamoDbMagnitudes(
      this.withoutSign(),
      other.withoutSign(),
    );

    if (this.negative) {
      return -magnitude;
    }

    return magnitude;
  }

  /**
   * This number with another added to it.
   *
   * The digits are added rather than converted, so a total past what a
   * JavaScript number holds is exact. A total outside the range DynamoDB
   * stores is refused the same way one a request wrote would be.
   */
  plus(other: SimDynamoDbNumber): SimDynamoDbNumber {
    return SimDynamoDbNumber.of(
      sumSimDynamoDbNumberTexts(this.text, other.text, 1),
    );
  }

  /**
   * This number with another taken away from it.
   */
  minus(other: SimDynamoDbNumber): SimDynamoDbNumber {
    return SimDynamoDbNumber.of(
      sumSimDynamoDbNumberTexts(this.text, other.text, -1),
    );
  }

  /**
   * The bytes this number counts towards the item size.
   *
   * Real DynamoDB counts a number as about one byte per two significant digits,
   * plus one.
   */
  get sizeInBytes(): number {
    return Math.ceil(this.significantDigits / 2) + 1;
  }

  /**
   * Whether this number is below zero.
   */
  private get negative(): boolean {
    return this.text.startsWith("-");
  }

  /**
   * Which way round this number goes against one of the other sign.
   */
  private signOrder(): number {
    if (this.negative) {
      return -1;
    }

    return 1;
  }

  /**
   * The digits of this number, without the sign in front of them.
   */
  private withoutSign(): string {
    return this.text.replace("-", "");
  }
}
