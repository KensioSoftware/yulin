import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
} from "../../../sdk/index.js";
import type {
  SimAdminInitiateAuthCommand,
  SimAdminRespondToAuthChallengeCommand,
  SimAdminUserGlobalSignOutCommand,
  SimGlobalSignOutCommand,
  SimInitiateAuthCommand,
  SimRespondToAuthChallengeCommand,
} from "../command/auth/auth.command.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";

/**
 * The SDK Command routes for signing in and signing out.
 *
 * The client-side routes read no caller from the SDK context, because real
 * Cognito authorizes them with no IAM policy: a browser calling `InitiateAuth`
 * holds no AWS credentials at all.
 */
export function simCognitoSdkAuthRoutes(
  simCognito: SimCognitoIdentityProvider,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "AdminInitiateAuthCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminInitiateAuth(
          command as SimAdminInitiateAuthCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "AdminRespondToAuthChallengeCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminRespondToAuthChallenge(
          command as SimAdminRespondToAuthChallengeCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "InitiateAuthCommand",
      async (command): Promise<unknown> =>
        await simCognito.initiateAuth(command as SimInitiateAuthCommand),
    ],
    [
      "RespondToAuthChallengeCommand",
      async (command): Promise<unknown> =>
        await simCognito.respondToAuthChallenge(
          command as SimRespondToAuthChallengeCommand,
        ),
    ],
    [
      "GlobalSignOutCommand",
      async (command): Promise<unknown> =>
        await simCognito.globalSignOut(command as SimGlobalSignOutCommand),
    ],
    [
      "AdminUserGlobalSignOutCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminUserGlobalSignOut(
          command as SimAdminUserGlobalSignOutCommand,
          simSdkCallerOptions(context),
        ),
    ],
  ];
}
