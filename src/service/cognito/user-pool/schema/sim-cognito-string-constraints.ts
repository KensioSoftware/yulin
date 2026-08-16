import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type {
  SimCognitoAttributeBounds,
  SimCognitoAttributeConstraints,
  SimCognitoAttributeConstraintsType,
  SimCognitoStringAttributeConstraintsType,
} from "./sim-cognito-attribute-constraints.js";

/**
 * The longest value Cognito holds in any attribute, whatever its schema says.
 */
const maxAttributeValueLength = 2048;

interface SimCognitoStringConstraintsProperties extends SimCognitoAttributeBounds {
  readonly declared: SimCognitoStringAttributeConstraintsType | undefined;
}

/**
 * How long the values of one attribute may be.
 *
 * An attribute with no `MaxLength` of its own still stops at the 2048
 * characters Cognito holds any attribute to, which is the bound every pool
 * applied before a schema could narrow it.
 *
 * These are the bounds of anything that is not a `Number`. A `Boolean` and a
 * `DateTime` take no constraints of their own, and the values either of them
 * could hold are well inside this length anyway.
 */
export class SimCognitoStringConstraints implements SimCognitoAttributeConstraints {
  private readonly attributeName: string;
  private readonly minimum: number | undefined;
  private readonly maximum: number;
  private readonly declared:
    | SimCognitoStringAttributeConstraintsType
    | undefined;

  constructor(properties: SimCognitoStringConstraintsProperties) {
    this.attributeName = properties.attributeName;
    this.minimum = properties.minimum;
    this.maximum = properties.maximum ?? maxAttributeValueLength;
    this.declared = properties.declared;
  }

  /**
   * These bounds as a described pool reports them, in the shape the
   * declaration gave them.
   */
  toOutput(): SimCognitoAttributeConstraintsType {
    if (this.declared === undefined) {
      return {};
    }

    return { StringAttributeConstraints: { ...this.declared } };
  }

  /**
   * Refuse a value of the wrong length.
   */
  requireValue(value: string): void {
    if (value.length > this.maximum) {
      throw new SimCognitoInvalidParameterException(
        `User attribute '${this.attributeName}' is longer than the ` +
          `${String(this.maximum)} characters the pool's schema allows`,
      );
    }

    if (this.minimum !== undefined && value.length < this.minimum) {
      throw new SimCognitoInvalidParameterException(
        `User attribute '${this.attributeName}' is shorter than the ` +
          `${String(this.minimum)} characters the pool's schema wants`,
      );
    }
  }
}
