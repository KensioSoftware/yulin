import {
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  CreateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCognitoNotAuthorizedException } from "../../error/sim-cognito.error.js";
import { SimCognitoManagedLoginRequired } from "../../error/sim-cognito-managed-login.error.js";
import {
  simCognitoCallbackUrl,
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUser,
  simCognitoLocalUsername,
  simCognitoSignedInAtGoogle,
  type SimCognitoHostedSetUp,
} from "../../../../../test/cognito/federation-fixture.js";

/**
 * The authorize parameters an application sends the browser on with, holding
 * no credentials. This is the request real managed login answers from the
 * `cognito` cookie, and answers with the sign-in form when there is none.
 */
function authorizeInput(
  setUp: SimCognitoHostedSetUp,
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    response_type: "code",
    client_id: setUp.clientId,
    redirect_uri: simCognitoCallbackUrl,
    scope: "openid email",
    state: "csrf-token",
    ...overrides,
  };
}

/**
 * The same request with the two fields managed login's form posts.
 */
function signInInput(
  setUp: SimCognitoHostedSetUp,
  overrides: Record<string, string> = {},
): Record<string, string> {
  return authorizeInput(setUp, {
    username: simCognitoLocalUsername,
    password: simCognitoLocalPassword,
    ...overrides,
  });
}

describe("Signing in from a sim Cognito managed login session", () => {
  it("starts a session for the browser when the sign-in takes a password", async () => {
    // Given a hosted domain over a pool holding a confirmed user of its own.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When the user signs in with the password managed login's form takes.
    const redirect = await setUp.cognito.hostedAuthorize(
      pool,
      signInInput(setUp),
    );

    // Then the browser is given a managed login session to come back with.
    assertIdentical(redirect.session.outcome, "started");
    assertNonNullable(redirect.session.startedSession);
  });

  it("signs a returning browser in without asking for a password", async () => {
    // Given a browser that signed in with its password a moment ago.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);
    const first = await setUp.cognito.hostedAuthorize(pool, signInInput(setUp));
    const session = first.session.startedSession;
    assertNonNullable(session);

    // When the application sends it back to authorize carrying no credentials.
    const second = await setUp.cognito.hostedAuthorize(
      pool,
      authorizeInput(setUp),
      session,
    );

    // Then the same user is signed in from the session it was already holding.
    assertIdentical(second.username, simCognitoLocalUsername);
    assertIdentical(second.session.outcome, "reused");
    assertNonNullable(new URL(second.location).searchParams.get("code"));
  });

  it("asks for the form again once no session is presented", async () => {
    // Given a pool with a user who has never signed in at this browser.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When an authorize request arrives with neither credentials nor session.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(pool, authorizeInput(setUp));
    });

    // Then the sign-in form is what answers, as it did before sessions.
    assertInstanceOf(error, SimCognitoManagedLoginRequired);
  });

  it("shows the form again when the password field comes back empty", async () => {
    // Given a pool with a user, and a form posted with the password left out.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When that reaches the authorize endpoint from a browser holding nothing.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(
        pool,
        authorizeInput(setUp, { username: simCognitoLocalUsername }),
      );
    });

    // Then the form is what answers, as it does for a request naming nobody.
    assertInstanceOf(error, SimCognitoManagedLoginRequired);
  });

  it("signs in whoever the form posts, over the session the browser holds", async () => {
    // Given a browser holding alice's session, and bob signing in on it.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    await simCognitoLocalUser(setUp, { username: "bob" });
    const pool = setUp.cognito.userPool(setUp.userPoolId);
    const first = await setUp.cognito.hostedAuthorize(pool, signInInput(setUp));
    const session = first.session.startedSession;
    assertNonNullable(session);

    // When the form is posted with bob's credentials.
    const second = await setUp.cognito.hostedAuthorize(
      pool,
      signInInput(setUp, { username: "bob" }),
      session,
    );

    // Then bob is signed in, and the browser is given his session instead.
    assertIdentical(second.username, "bob");
    assertIdentical(second.session.outcome, "started");
  });

  it("starts a session for a sign-in at an identity provider", async () => {
    // Given a browser signing in through the pool's Google provider.
    const setUp = await simCognitoHosted();
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When it completes the federated sign-in.
    const redirect = await setUp.cognito.hostedAuthorize(
      pool,
      authorizeInput(setUp, { identity_provider: "Google" }),
    );
    const session = redirect.session.startedSession;
    assertNonNullable(session);

    // Then it comes back to a plain authorize request signed in already, the
    // way real Cognito remembers a provider sign-in in the same cookie.
    const returning = await setUp.cognito.hostedAuthorize(
      pool,
      authorizeInput(setUp),
      session,
    );

    assertIdentical(returning.session.outcome, "reused");
    assertIdentical(returning.username, redirect.username);
  });

  it("signs the browser in at another app client of the same pool", async () => {
    // Given a browser that signed in for one of the pool's app clients.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);
    const first = await setUp.cognito.hostedAuthorize(pool, signInInput(setUp));
    const session = first.session.startedSession;
    assertNonNullable(session);

    // When a second app client of the same pool sends it to authorize.
    const second = await setUp.cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: setUp.userPoolId,
        ClientName: "admin",
        AllowedOAuthFlowsUserPoolClient: true,
        AllowedOAuthFlows: ["code"],
        AllowedOAuthScopes: ["openid", "email"],
        CallbackURLs: [simCognitoCallbackUrl],
        SupportedIdentityProviders: ["COGNITO"],
      }),
    );
    assertNonNullable(second.UserPoolClient?.ClientId);

    const redirect = await setUp.cognito.hostedAuthorize(
      pool,
      authorizeInput(setUp, { client_id: second.UserPoolClient.ClientId }),
      session,
    );

    // Then the session signs it in there too, because the session belongs to
    // the pool's domain rather than to one app client.
    assertIdentical(redirect.session.outcome, "reused");
    assertIdentical(redirect.username, simCognitoLocalUsername);
  });

  it("refuses a session whose user has been disabled", async () => {
    // Given a browser holding a session for a user disabled since it signed in.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);
    const first = await setUp.cognito.hostedAuthorize(pool, signInInput(setUp));
    const session = first.session.startedSession;
    assertNonNullable(session);

    await setUp.cognito.adminDisableUser(
      new AdminDisableUserCommand({
        UserPoolId: setUp.userPoolId,
        Username: simCognitoLocalUsername,
      }),
    );

    // When it comes back to authorize with that session.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(pool, authorizeInput(setUp), session);
    });

    // Then it is refused the way every other sign-in refuses a disabled user.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
  });

  it("asks for the form when the session's user has been deleted", async () => {
    // Given a browser holding a session for a user deleted since it signed in.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);
    const first = await setUp.cognito.hostedAuthorize(pool, signInInput(setUp));
    const session = first.session.startedSession;
    assertNonNullable(session);

    await setUp.cognito.adminDeleteUser(
      new AdminDeleteUserCommand({
        UserPoolId: setUp.userPoolId,
        Username: simCognitoLocalUsername,
      }),
    );

    // When it comes back to authorize with that session.
    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(pool, authorizeInput(setUp), session);
    });

    // Then the session has nobody to sign in, so the form is what answers.
    assertInstanceOf(error, SimCognitoManagedLoginRequired);
  });
});
