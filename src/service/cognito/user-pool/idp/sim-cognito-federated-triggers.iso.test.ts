import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "../../../aws/sim-aws-account.js";
import {
  simCognitoCallbackUrl,
  simCognitoHosted,
  simCognitoLocalPassword,
  simCognitoLocalUser,
  simCognitoLocalUsername,
  simCognitoSignedInAtGoogle,
  type SimCognitoHostedSetUp,
} from "../../../../../test/cognito/federation-fixture.js";
import {
  answeringTriggerHandler,
  recordingTriggerHandler,
} from "../../../../../test/cognito/trigger-handler-fixture.js";
import { triggerFunctionArnIn } from "../../../../../test/cognito/trigger-fixture.js";

/**
 * The ARN of the trigger function in the region the hosted fixture builds in.
 */
const functionArn = triggerFunctionArnIn(
  "eu-west-2",
  DEFAULT_SIM_AWS_ACCOUNT_ID,
);

/**
 * Sign the user the Google provider holds in, and answer with the
 * authorization code the browser was sent back with.
 */
async function federatedSignIn(setUp: SimCognitoHostedSetUp): Promise<string> {
  const redirect = await setUp.cognito.hostedAuthorize(
    setUp.cognito.userPool(setUp.userPoolId),
    {
      response_type: "code",
      client_id: setUp.clientId,
      redirect_uri: simCognitoCallbackUrl,
      identity_provider: "Google",
    },
  );

  const code = new URL(redirect.location).searchParams.get("code");
  assertNonNullable(code);

  return code;
}

/**
 * The `triggerSource` of every event a handler recorded, in the order it ran.
 */
function sourcesOf(events: readonly unknown[]): readonly string[] {
  return events.map(
    (event) => (event as { triggerSource: string }).triggerSource,
  );
}

describe("The Lambda triggers a sim Cognito federated sign-in runs", () => {
  it("runs PreSignUp under the external provider source on a first sign-in", async () => {
    // Given a pool whose PreSignUp trigger records what it is given, and a
    // Google provider holding a subject the pool has never seen.
    const events: unknown[] = [];
    const setUp = await simCognitoHosted({
      triggers: { PreSignUp: functionArn },
      handler: recordingTriggerHandler(events),
    });
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
      given_name: "Sam",
    });

    // When that subject signs in for the first time.
    await federatedSignIn(setUp);

    // Then the handler was given the source real Cognito reports for a
    // federated first sign-in, carrying the attributes the provider's mapping
    // produced.
    assertObjectMatches(events[0], {
      triggerSource: "PreSignUp_ExternalProvider",
      userPoolId: setUp.userPoolId,
      userName: "Google_google-subject-1",
      callerContext: { clientId: setUp.clientId },
      request: {
        userAttributes: { email: "someone@example.com", given_name: "Sam" },
      },
    });
    assertArrayLength(events, 1);
  });

  it("runs PostConfirmation on the federated user the pool now holds", async () => {
    // Given a pool whose PostConfirmation trigger records what it is given.
    const events: unknown[] = [];
    const setUp = await simCognitoHosted({
      triggers: { PostConfirmation: functionArn },
      handler: recordingTriggerHandler(events),
    });
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });

    // When the subject signs in for the first time.
    await federatedSignIn(setUp);

    // Then the handler ran under the source real Cognito reports, on a user
    // carrying the `sub` the pool allocated. That `sub` is what an application
    // hangs its own record off.
    assertArrayEquals(sourcesOf(events), ["PostConfirmation_ConfirmSignUp"]);

    const user = setUp.cognito
      .userPool(setUp.userPoolId)
      .requireUser("Google_google-subject-1" as never);
    assertObjectMatches(events[0], {
      request: { userAttributes: { sub: user.sub } },
    });
  });

  it("runs the authentication triggers rather than the sign-up ones on a later sign-in", async () => {
    // Given a pool naming all four triggers, and a subject that has signed in
    // once already.
    const events: unknown[] = [];
    const setUp = await simCognitoHosted({
      triggers: {
        PreSignUp: functionArn,
        PostConfirmation: functionArn,
        PreAuthentication: functionArn,
        PostAuthentication: functionArn,
      },
      handler: recordingTriggerHandler(events),
    });
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });
    await federatedSignIn(setUp);
    events.length = 0;

    // When the same subject signs in again.
    await federatedSignIn(setUp);

    // Then the sign-in triggers ran and neither sign-up trigger did, which is
    // the split AWS documents for a federated user. A handler creating a
    // profile record on first sight runs once rather than on every visit.
    assertArrayEquals(sourcesOf(events), [
      "PreAuthentication_Authentication",
      "PostAuthentication_Authentication",
    ]);
  });

  it("refuses the sign-in and creates no user where PreSignUp throws", async () => {
    // Given a pool whose PreSignUp trigger refuses everybody.
    const setUp = await simCognitoHosted({
      triggers: { PreSignUp: functionArn },
      handler: () => {
        throw new Error("This address is not allowed to sign up.");
      },
    });
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });

    // When the subject signs in for the first time.
    const error = await assertThrowsErrorAsync(async () => {
      await federatedSignIn(setUp);
    });

    // Then the sign-in is refused carrying what the handler threw, and the
    // pool holds no user for the subject: PreSignUp runs before the user is
    // added, here as on real Cognito.
    assertStringIncludes(
      error.message,
      "This address is not allowed to sign up.",
    );
    assertUndefined(
      setUp.cognito
        .userPool(setUp.userPoolId)
        .findUser("Google_google-subject-1"),
    );
  });

  it("verifies the attributes a PreSignUp handler asked to verify", async () => {
    // Given a pool whose PreSignUp trigger auto-verifies an email address.
    const setUp = await simCognitoHosted({
      triggers: { PreSignUp: functionArn },
      handler: answeringTriggerHandler({ autoVerifyEmail: true }),
    });
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });

    // When the subject signs in for the first time.
    await federatedSignIn(setUp);

    // Then the federated user's address is verified, as it is for a sign-up
    // the same handler answers.
    const attributes = setUp.cognito
      .userPool(setUp.userPoolId)
      .requireUser("Google_google-subject-1" as never).attributeValues;
    assertIdentical(attributes.get("email_verified"), "true");
  });
});

