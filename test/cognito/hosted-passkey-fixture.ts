/**
 * The arrangement the passkey managed login tests share: a pool with a hosted
 * domain that allows a passkey at the first prompt, a user holding one, and
 * the two requests a browser signs in with it over.
 *
 * The pool has no `WebAuthnConfiguration`, so the passkey is registered
 * against the domain, which is what real Cognito falls back to. That is what
 * separates this from `test/cognito/passkey-fixture.ts`, which arranges the
 * pool the API sign-ins present a passkey to.
 *
 * It lives under `test/` for the same reasons as `test/cognito/cfn-deploy.ts`:
 * a test file cannot export helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else and excluded from the
 * published build.
 */

import type { UsernameAttributeType } from "@aws-sdk/client-cognito-identity-provider";
import {
  AdminInitiateAuthCommand,
  CompleteWebAuthnRegistrationCommand,
  StartWebAuthnRegistrationCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertTypeString } from "@kensio/smartass";

import { SimAwsHttp } from "../../src/serve/http/sim-aws-http.js";
import {
  simCognitoCallbackUrl,
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUser,
  simCognitoLocalUsername,
  type SimCognitoHostedSetUp,
} from "./federation-fixture.js";
import {
  simCognitoAuthorizeParameters,
  simCognitoPageUrl,
  simCognitoPostForm,
} from "./managed-login-fixture.js";

/**
 * The address a user of a pool that signs its users in by email holds.
 */
export const simCognitoHostedAddress = "alice@example.com";

export interface SimCognitoHostedPasskeyOptions {
  /** What the pool signs its users in by, its own usernames by default. */
  readonly usernameAttributes?: readonly UsernameAttributeType[];

  /** The name the user is created and signs in by, `alice` by default. */
  readonly username?: string;
}

/**
 * A pool served on a hosted domain that allows a passkey at the first prompt,
 * with a user holding one.
 */
export async function simCognitoWithHostedPasskey(
  options: SimCognitoHostedPasskeyOptions = {},
): Promise<SimCognitoHostedSetUp> {
  const { usernameAttributes, username = simCognitoLocalUsername } = options;
  const byAttribute = usernameAttributes !== undefined;
  const setUp = await simCognitoHosted({
    ...(byAttribute && { usernameAttributes }),
  });

  // A pool signing users in by an attribute puts the name a user is created
  // with into that attribute itself, so there is nothing to pass here.
  await simCognitoLocalUser(setUp, {
    username,
    ...(byAttribute && { attributes: [] }),
  });
  await setUp.cognito.updateUserPool(
    new UpdateUserPoolCommand({
      UserPoolId: setUp.userPoolId,
      Policies: {
        SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD", "WEB_AUTHN"] },
      },
    }),
  );

  const signedIn = await setUp.cognito.adminInitiateAuth(
    new AdminInitiateAuthCommand({
      UserPoolId: setUp.userPoolId,
      ClientId: setUp.clientId,
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: username, PASSWORD: simCognitoLocalPassword },
    }),
  );
  const AccessToken = signedIn.AuthenticationResult?.AccessToken;

  assertTypeString(AccessToken);

  await setUp.cognito.startWebAuthnRegistration(
    new StartWebAuthnRegistrationCommand({ AccessToken }),
  );
  await setUp.cognito.completeWebAuthnRegistration(
    new CompleteWebAuthnRegistrationCommand({
      AccessToken,
      Credential: setUp.cognito
        .userPool(setUp.userPoolId)
        .webAuthnCredential(username),
    }),
  );

  return setUp;
}

/**
 * The challenge session the passkey page carries, out of its hidden input.
 */
export function simCognitoPasskeySessionIn(page: string): string {
  const session = /name="passkey_session" value="([^"]+)"/u.exec(page)?.[1];

  assertTypeString(session);

  return session;
}

/**
 * The username the passkey page carries, out of its hidden input.
 */
export function simCognitoPasskeyUsernameIn(page: string): string {
  const username = /name="username" value="([^"]+)"/u.exec(page)?.[1];

  assertTypeString(username);

  return username;
}

/**
 * Post the sign-in form with the passkey button, and answer with the passkey
 * page that comes back.
 */
export async function simCognitoPasskeyAsked(
  setUp: SimCognitoHostedSetUp,
  username: string,
): Promise<string> {
  const asked = await simCognitoPostForm(setUp, "/oauth2/authorize", {
    ...simCognitoAuthorizeParameters(setUp),
    username,
    passkey: "passkey",
  });

  return await asked.text();
}

/**
 * Present the credential answering the challenge a passkey page carries.
 *
 * The request carries the fields that page carried, because those are all a
 * browser posting it has.
 */
export async function simCognitoPasskeyPresented(
  setUp: SimCognitoHostedSetUp,
  page: string,
): Promise<Response> {
  const session = simCognitoPasskeySessionIn(page);

  return await simCognitoPostForm(setUp, "/oauth2/authorize", {
    ...simCognitoAuthorizeParameters(setUp),
    username: simCognitoPasskeyUsernameIn(page),
    passkey_session: session,
    credential: JSON.stringify(
      setUp.cognito.userPool(setUp.userPoolId).webAuthnAssertion(session),
    ),
  });
}

/**
 * Ask for a passkey and present the credential answering it, in the two
 * requests managed login takes, and answer with what came back from the
 * second.
 */
export async function simCognitoPasskeyPosted(
  setUp: SimCognitoHostedSetUp,
  username: string,
): Promise<Response> {
  return await simCognitoPasskeyPresented(
    setUp,
    await simCognitoPasskeyAsked(setUp, username),
  );
}

/**
 * Exchange an authorization code for the tokens it earned.
 */
export async function simCognitoExchangedTokens(
  setUp: SimCognitoHostedSetUp,
  code: string,
): Promise<Record<string, unknown>> {
  const exchanged = await new SimAwsHttp({ simAws: setUp.simAws }).fetch(
    simCognitoPageUrl("/oauth2/token"),
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: setUp.clientId,
        code,
        redirect_uri: simCognitoCallbackUrl,
      }).toString(),
    },
  );

  return (await exchanged.json()) as Record<string, unknown>;
}
