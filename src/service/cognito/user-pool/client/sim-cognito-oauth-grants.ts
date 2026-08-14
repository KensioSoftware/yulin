import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * The OAuth grant this simulation runs.
 *
 * The implicit grant hands tokens to the browser in a URL fragment, and the
 * client credentials grant needs the resource servers that define the scopes
 * it is made for. Neither is simulated, so a client asking for one is refused
 * rather than given an authorization server that would not answer it.
 */
export const simCognitoSimulatedOAuthFlow = "code";

const oauthFlows = new Set([
  simCognitoSimulatedOAuthFlow,
  "implicit",
  "client_credentials",
]);

/**
 * The scopes a pool defines without a resource server.
 *
 * A custom scope belongs to a resource server, which is not simulated, so a
 * client is held to these.
 */
const systemScopes = new Set([
  "openid",
  "email",
  "phone",
  "profile",
  "aws.cognito.signin.user.admin",
]);

/**
 * The OAuth grants an app client asked to be able to make.
 */
export function simCognitoRequiredOAuthFlows(
  requested: readonly string[] | undefined,
): readonly string[] {
  const flows = [...(requested ?? [])];

  for (const flow of flows) {
    if (!oauthFlows.has(flow)) {
      throw new SimCognitoInvalidParameterException(
        `AllowedOAuthFlows '${flow}' is not an OAuth flow: the flows are ` +
          `${oauthFlows.values().toArray().join(", ")}.`,
      );
    }

    if (flow !== simCognitoSimulatedOAuthFlow) {
      throw new SimCognitoInvalidParameterException(
        `AllowedOAuthFlows '${flow}' is not simulated: the grant would be ` +
          `offered here and answered on real AWS. Only '${simCognitoSimulatedOAuthFlow}' ` +
          `is supported.`,
      );
    }
  }

  return flows;
}

/**
 * The scopes an app client asked to be able to grant.
 */
export function simCognitoRequiredOAuthScopes(
  requested: readonly string[] | undefined,
): readonly string[] {
  const scopes = [...(requested ?? [])];

  for (const scope of scopes) {
    if (!systemScopes.has(scope)) {
      throw new SimCognitoInvalidParameterException(
        `AllowedOAuthScopes '${scope}' is not simulated: a custom scope ` +
          `belongs to a resource server, which is not simulated. The ` +
          `system scopes are ${systemScopes.values().toArray().join(", ")}.`,
      );
    }
  }

  return scopes;
}
