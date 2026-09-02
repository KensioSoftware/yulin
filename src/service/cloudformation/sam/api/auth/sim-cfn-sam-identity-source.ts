import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samAuthError } from "./sim-cfn-sam-api-auth.js";
import type { SamApiAuthApi } from "./sim-cfn-sam-api-auth.types.js";

/**
 * What one authorizer's `Identity` block is read against.
 */
export interface SamApiIdentityProperties {
  readonly api: SamApiAuthApi;
  /** The name the `Authorizers` map declared this authorizer under. */
  readonly authorizerName: string;
  /** The authorizer's own properties, which may declare no `Identity` at all. */
  readonly authorizer: SimCfnTemplateValueRecord;
  /** How the API this authorizer belongs to names the parts of a request. */
  readonly prefixes: ReadonlyMap<string, string>;
}

/**
 * The request parts the authorizer is keyed on, in the order the API names
 * them.
 *
 * The singular `Header` a Cognito or `TOKEN` authorizer states reads as a
 * `Headers` of one, so both spellings arrive under the same prefix.
 */
export function samIdentitySource(
  properties: SamApiIdentityProperties,
  identity: SimCfnTemplateValueRecord,
): readonly string[] {
  return properties.prefixes
    .entries()
    .flatMap(([name, prefix]) =>
      identityNames(properties, identity, name).map(
        (part) => `${prefix}${part}`,
      ),
    )
    .toArray();
}

/**
 * The error a property of an authorizer's `Identity` block is refused with.
 */
export function samIdentityError(
  properties: SamApiIdentityProperties,
  property: string,
  reason: string,
): Error {
  return samAuthError(
    properties.api,
    `Auth.Authorizers.${properties.authorizerName}.${property}`,
    reason,
  );
}

function identityNames(
  properties: SamApiIdentityProperties,
  identity: SimCfnTemplateValueRecord,
  name: string,
): readonly string[] {
  const singular = name === "Headers" ? identity["Header"] : undefined;
  // oxlint-disable-next-line security/detect-object-injection -- a template record read by one of the Identity property names.
  const declared = identity[name];

  return [
    ...(singular === undefined ? [] : [singular]),
    ...asList(properties, name, declared),
  ].map((value) => identityName(properties, name, value));
}

function asList(
  properties: SamApiIdentityProperties,
  name: string,
  declared: SimCfnTemplateValue | undefined,
): readonly SimCfnTemplateValue[] {
  if (declared === undefined) {
    return [];
  }

  if (!Array.isArray(declared)) {
    throw samIdentityError(
      properties,
      `Identity.${name}`,
      "it is not a list of names",
    );
  }

  return declared;
}

function identityName(
  properties: SamApiIdentityProperties,
  name: string,
  value: SimCfnTemplateValue,
): string {
  if (typeof value !== "string") {
    throw samIdentityError(
      properties,
      `Identity.${name}`,
      "it names a part of the request as something other than a string",
    );
  }

  return value;
}
