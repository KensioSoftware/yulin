import { AdminUserGlobalSignOutCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCognitoManagedLoginRequired } from "../../error/sim-cognito-managed-login.error.js";
import {
  simCognitoCallbackUrl,
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUser,
  simCognitoLocalUsername,
  simCognitoLogoutUrl,
  type SimCognitoHostedSetUp,
} from "../../../../../test/cognito/federation-fixture.js";

/**
 * How long the browser's session lasts, which real Cognito fixes at an hour.
 */
const sessionHours = 1;

function authorizeInput(
  setUp: SimCognitoHostedSetUp,
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    response_type: "code",
    client_id: setUp.clientId,
    redirect_uri: simCognitoCallbackUrl,
    scope: "openid email",
    ...overrides,
  };
}

function signInInput(setUp: SimCognitoHostedSetUp): Record<string, string> {
  return authorizeInput(setUp, {
    username: simCognitoLocalUsername,
    password: simCognitoLocalPassword,
  });
}

/**
 * Sign a browser in with its password and give back the session it was handed.
 */
async function signedInSession(setUp: SimCognitoHostedSetUp): Promise<string> {
  const pool = setUp.cognito.userPool(setUp.userPoolId);
  const redirect = await setUp.cognito.hostedAuthorize(
    pool,
    signInInput(setUp),
  );
  const session = redirect.session.startedSession;
  assertNonNullable(session);

  return session;
}

describe("How long a sim Cognito managed login session lasts", () => {
  it("asks for a password again once the hour is up", async () => {
    // Given a browser that signed in with its password.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const session = await signedInSession(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When it comes back more than an hour later.
    await setUp.simAws.clock().advanceBy({ hours: sessionHours, minutes: 1 });

    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(pool, authorizeInput(setUp), session);
    });

    // Then the session has run out, and the sign-in form is what answers.
    assertInstanceOf(error, SimCognitoManagedLoginRequired);

    // And signing in again starts a session the browser can come back with,
    // leaving the one that ran out behind.
    const again = await signedInSession(setUp);

    const returning = await setUp.cognito.hostedAuthorize(
      pool,
      authorizeInput(setUp),
      again,
    );
    assertIdentical(returning.session.outcome, "reused");
  });

  it("leaves the hour where the interactive sign-in started it", async () => {
    // Given a browser that signed in, then signed in again from its session
    // fifty minutes later.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const session = await signedInSession(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    await setUp.simAws.clock().advanceBy({ minutes: 50 });

    const returning = await setUp.cognito.hostedAuthorize(
      pool,
      authorizeInput(setUp),
      session,
    );
    assertIdentical(returning.session.outcome, "reused");

    // When it comes back twenty minutes after that, which is over an hour from
    // the password but only twenty minutes from the last sign-in.
    await setUp.simAws.clock().advanceBy({ minutes: 20 });

    const error = await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(pool, authorizeInput(setUp), session);
    });

    // Then the session has still run out. Signing in from it does not buy the
    // browser another hour, which is what real Cognito does.
    assertInstanceOf(error, SimCognitoManagedLoginRequired);
  });

  it("ends the session at the logout endpoint", async () => {
    // Given a browser signed in at the hosted domain.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const session = await signedInSession(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When it is sent to the logout endpoint holding that session.
    const signedOut = await setUp.cognito.hostedSignOut(
      pool,
      { client_id: setUp.clientId, logout_uri: simCognitoLogoutUrl },
      session,
    );

    // Then it goes to the app client's sign-out URL holding nothing, and the
    // next authorize request asks for a password again.
    assertIdentical(signedOut.location, simCognitoLogoutUrl);
    assertIdentical(signedOut.session.outcome, "ended");

    assertInstanceOf(
      await assertThrowsErrorAsync(async () => {
        await setUp.cognito.hostedAuthorize(
          pool,
          authorizeInput(setUp),
          session,
        );
      }),
      SimCognitoManagedLoginRequired,
    );
  });

  it("signs a browser out that was holding no session", async () => {
    // Given a browser at the logout endpoint carrying no session cookie, which
    // is what a second sign-out or a fresh browser sends.
    const setUp = await simCognitoHosted();
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When it reaches the logout endpoint.
    const signedOut = await setUp.cognito.hostedSignOut(pool, {
      client_id: setUp.clientId,
      logout_uri: simCognitoLogoutUrl,
    });

    // Then it goes to the sign-out URL the same way.
    assertIdentical(signedOut.location, simCognitoLogoutUrl);
    assertIdentical(signedOut.session.outcome, "ended");
  });

  it("leaves the session alone when the user is signed out globally", async () => {
    // Given a browser signed in at the hosted domain.
    const setUp = await simCognitoHosted();
    await simCognitoLocalUser(setUp);
    const session = await signedInSession(setUp);
    const pool = setUp.cognito.userPool(setUp.userPoolId);

    // When the application revokes the user's tokens rather than sending the
    // browser to the logout endpoint.
    await setUp.cognito.adminUserGlobalSignOut(
      new AdminUserGlobalSignOutCommand({
        UserPoolId: setUp.userPoolId,
        Username: simCognitoLocalUsername,
      }),
    );

    // Then the browser signs straight back in with no password, which is the
    // real behaviour an application's own sign-out has to reckon with.
    const redirect = await setUp.cognito.hostedAuthorize(
      pool,
      authorizeInput(setUp),
      session,
    );

    assertIdentical(redirect.session.outcome, "reused");
    assertIdentical(redirect.username, simCognitoLocalUsername);
  });
});
