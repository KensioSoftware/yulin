/**
 * The arrangement the passkey test files share: a pool that registers passkeys
 * against a relying party, and a user signed in with a password.
 *
 * A passkey is registered from a session that already exists, so the password
 * sign-in is not incidental: it is what a first passkey is added from.
 *
 * It lives under `test/` for the same reasons as `test/cognito/cfn-deploy.ts`:
 * a test file cannot export helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else and excluded from the
 * published build.
 */

import {
  CompleteWebAuthnRegistrationCommand,
  SetUserPoolMfaConfigCommand,
  StartWebAuthnRegistrationCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import type { SimCognitoWebAuthnCredentialDocument } from "../../src/service/cognito/index.js";
import type { SimCognitoSignedInSetUp } from "./signed-in-fixture.js";
import { simCognitoSignedIn, simCognitoUsername } from "./signed-in-fixture.js";

/**
 * The domain the pool in these tests registers passkeys against.
 */
export const simCognitoRelyingPartyId = "myapp.example.com";

/**
 * A signed-in user of a pool configured to register passkeys.
 */
export async function simCognitoWithPasskeyPool(): Promise<SimCognitoSignedInSetUp> {
  const setUp = await simCognitoSignedIn();

  await setUp.cognito.setUserPoolMfaConfig(
    new SetUserPoolMfaConfigCommand({
      UserPoolId: setUp.userPoolId,
      MfaConfiguration: "OPTIONAL",
      WebAuthnConfiguration: {
        RelyingPartyId: simCognitoRelyingPartyId,
        UserVerification: "required",
      },
    }),
  );

  return setUp;
}

/**
 * The credential the user's own authenticator would have made for the
 * registration it has been given options for.
 */
export function simCognitoPasskeyCredential(
  setUp: SimCognitoSignedInSetUp,
): SimCognitoWebAuthnCredentialDocument {
  return setUp.cognito
    .userPool(setUp.userPoolId)
    .webAuthnCredential(simCognitoUsername);
}

/**
 * Register a passkey for the signed-in user, in the two calls real Cognito
 * takes.
 */
export async function simCognitoRegisterPasskey(
  setUp: SimCognitoSignedInSetUp,
): Promise<SimCognitoWebAuthnCredentialDocument> {
  await setUp.cognito.startWebAuthnRegistration(
    new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
  );

  const credential = simCognitoPasskeyCredential(setUp);

  await setUp.cognito.completeWebAuthnRegistration(
    new CompleteWebAuthnRegistrationCommand({
      AccessToken: setUp.accessToken,
      Credential: credential,
    }),
  );

  return credential;
}
