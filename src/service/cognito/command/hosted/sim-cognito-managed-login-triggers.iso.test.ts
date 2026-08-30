import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "../../../aws/sim-aws-account.js";
import {
  simCognitoCallbackUrl,
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUser,
  simCognitoLocalUsername,
  type SimCognitoHostedSetUp,
} from "../../../../../test/cognito/federation-fixture.js";
import {
  simCognitoPasskeyPosted,
  simCognitoWithHostedPasskey,
} from "../../../../../test/cognito/hosted-passkey-fixture.js";
import {
  simCognitoAuthorizeParameters,
  simCognitoPostForm,
} from "../../../../../test/cognito/managed-login-fixture.js";
import { recordingTriggerHandler } from "../../../../../test/cognito/trigger-handler-fixture.js";
import { triggerFunctionArnIn } from "../../../../../test/cognito/trigger-fixture.js";

/**
 * The ARN of the trigger function in the region the hosted fixture builds in.
 */
const functionArn = triggerFunctionArnIn(
  "eu-west-2",
  DEFAULT_SIM_AWS_ACCOUNT_ID,
);

/**
 * The two fields managed login's form takes, beside the parameters the request
 * arrived on.
 */
function signInInput(
  setUp: SimCognitoHostedSetUp,
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    response_type: "code",
    client_id: setUp.clientId,
    redirect_uri: simCognitoCallbackUrl,
    username: simCognitoLocalUsername,
    password: simCognitoLocalPassword,
    ...overrides,
  };
}

/**
 * The `triggerSource` of every event a handler recorded, in the order it ran.
 */
function sourcesOf(events: readonly unknown[]): readonly string[] {
  return events.map(
    (event) => (event as { triggerSource: string }).triggerSource,
  );
}

/**
 * A pool with a hosted domain whose `PreAuthentication` trigger records what it
 * is given, and a user of its own to sign in.
 */
async function poolRecordingPreAuthentication(
  events: unknown[],
): Promise<SimCognitoHostedSetUp> {
  const setUp = await simCognitoHosted({
    triggers: { PreAuthentication: functionArn },
    handler: recordingTriggerHandler(events),
  });

  await simCognitoLocalUser(setUp);

  return setUp;
}

describe("The PreAuthentication trigger a sim Cognito managed login sign-in runs", () => {
  it("runs for a password sign-in at the authorize endpoint", async () => {
    // Given a pool whose PreAuthentication trigger records what it is given.
    const events: unknown[] = [];
    const setUp = await poolRecordingPreAuthentication(events);

    // When one of its own users signs in at the authorize endpoint.
    await setUp.cognito.hostedAuthorize(
      setUp.cognito.userPool(setUp.userPoolId),
      signInInput(setUp),
    );

    // Then the handler ran under the source real Cognito reports from
    // `/login`, on the user signing in.
    assertArrayEquals(sourcesOf(events), ["PreAuthentication_Authentication"]);
    assertIdentical(
      (events[0] as { userName: string }).userName,
      simCognitoLocalUsername,
    );
  });

  it("runs for a sign-in the pool goes on to refuse", async () => {
    // Given the same pool.
    const events: unknown[] = [];
    const setUp = await poolRecordingPreAuthentication(events);

    // When the password is wrong.
    await assertThrowsErrorAsync(async () => {
      await setUp.cognito.hostedAuthorize(
        setUp.cognito.userPool(setUp.userPoolId),
        signInInput(setUp, { password: "WrongPassword!" }),
      );
    });

    // Then the handler still ran, because the trigger is given the user to
    // decide about and runs before the password is checked, which is the order
    // the API sign-ins use.
    assertArrayEquals(sourcesOf(events), ["PreAuthentication_Authentication"]);
  });

  it("runs once for a passkey sign-in, on the request that asks for one", async () => {
    // Given a pool that allows a passkey at the first prompt, with a user
    // holding one.
    const events: unknown[] = [];
    const setUp = await simCognitoWithHostedPasskey({
      triggers: { PreAuthentication: functionArn },
      handler: recordingTriggerHandler(events),
    });
    // The fixture registers the passkey through an API sign-in, which runs the
    // trigger itself.
    events.length = 0;

    // When the browser asks for a passkey and presents one.
    const presented = await simCognitoPasskeyPosted(
      setUp,
      simCognitoLocalUsername,
    );

    // Then the sign-in completed, and the trigger ran once rather than on both
    // requests. The challenge response answers a sign-in already started, and
    // answering one runs the trigger no second time on the API path either.
    assertIdentical(presented.status, 302);
    assertArrayEquals(sourcesOf(events), ["PreAuthentication_Authentication"]);
  });

  it("stays unfired for a browser signing in from its managed login session", async () => {
    // Given a browser that has signed in once and holds the session for it.
    const events: unknown[] = [];
    const setUp = await poolRecordingPreAuthentication(events);
    const pool = setUp.cognito.userPool(setUp.userPoolId);
    const first = await setUp.cognito.hostedAuthorize(pool, signInInput(setUp));
    const session = first.session.startedSession;
    assertNonNullable(session);
    events.length = 0;

    // When it comes back to a plain authorize request carrying that session.
    const returning = await setUp.cognito.hostedAuthorize(
      pool,
      {
        response_type: "code",
        client_id: setUp.clientId,
        redirect_uri: simCognitoCallbackUrl,
      },
      session,
    );

    // Then it is signed in without the trigger running. The PreAuthentication
    // docs say it does not activate on the renewal of a session that already
    // exists, and this is that renewal.
    assertIdentical(returning.session.outcome, "reused");
    assertArrayEquals(sourcesOf(events), []);
  });

  it("refuses the sign-in on the form where the handler throws", async () => {
    // Given a pool whose PreAuthentication trigger refuses everybody.
    const setUp = await simCognitoHosted({
      triggers: { PreAuthentication: functionArn },
      handler: () => {
        throw new Error("Only example.com may sign in.");
      },
    });

    await simCognitoLocalUser(setUp);

    // When the sign-in form is posted on the served domain.
    const response = await simCognitoPostForm(setUp, "/oauth2/authorize", {
      ...simCognitoAuthorizeParameters(setUp),
      username: simCognitoLocalUsername,
      password: simCognitoLocalPassword,
    });

    // Then the browser gets the form back carrying what the handler threw,
    // which is where real managed login shows a trigger's refusal.
    assertIdentical(response.status, 200);

    const page = await response.text();
    assertStringIncludes(page, "Only example.com may sign in.");
    assertStringIncludes(page, 'name="password"');
  });
});
