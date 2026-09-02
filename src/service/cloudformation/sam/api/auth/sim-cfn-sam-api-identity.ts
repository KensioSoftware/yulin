import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../../sim-cfn-sam-record.js";
import { samIdentityPropertyNames } from "./sim-cfn-sam-identity-prefixes.js";
import type { SamApiIdentityProperties } from "./sim-cfn-sam-identity-source.js";
import {
  samIdentityError,
  samIdentitySource,
} from "./sim-cfn-sam-identity-source.js";
import { samUnsupportedIdentity } from "./sim-cfn-sam-unsupported-auth.js";

/**
 * What an authorizer reads off a request, and how long it may reuse the answer
 * it gave for it.
 */
export interface SamApiIdentity {
  /** The request parts the authorizer is keyed on, in declaration order. */
  readonly identitySource: readonly string[];
  /** The `AuthorizerResultTtlInSeconds` the authorizer is created with. */
  readonly reauthorizeEvery: SimCfnTemplateValue | undefined;
}

/**
 * The `Identity` block of one authorizer, as the identity source and result
 * TTL an authorizer Resource is created with.
 *
 * An authorizer stating no `Identity` reads nothing off the request by name,
 * and the Resource it becomes is left to whatever the command requires of its
 * type.
 */
export function samApiIdentity(
  properties: SamApiIdentityProperties,
): SamApiIdentity {
  const declared = properties.authorizer["Identity"];

  if (declared === undefined) {
    return { identitySource: [], reauthorizeEvery: undefined };
  }

  if (!isSamTemplateRecord(declared)) {
    throw samIdentityError(properties, "Identity", "it is not a block");
  }

  for (const name of Object.keys(declared)) {
    if (!samIdentityPropertyNames.has(name)) {
      throw samIdentityError(
        properties,
        `Identity.${name}`,
        samUnsupportedIdentity.get(name) ??
          "it is not an Identity property this expansion knows",
      );
    }
  }

  return {
    identitySource: samIdentitySource(properties, declared),
    reauthorizeEvery: declared["ReauthorizeEvery"],
  };
}
