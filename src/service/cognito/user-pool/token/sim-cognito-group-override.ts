/* eslint-disable security/detect-object-injection -- every lookup here is a
   field name this simulation asks for, such as `groupsToOverride`, read out of
   the plain object a trigger handler returned. */
import {
  refuseSimCognitoResponse,
  requireSimCognitoResponseObject,
  requireSimCognitoResponseStrings,
} from "./sim-cognito-claims-override-values.js";

/**
 * The fields of `groupOverrideDetails` that name IAM roles.
 *
 * Both feed claims this simulation does not issue, so a handler naming one is
 * refused rather than half-applied: the groups would change and the roles the
 * handler asked for would silently not be there.
 */
const roleOverrideFields = ["iamRolesToOverride", "preferredRole"] as const;

/**
 * The groups a handler asked the `cognito:groups` claim to carry, or nothing
 * when it said nothing about groups and the user's own are to stand.
 *
 * A `groupOverrideDetails` that is there but empty, or null, suppresses the
 * claim, as it does on real Cognito. That is why the key being present is what
 * matters rather than what it holds.
 */
export function readSimCognitoGroupOverride(
  details: Record<string, unknown>,
): readonly string[] | undefined {
  if (!("groupOverrideDetails" in details)) {
    return undefined;
  }

  const overrideDetails: unknown = details["groupOverrideDetails"];

  if (overrideDetails === undefined || overrideDetails === null) {
    return [];
  }

  const group = requireSimCognitoResponseObject(
    overrideDetails,
    "groupOverrideDetails",
  );

  refuseRoleOverrides(group);

  return requireSimCognitoResponseStrings(
    group["groupsToOverride"],
    "groupsToOverride",
  );
}

/**
 * Refuse a group override naming IAM roles.
 *
 * A field that is there and names no role is left alone, so a handler copying
 * the request's group configuration back into its response, which is how real
 * Cognito says to leave the groups as they are, is accepted.
 */
function refuseRoleOverrides(group: Record<string, unknown>): void {
  for (const field of roleOverrideFields) {
    const value: unknown = group[field];

    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    refuseSimCognitoResponse(
      `a groupOverrideDetails naming ${field}. The cognito:roles and ` +
        `cognito:preferred_role claims are not issued on a token here, so ` +
        `the roles it names would go nowhere while its groups were applied.`,
    );
  }
}
