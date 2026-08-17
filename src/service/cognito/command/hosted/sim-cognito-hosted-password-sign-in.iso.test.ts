import { createHash } from "node:crypto";

import {
  AdminCreateUserCommand,
  AdminSetUserMFAPreferenceCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
  SimCognitoUserNotConfirmedException,
  SimCognitoUserNotFoundException,
} from "../../error/sim-cognito.error.js";
import { SimCognitoOAuthError } from "../../error/sim-cognito-oauth.error.js";
import {
  simCognitoCallbackUrl,
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUser,
  simCognitoLocalUsername,
  type SimCognitoHostedSetUp,
} from "../../../../../test/cognito/federation-fixture.js";

/**
 * The authorize parameters managed login's own form posts, which is what the
 * request arrived with plus the two fields the person filled in.
 */
function signInInput(
  setUp: SimCognitoHostedSetUp,
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    response_type: "code",
    client_id: setUp.clientId,
    redirect_uri: simCognitoCallbackUrl,
    scope: "openid email",
    state: "csrf-token",
    username: simCognitoLocalUsername,
    password: simCognitoLocalPassword,
    ...overrides,
  };
}

/**
 * The code a redirect carries, the way the browser hands it to the callback.
 */
function codeIn(location: string): string {
  const code = new URL(location).searchParams.get("code");
  assertNonNullable(code);

  return code;
}

