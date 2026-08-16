import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * The kinds of value a Cognito attribute can hold.
 */
export type SimCognitoAttributeDataTypeValue =
  | "Boolean"
  | "DateTime"
  | "Number"
  | "String";

const dataTypeValues: ReadonlySet<string> = new Set([
  "Boolean",
  "DateTime",
  "Number",
  "String",
]);

/**
 * What kind of value one attribute in a pool's schema holds.
 *
 * An attribute declared without one is a `String`, which is what real Cognito
 * defaults it to and what a CDK `StringAttribute` states anyway.
 *
 * Every attribute value is carried as a string on the wire, whatever its type,
 * so this is what decides whether the string a request sent is one the
 * attribute could hold. Real Cognito checks the same thing, and a value it
 * would refuse is refused here rather than stored and read back as something
 * an application cannot parse.
 */
export class SimCognitoAttributeDataType {
  public readonly value: SimCognitoAttributeDataTypeValue;

  constructor(requested: string | undefined, attributeName: string) {
    if (requested === undefined) {
      this.value = "String";
      return;
    }

    if (!dataTypeValues.has(requested)) {
      throw new SimCognitoInvalidParameterException(
        `Schema attribute '${attributeName}' has an AttributeDataType of ` +
          `'${requested}', which is not a Cognito attribute type: use ${[
            ...dataTypeValues,
          ].join(", ")}`,
      );
    }

    this.value = requested as SimCognitoAttributeDataTypeValue;
  }

  /** Whether values of this type are numbers rather than text. */
  get isNumber(): boolean {
    return this.value === "Number";
  }

  /** Whether values of this type are bounded by a length. */
  get isString(): boolean {
    return this.value === "String";
  }

  /**
   * Refuse a value this type could not hold.
   *
   * A `String` holds anything, so only the other three have anything to say.
   * A `DateTime` is taken as an ISO 8601 instant or the seconds since the
   * epoch, which are the two forms an application writes one in.
   */
  requireValue(attributeName: string, value: string): void {
    if (this.holds(value)) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      `User attribute '${attributeName}' is '${value}', which is not a ` +
        `${this.value}: the pool's schema declares the attribute as a ` +
        `${this.value}, and Cognito refuses a value it cannot read as one`,
    );
  }

  private holds(value: string): boolean {
    switch (this.value) {
      case "Boolean": {
        return value === "true" || value === "false";
      }
      case "DateTime": {
        return !Number.isNaN(Date.parse(value)) || isNumeric(value);
      }
      case "Number": {
        return isNumeric(value);
      }
      case "String": {
        return true;
      }
    }
  }
}

/**
 * Whether a string is a number Cognito would read as one.
 *
 * An empty string is not, although `Number("")` is zero, because a request
 * sending nothing at all is not sending a number. `Infinity` is not either,
 * although `Number` reads it: Cognito holds a number as a number, and there is
 * no such value to hold.
 */
export function isNumeric(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}
