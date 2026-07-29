import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";

/**
 * The one authentication flow this simulation runs.
 */
export const adminUserPasswordFlow = "ADMIN_USER_PASSWORD_AUTH";

/**
 * The app client setting that opens that flow.
 */
const adminUserPasswordAuthFlow = "ALLOW_ADMIN_USER_PASSWORD_AUTH";

/**
 * The challenge this simulation can answer.
 */
export const newPasswordRequiredChallenge = "NEW_PASSWORD_REQUIRED";

/**
 * Refuse an authentication flow this simulation does not run.
 *
 * The others are refused rather than treated as this one, because which flow
 * a request uses decides what the app client has to be configured for and
 * what the caller has to send.
 */
export function requireSimCognitoAdminUserPasswordFlow(
  authFlow: string | undefined,
): void {
  if (authFlow === adminUserPasswordFlow) {
    return;
  }

  throw new SimCognitoInvalidParameterException(
    `AuthFlow '${String(authFlow)}' is not simulated: ` +
      `${adminUserPasswordFlow} is the only flow this simulation runs. SRP, ` +
      `custom authentication and refresh token flows are not implemented.`,
  );
}

/**
 * Refuse a challenge this simulation cannot answer.
 */
export function requireSimCognitoNewPasswordChallenge(
  challengeName: string | undefined,
): void {
  if (challengeName === newPasswordRequiredChallenge) {
    return;
  }

  throw new SimCognitoInvalidParameterException(
    `ChallengeName '${String(challengeName)}' is not simulated: ` +
      `${newPasswordRequiredChallenge} is the only challenge this ` +
      `simulation issues.`,
  );
}

/**
 * Refuse a flow the app client is not configured for.
 *
 * Real Cognito refuses this before it looks at the user at all, which is why
 * a client created without the flow fails the same way whatever the password
 * was.
 */
export function requireSimCognitoFlowEnabled(
  client: SimCognitoUserPoolClient,
): void {
  if (client.explicitAuthFlows.allows(adminUserPasswordAuthFlow)) {
    return;
  }

  throw new SimCognitoInvalidParameterException(
    `${adminUserPasswordFlow} is not enabled for the client ${client.id}: ` +
      `create the app client with ${adminUserPasswordAuthFlow} among its ` +
      `ExplicitAuthFlows`,
  );
}
