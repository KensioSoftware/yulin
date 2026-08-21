import type { SimSdkCommandRoute } from "../../../sdk/index.js";
import type {
  SimCompleteWebAuthnRegistrationCommand,
  SimDeleteWebAuthnCredentialCommand,
  SimListWebAuthnCredentialsCommand,
  SimStartWebAuthnRegistrationCommand,
} from "../command/user/web-authn.command.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";

/**
 * The SDK Command routes for a user's passkeys.
 *
 * None of them reads a caller from the SDK context, because real Cognito
 * authorizes all four with the user's own access token and no IAM policy at
 * all.
 */
export function simCognitoSdkWebAuthnRoutes(
  simCognito: SimCognitoIdentityProvider,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "StartWebAuthnRegistrationCommand",
      async (command): Promise<unknown> =>
        await simCognito.startWebAuthnRegistration(
          command as SimStartWebAuthnRegistrationCommand,
        ),
    ],
    [
      "CompleteWebAuthnRegistrationCommand",
      async (command): Promise<unknown> =>
        await simCognito.completeWebAuthnRegistration(
          command as SimCompleteWebAuthnRegistrationCommand,
        ),
    ],
    [
      "ListWebAuthnCredentialsCommand",
      async (command): Promise<unknown> =>
        await simCognito.listWebAuthnCredentials(
          command as SimListWebAuthnCredentialsCommand,
        ),
    ],
    [
      "DeleteWebAuthnCredentialCommand",
      async (command): Promise<unknown> =>
        await simCognito.deleteWebAuthnCredential(
          command as SimDeleteWebAuthnCredentialCommand,
        ),
    ],
  ];
}
