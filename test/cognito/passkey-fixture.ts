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

import { createHash } from "node:crypto";

import {
  CompleteWebAuthnRegistrationCommand,
  SetUserPoolMfaConfigCommand,
  StartWebAuthnRegistrationCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import type {
  SimCognitoWebAuthnCredentialDocument,
  SimCognitoWebAuthnDocumentValue,
} from "../../src/service/cognito/index.js";
import type {
  SimCognitoSignedInOptions,
  SimCognitoSignedInSetUp,
} from "./signed-in-fixture.js";
import { simCognitoSignedIn, simCognitoUsername } from "./signed-in-fixture.js";

/**
 * The domain the pool in these tests registers passkeys against.
 */
export const simCognitoRelyingPartyId = "myapp.example.com";

/**
 * A signed-in user of a pool configured to register passkeys.
 *
 * The app client allows both the password flow the user signs in with and the
 * choice-based one a passkey is presented through.
 */
export async function simCognitoWithPasskeyPool(
  options: SimCognitoSignedInOptions = {},
): Promise<SimCognitoSignedInSetUp> {
  const setUp = await simCognitoSignedIn({
    explicitAuthFlows: [
      "ALLOW_USER_PASSWORD_AUTH",
      "ALLOW_ADMIN_USER_PASSWORD_AUTH",
      "ALLOW_USER_AUTH",
    ],
    ...options,
  });

  await setUp.cognito.updateUserPool(
    new UpdateUserPoolCommand({
      UserPoolId: setUp.userPoolId,
      Policies: {
        SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD", "WEB_AUTHN"] },
      },
    }),
  );

  await setUp.cognito.setUserPoolMfaConfig(
    new SetUserPoolMfaConfigCommand({
      UserPoolId: setUp.userPoolId,
      MfaConfiguration: options.mfaConfiguration ?? "OPTIONAL",
      SoftwareTokenMfaConfiguration: { Enabled: true },
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

/**
 * A JSON value as a credential carries one, which is base64url of its bytes.
 */
export function simCognitoBase64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * The client data a credential was signed over, read back as the JSON it is.
 */
export function simCognitoClientDataOf(
  credential: SimCognitoWebAuthnCredentialDocument,
): Record<string, unknown> {
  const encoded = credential.response.clientDataJSON;
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");

  return JSON.parse(decoded) as Record<string, unknown>;
}

/**
 * The authenticator data a credential would carry if it had been signed for
 * another domain, which is the hash of that domain and the same flags.
 */
export function simCognitoAuthenticatorDataFor(relyingPartyId: string): string {
  const flags = Buffer.alloc(5);

  flags.writeUInt8(0x05, 0);
  flags.writeUInt32BE(0, 1);

  return Buffer.concat([
    createHash("sha256").update(relyingPartyId).digest(),
    flags,
  ]).toString("base64url");
}

/**
 * The credential a real authenticator made, with one member of it changed.
 */
export function simCognitoCredentialWith(
  credential: SimCognitoWebAuthnCredentialDocument,
  response: Record<string, SimCognitoWebAuthnDocumentValue>,
): Record<string, SimCognitoWebAuthnDocumentValue> {
  return {
    ...credential,
    response: { ...credential.response, ...response },
  };
}

/**
 * The credential the user's own authenticator would have presented for the
 * `WEB_AUTHN` challenge a session was issued with, as the JSON a challenge
 * response carries it as.
 */
export function simCognitoPasskeyAssertion(
  setUp: SimCognitoSignedInSetUp,
  session: string,
): string {
  return JSON.stringify(
    setUp.cognito.userPool(setUp.userPoolId).webAuthnAssertion(session),
  );
}
