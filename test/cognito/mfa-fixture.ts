/**
 * The arrangement the MFA sign-in test files share: a pool that challenges for
 * a second factor, and a user that has registered one.
 *
 * It lives under `test/` for the same reasons as `test/cognito/cfn-deploy.ts`:
 * a test file cannot export helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else and excluded from the
 * published build.
 */

import type { ExplicitAuthFlowsType } from "@aws-sdk/client-cognito-identity-provider";
import {
  AssociateSoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertNonNullable } from "@kensio/smartass";

import type { SimCognitoIdentityProvider } from "../../src/service/cognito/index.js";
import type { SimCognitoSignedInSetUp } from "./signed-in-fixture.js";
import { simCognitoSignedIn, simCognitoUsername } from "./signed-in-fixture.js";

/**
 * The number the pool texts an `SMS_MFA` code to.
 */
export const simCognitoPhoneNumber = "+441632960123";

/**
 * The authentication flows the MFA tests need, which are both password flows:
 * a challenge is issued on either side of the API.
 */
const bothPasswordFlows: ExplicitAuthFlowsType[] = [
  "ALLOW_USER_PASSWORD_AUTH",
  "ALLOW_ADMIN_USER_PASSWORD_AUTH",
];

/**
 * A user of an `OPTIONAL` pool with a phone number, registered for `SMS_MFA`.
 *
 * The access token the fixture carries is the one from the sign-in before the
 * factor was registered, which is what a real application would have been
 * holding when it turned MFA on.
 */
export async function simCognitoWithSmsFactor(): Promise<SimCognitoSignedInSetUp> {
  const setUp = await simCognitoSignedIn({
    mfaConfiguration: "OPTIONAL",
    explicitAuthFlows: bothPasswordFlows,
    attributes: [{ Name: "phone_number", Value: simCognitoPhoneNumber }],
  });

  await setUp.cognito.setUserMFAPreference(
    new SetUserMFAPreferenceCommand({
      AccessToken: setUp.accessToken,
      SMSMfaSettings: { Enabled: true, PreferredMfa: true },
    }),
  );

  return setUp;
}

/**
 * A user of an `OPTIONAL` pool registered for `SOFTWARE_TOKEN_MFA`, through
 * the three steps Cognito documents.
 */
export async function simCognitoWithSoftwareToken(): Promise<SimCognitoSignedInSetUp> {
  const setUp = await simCognitoSignedIn({
    mfaConfiguration: "OPTIONAL",
    explicitAuthFlows: bothPasswordFlows,
  });
  const { cognito, userPoolId, accessToken } = setUp;

  await cognito.associateSoftwareToken(
    new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
  );
  await cognito.verifySoftwareToken(
    new VerifySoftwareTokenCommand({
      AccessToken: accessToken,
      UserCode: cognito
        .userPool(userPoolId)
        .softwareTokenCode(simCognitoUsername),
    }),
  );
  await cognito.setUserMFAPreference(
    new SetUserMFAPreferenceCommand({
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
    }),
  );

  return setUp;
}

/**
 * The code the user's authenticator app is showing now.
 *
 * A test computing it from the `SecretCode` it was given gets the same value,
 * because the secret is a real one. Reading it off the pool is the shorter way
 * to say the same thing.
 */
export function simCognitoSoftwareTokenCode(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
  username: string = simCognitoUsername,
): string {
  const code = cognito.userPool(userPoolId).softwareTokenCode(username);

  assertNonNullable(code);

  return code;
}

/**
 * The code the pool texted the user for the challenge it has just issued.
 *
 * Real Cognito delivers it and reports it to nobody, so a test reads it out of
 * the message the pool recorded, which is how a sign-up confirmation code is
 * read here too.
 */
export function simCognitoSmsMfaCode(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
): string {
  const messages = cognito
    .userPool(userPoolId)
    .sentMessages()
    .filter((message) => message.occasion === "Authentication");
  const code = /\d{6}/.exec(messages.at(-1)?.body ?? "")?.[0];

  assertNonNullable(code);

  return code;
}