describe("Signing a local sim Cognito user in at the authorize endpoint", () => {
  it("issues a code the token endpoint exchanges for tokens", async () => {
    // Given a hosted domain over a pool holding a confirmed user of its own.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When the username and password managed login would have taken reach the
    // authorize endpoint.
    const redirect = await setUp.cognito.hostedAuthorize(
      pool,
      signInInput(setUp),
    );

    // Then the browser goes back to the app client's callback URL with a code
    // and the state the request was given.
    const location = new URL(redirect.location);
    assertIdentical(location.origin + location.pathname, simCognitoCallbackUrl);
    assertIdentical(location.searchParams.get("state"), "csrf-token");
    assertIdentical(redirect.username, simCognitoLocalUsername);

    // And the application's own server exchanges that code for tokens.
    const tokens = await setUp.cognito.hostedToken(pool, {
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      code: codeIn(redirect.location),
      redirect_uri: simCognitoCallbackUrl,
    });

    assertIdentical(tokens.token_type, "Bearer");
    assertNonNullable(tokens.access_token);
    assertNonNullable(tokens.refresh_token);
    assertNonNullable(tokens.id_token);

    // And the id token verifies against the pool, naming the user that signed
    // in rather than one a provider federated.
    const verifier = CognitoJwtVerifier.create({
      userPoolId: setUp.userPoolId,
      tokenUse: "id",
      clientId: setUp.clientId,
    });
    verifier.cacheJwks(pool.jwks());

    const claims = await verifier.verify(tokens.id_token);
    assertIdentical(claims["cognito:username"], simCognitoLocalUsername);
    assertIdentical(claims["email"], `${simCognitoLocalUsername}@example.com`);
  });

  it("honours a PKCE challenge the sign-in carried", async () => {
    // Given a hosted domain over a pool holding a confirmed user of its own.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);
    const codeVerifier = "a-code-verifier-of-a-perfectly-reasonable-length";

    // When the sign-in carries the challenge that verifier hashes to.
    const redirect = await setUp.cognito.hostedAuthorize(
      pool,
      signInInput(setUp, {
        code_challenge: createHash("sha256")
          .update(codeVerifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }),
    );

    // Then the verifier exchanges the code, and a request without it does not.
    const code = codeIn(redirect.location);
    assertInstanceOf(
      await assertThrowsErrorAsync(async () => {
        await setUp.cognito.hostedToken(pool, {
          grant_type: "authorization_code",
          client_id: setUp.clientId,
          code,
          redirect_uri: simCognitoCallbackUrl,
        });
      }),
      SimCognitoOAuthError,
    );

    const retried = await setUp.cognito.hostedAuthorize(
      pool,
      signInInput(setUp, {
        code_challenge: createHash("sha256")
          .update(codeVerifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }),
    );
    const tokens = await setUp.cognito.hostedToken(pool, {
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      code: codeIn(retried.location),
      redirect_uri: simCognitoCallbackUrl,
      code_verifier: codeVerifier,
    });

    assertNonNullable(tokens.access_token);
  });

  it("issues no code for a wrong password", async () => {
    // Given a hosted domain over a pool holding a confirmed user of its own.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When the sign-in carries the wrong password.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(
        pool,
        signInInput(setUp, { password: "not-the-password" }),
      );
    });

    assertInstanceOf(error, SimCognitoNotAuthorizedException);

    // Then it is refused the way every other sign-in refuses one, with no
    // redirect for a browser to follow and so no code to take from it.
    assertStringIncludes(error.message, "Incorrect username or password");
  });

  it("refuses a user that has not confirmed its sign-up", async () => {
    // Given a pool holding a user that signed itself up and stopped there.
    const setUp = await simCognitoHosted();
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    await setUp.cognito.signUp(
      new SignUpCommand({
        ClientId: setUp.clientId,
        Username: simCognitoLocalUsername,
        Password: simCognitoLocalPassword,
        UserAttributes: [
          { Name: "email", Value: `${simCognitoLocalUsername}@example.com` },
        ],
      }),
    );

    // When it signs in with the password it chose.
    assertInstanceOf(
      await assertThrowsErrorAsync(async () => {
        await setUp.cognito.hostedAuthorize(pool, signInInput(setUp));
      }),
      SimCognitoUserNotConfirmedException,
    );
  });

  it("refuses a user the pool does not have", async () => {
    // Given a pool holding no users at all.
    const setUp = await simCognitoHosted();
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When a sign-in names one.
    assertInstanceOf(
      await assertThrowsErrorAsync(async () => {
        await setUp.cognito.hostedAuthorize(
          pool,
          signInInput(setUp, { username: "nobody" }),
        );
      }),
      // The app client is on the `LEGACY` default, which says the user is not
      // there. One with `PreventUserExistenceErrors` of `ENABLED` refuses it
      // as a wrong password instead, and does so here for the same reason it
      // does at InitiateAuth: this is the check InitiateAuth makes.
      SimCognitoUserNotFoundException,
    );
  });

  it("says what to pass when the request carries no credentials", async () => {
    // Given a hosted domain over a pool holding a confirmed user of its own.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);
    const { username, password, ...withoutCredentials } = signInInput(setUp);

    // When an authorize request names neither a provider nor a user.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(pool, withoutCredentials);
    });

    assertInstanceOf(error, SimCognitoOAuthError);

    // Then it says which two fields a local sign-in needs, because the page
    // that asks a person for them belongs to the serving layer rather than to
    // this endpoint.
    assertStringIncludes(error.message, "needs a username and a password");
    assertIdentical(username, simCognitoLocalUsername);
    assertIdentical(password, simCognitoLocalPassword);
  });

  it("signs a local user in through an identity_provider of COGNITO", async () => {
    // Given a hosted domain over a pool holding a confirmed user of its own.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When the sign-in names the local provider, as a request that skipped the
    // provider choice does.
    const redirect = await setUp.cognito.hostedAuthorize(
      pool,
      signInInput(setUp, { identity_provider: "COGNITO" }),
    );

    // Then the same user signs in and the same code comes back.
    assertIdentical(redirect.username, simCognitoLocalUsername);
    assertNonNullable(codeIn(redirect.location));
  });

  it("refuses a client that does not support the pool's own users", async () => {
    // Given an app client offering Google alone.
    const setUp = await simCognitoHosted({ identityProviders: ["Google"] });
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When one of the pool's own users signs in through it.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(pool, signInInput(setUp));
    });

    assertInstanceOf(error, SimCognitoOAuthError);

    // Then it is refused, because a client signs in only through the providers
    // it lists, and COGNITO is one of those.
    assertStringIncludes(
      error.message,
      "does not support the COGNITO identity provider",
    );
  });

  it("refuses a user holding a temporary password", async () => {
    // Given a user an admin created and set no permanent password on.
    const setUp = await simCognitoHosted();
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    await setUp.cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: setUp.userPoolId,
        Username: simCognitoLocalUsername,
        TemporaryPassword: simCognitoLocalPassword,
      }),
    );

    // When it signs in with that password.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(pool, signInInput(setUp));
    });

    assertInstanceOf(error, SimCognitoInvalidParameterException);

    // Then it says which page real managed login would have answered with.
    assertStringIncludes(error.message, "asking for a new one");
  });

  it("refuses a user that owes a second factor", async () => {
    // Given a pool that challenges the users which registered a factor, and a
    // user registered for the one its phone number receives.
    const setUp = await simCognitoHosted({ mfaConfiguration: "OPTIONAL" });
    await simCognitoLocalUser(setUp, {
      attributes: [{ Name: "phone_number", Value: "+441632960123" }],
    });
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    await setUp.cognito.adminSetUserMFAPreference(
      new AdminSetUserMFAPreferenceCommand({
        UserPoolId: setUp.userPoolId,
        Username: simCognitoLocalUsername,
        SMSMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    // When it signs in with the right password.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(pool, signInInput(setUp));
    });

    assertInstanceOf(error, SimCognitoInvalidParameterException);

    // Then it says which page real managed login would have answered with, and
    // where the challenge this simulation does issue is answered.
    assertStringIncludes(error.message, "SMS_MFA");
    assertStringIncludes(error.message, "InitiateAuth");
  });
});
