import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import {
  isNumeric,
  type SimCognitoAttributeDataType,
} from "./sim-cognito-attribute-data-type.js";
import { SimCognitoNumberConstraints } from "./sim-cognito-number-constraints.js";
import { SimCognitoStringConstraints } from "./sim-cognito-string-constraints.js";

/**
 * How long the value of a `String` attribute may be.
 *
 * Cognito carries both bounds as strings, which is how the API reports them
 * back as well.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_StringAttributeConstraintsType.html
 */
export interface SimCognitoStringAttributeConstraintsType {
  readonly MinLength?: string | undefined;
  readonly MaxLength?: string | undefined;
}

/**
 * The range the value of a `Number` attribute may be in.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_NumberAttributeConstraintsType.html
 */
export interface SimCognitoNumberAttributeConstraintsType {
  readonly MinValue?: string | undefined;
  readonly MaxValue?: string | undefined;
}

/**
 * The bounds a schema attribute declares, whichever kind it has.
 */
export interface SimCognitoAttributeConstraintsType {
  readonly StringAttributeConstraints?:
    | SimCognitoStringAttributeConstraintsType
    | undefined;
  readonly NumberAttributeConstraints?:
    | SimCognitoNumberAttributeConstraintsType
    | undefined;
}

/**
 * What one attribute's declared bounds do: refuse a value outside them, and
 * report themselves back as the declaration wrote them.
 */
export interface SimCognitoAttributeConstraints {
  requireValue(value: string): void;
  toOutput(): SimCognitoAttributeConstraintsType;
}

/**
 * One kind of bounds, already read out of the declaration.
 */
export interface SimCognitoAttributeBounds {
  readonly attributeName: string;
  readonly minimum: number | undefined;
  readonly maximum: number | undefined;
}

interface SimCognitoAttributeConstraintsProperties {
  readonly declared: SimCognitoAttributeConstraintsType;
  readonly dataType: SimCognitoAttributeDataType;
  readonly attributeName: string;
}

/**
 * The bounds one schema attribute holds its values to.
 *
 * A `String` attribute is bounded by length and a `Number` attribute by value,
 * and Cognito refuses the constraints of the wrong kind rather than applying
 * neither, so a declaration that could not have created the pool on real AWS
 * does not create one here.
 */
export function simCognitoAttributeConstraintsFor(
  properties: SimCognitoAttributeConstraintsProperties,
): SimCognitoAttributeConstraints {
  const { declared, dataType, attributeName } = properties;
  const range = declared.NumberAttributeConstraints;
  const lengths = declared.StringAttributeConstraints;

  requireDeclarationOfItsKind(properties);

  if (dataType.isNumber) {
    return new SimCognitoNumberConstraints({
      attributeName,
      minimum: bound(attributeName, "MinValue", range?.MinValue),
      maximum: bound(attributeName, "MaxValue", range?.MaxValue),
      declared: range,
    });
  }

  return new SimCognitoStringConstraints({
    attributeName,
    minimum: bound(attributeName, "MinLength", lengths?.MinLength),
    maximum: bound(attributeName, "MaxLength", lengths?.MaxLength),
    declared: lengths,
  });
}

/**
 * Refuse constraints of a kind the attribute's type has no use for.
 *
 * Real Cognito refuses these too, so a schema declaring a `MaxValue` on a
 * `String` fails on the way to AWS rather than deploying with a bound nothing
 * applies.
 */
function requireDeclarationOfItsKind(
  properties: SimCognitoAttributeConstraintsProperties,
): void {
  const { declared, dataType, attributeName } = properties;

  if (declared.StringAttributeConstraints !== undefined && !dataType.isString) {
    throw refusal(
      attributeName,
      "has StringAttributeConstraints, which only a String attribute takes",
    );
  }

  if (declared.NumberAttributeConstraints !== undefined && !dataType.isNumber) {
    throw refusal(
      attributeName,
      "has NumberAttributeConstraints, which only a Number attribute takes",
    );
  }
}

/**
 * Read one declared bound, which Cognito carries as a string.
 */
function bound(
  attributeName: string,
  field: string,
  declared: string | undefined,
): number | undefined {
  if (declared === undefined) {
    return undefined;
  }

  if (!isNumeric(declared)) {
    throw refusal(
      attributeName,
      `has a ${field} of '${declared}', which is not a number`,
    );
  }

  return Number(declared);
}

function refusal(
  attributeName: string,
  says: string,
): SimCognitoInvalidParameterException {
  return new SimCognitoInvalidParameterException(
    `Schema attribute '${attributeName}' ${says}`,
  );
}
