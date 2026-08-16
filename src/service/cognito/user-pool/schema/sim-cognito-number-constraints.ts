import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type {
  SimCognitoAttributeBounds,
  SimCognitoAttributeConstraints,
  SimCognitoAttributeConstraintsType,
  SimCognitoNumberAttributeConstraintsType,
} from "./sim-cognito-attribute-constraints.js";

interface SimCognitoNumberConstraintsProperties extends SimCognitoAttributeBounds {
  readonly declared: SimCognitoNumberAttributeConstraintsType | undefined;
}

/**
 * The range the values of one `Number` attribute may be in.
 *
 * An attribute declared without either bound takes any number, as it does on
 * real Cognito: the type is what refuses a value that is not one at all.
 */
export class SimCognitoNumberConstraints implements SimCognitoAttributeConstraints {
  private readonly attributeName: string;
  private readonly minimum: number | undefined;
  private readonly maximum: number | undefined;
  private readonly declared:
    | SimCognitoNumberAttributeConstraintsType
    | undefined;

  constructor(properties: SimCognitoNumberConstraintsProperties) {
    this.attributeName = properties.attributeName;
    this.minimum = properties.minimum;
    this.maximum = properties.maximum;
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

    return { NumberAttributeConstraints: { ...this.declared } };
  }

  /**
   * Refuse a value outside the range.
   */
  requireValue(value: string): void {
    const number = Number(value);

    if (this.minimum !== undefined && number < this.minimum) {
      throw new SimCognitoInvalidParameterException(
        `User attribute '${this.attributeName}' is below the MinValue of ` +
          `${String(this.minimum)} the pool's schema sets`,
      );
    }

    if (this.maximum !== undefined && number > this.maximum) {
      throw new SimCognitoInvalidParameterException(
        `User attribute '${this.attributeName}' is above the MaxValue of ` +
          `${String(this.maximum)} the pool's schema sets`,
      );
    }
  }
}
