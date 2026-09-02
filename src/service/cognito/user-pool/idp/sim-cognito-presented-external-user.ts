import type { SimCognitoAuthorizeInput } from "../../command/hosted/hosted-auth.command.js";
import { SimCognitoProviderSignInRequired } from "../../error/sim-cognito-managed-login.error.js";
import { SimCognitoExternalUser } from "./sim-cognito-external-user.js";
import type { SimCognitoUserPoolIdentityProvider } from "./sim-cognito-user-pool-identity-provider.js";

/**
 * What a claim field is called on the stand-in provider page.
 *
 * The names after it are the provider's own claim names, so they are prefixed
 * to keep them apart from the authorize parameters the form posts beside them.
 */
export const simCognitoClaimFieldPrefix = "claim_";

/**
 * The address a claim the page reads as an email address is pre-filled with.
 *
 * `example.com` is reserved for exactly this, so nothing a person leaves
 * unedited can reach a real mailbox.
 */
const defaultAddress = "someone@example.com";

/**
 * What every other claim is pre-filled with.
 */
const defaultClaimValue = "Someone";

/**
 * The claim names a provider's attribute mapping reads.
 *
 * The mapping is keyed by pool attribute and valued by claim, so the values
 * are what a provider would have asserted and what the page asks for.
 */
export function simCognitoMappedClaimNames(
  provider: SimCognitoUserPoolIdentityProvider,
): readonly string[] {
  return [...new Set(Object.values(provider.attributeMapping.toOutput()))];
}

/**
 * What one claim field is pre-filled with, so the page signs a user in when
 * nobody edits it.
 *
 * The pool attribute type decides the shape. A string claim whose name refers
 * to an email address uses the reserved address.
 */
export function simCognitoDefaultClaim(
  provider: SimCognitoUserPoolIdentityProvider,
  claimName: string,
): string {
  const dataType =
    provider.attributeMapping
      .dataTypesForClaim(claimName)
      .find((mappedType) => mappedType !== "String") ?? "String";

  switch (dataType) {
    case "Boolean": {
      return "true";
    }
    case "DateTime": {
      return "1970-01-01T00:00:00.000Z";
    }
    case "Number": {
      return "0";
    }
    case "String": {
      return claimName.toLowerCase().includes("email")
        ? defaultAddress
        : defaultClaimValue;
    }
  }
}

/**
 * The subject the page pre-fills, which says on its face where it came from.
 */
export function simCognitoDefaultSubject(
  provider: SimCognitoUserPoolIdentityProvider,
): string {
  return `simulated-${provider.name.toLowerCase()}-subject`;
}

/**
 * The external user an authorize request presented, where it presented one.
 *
 * This is the stand-in page for a provider coming back. Nothing is kept on the
 * provider afterwards, because real Cognito asks the provider afresh on every
 * authorize request, and `signInAs` stays what a test says it with.
 */
export function simCognitoPresentedExternalUser(
  input: SimCognitoAuthorizeInput,
): SimCognitoExternalUser | undefined {
  const { subject } = input;

  if (subject === undefined || subject === "") {
    return undefined;
  }

  return new SimCognitoExternalUser({
    Subject: subject,
    Claims: simCognitoPresentedClaims(input),
  });
}

/**
 * Who a provider is signing in for one authorize request.
 *
 * A request presenting a subject of its own is the stand-in page for the
 * provider coming back, and it wins, because real Cognito asks the provider
 * afresh every time rather than remembering the last answer. Where it presents
 * none, the user `signInAs` put at the provider signs in. Where there is
 * neither, the request is refused with what a served domain draws that page
 * from.
 */
export function requireSimCognitoSigningInAt(
  provider: SimCognitoUserPoolIdentityProvider,
  input: SimCognitoAuthorizeInput,
): SimCognitoExternalUser {
  const presented =
    simCognitoPresentedExternalUser(input) ?? provider.signedInUser;

  if (presented === undefined) {
    throw new SimCognitoProviderSignInRequired(provider.name);
  }

  return presented;
}

/**
 * The claims a posted form carried, by the provider's own claim names.
 */
function simCognitoPresentedClaims(
  input: SimCognitoAuthorizeInput,
): Record<string, string> {
  const claims: Record<string, string> = {};
  const fields: readonly (readonly [string, string | undefined])[] =
    Object.entries(input);

  for (const [name, value] of fields) {
    if (value !== undefined && name.startsWith(simCognitoClaimFieldPrefix)) {
      claims[name.slice(simCognitoClaimFieldPrefix.length)] = value;
    }
  }

  return claims;
}