describe("The PreTokenGeneration source a sim Cognito hosted grant reports", () => {
  it("is TokenGeneration_HostedAuth for a code from an identity provider", async () => {
    // Given a pool whose PreTokenGeneration trigger records what it is given.
    const events: unknown[] = [];
    const setUp = await simCognitoHosted({
      triggers: { PreTokenGeneration: functionArn },
      handler: recordingTriggerHandler(events),
    });
    simCognitoSignedInAtGoogle(setUp, "google-subject-1", {
      email: "someone@example.com",
    });

    // When a federated sign-in's code is exchanged for tokens.
    const code = await federatedSignIn(setUp);
    await setUp.cognito.hostedToken(setUp.cognito.userPool(setUp.userPoolId), {
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      code,
      redirect_uri: simCognitoCallbackUrl,
    });

    // Then the handler read the source real Cognito reports for tokens a
    // federated sign-in hands out.
    assertArrayEquals(sourcesOf(events), ["TokenGeneration_HostedAuth"]);
  });

  it("is TokenGeneration_Authentication for a code from the pool's own form", async () => {
    // Given the same pool, and a user of the pool's own.
    const events: unknown[] = [];
    const setUp = await simCognitoHosted({
      triggers: { PreTokenGeneration: functionArn },
      handler: recordingTriggerHandler(events),
    });
    await simCognitoLocalUser(setUp);

    // When that user signs in at the authorize endpoint and the code is
    // exchanged.
    const pool = setUp.cognito.userPool(setUp.userPoolId);
    const redirect = await setUp.cognito.hostedAuthorize(pool, {
      response_type: "code",
      client_id: setUp.clientId,
      redirect_uri: simCognitoCallbackUrl,
      username: simCognitoLocalUsername,
      password: simCognitoLocalPassword,
    });
    const code = new URL(redirect.location).searchParams.get("code");
    assertNonNullable(code);
    await setUp.cognito.hostedToken(pool, {
      grant_type: "authorization_code",
      client_id: setUp.clientId,
      code,
      redirect_uri: simCognitoCallbackUrl,
    });

    // Then it read the source an API sign-in reports, which is what real
    // Cognito reports for a local user at managed login.
    assertArrayEquals(sourcesOf(events), ["TokenGeneration_Authentication"]);
  });
});
