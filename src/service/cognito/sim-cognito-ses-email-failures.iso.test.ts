import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEmpty,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  applicant,
  poolSendingThroughSes,
  sesIn,
  sesSourceArn,
  signUp,
  signUpPassword,
} from "../../../test/cognito/ses-email-pool.js";
import {
  SimCognitoCodeDeliveryFailureException,
  SimCognitoInvalidEmailRoleAccessPolicyException,
} from "./error/sim-cognito.error.js";
import { SimCognitoIdentityProvider } from "./sim-cognito-identity-provider.js";

describe("sim Cognito user pool email SES failures", () => {
  it("fails the sign-up where the SourceArn identity is not there", async () => {
    // Given a pool sending through SES with nothing verified.
    const pool = await poolSendingThroughSes();

    // When someone signs themselves up.
    const error = await assertThrowsErrorAsync(async () => {
      await signUp(pool);
    });

    // Then the sign-up failed the way real Cognito fails one it cannot send
    // for, naming the identity it could not use.
    assertInstanceOf(error, SimCognitoInvalidEmailRoleAccessPolicyException);
    assertIdentical(error.name, "InvalidEmailRoleAccessPolicyException");
    assertStringIncludes(error.message, "example.com");

    // And neither SES nor the pool recorded a message that never went.
    assertArrayEmpty(sesIn(pool, "us-east-1").sentEmails());
    assertArrayEmpty(pool.cognito.userPool(pool.userPoolId).sentMessages());
  });

  it("fails the sign-up where the SourceArn identity is unverified", async () => {
    // Given a pool sending through SES whose identity exists and has not
    // completed verification.
    const pool = await poolSendingThroughSes();

    await sesIn(pool, "us-east-1").createEmailIdentity({
      input: { EmailIdentity: "example.com" },
    });

    // When someone signs themselves up.
    const error = await assertThrowsErrorAsync(async () => {
      await signUp(pool);
    });

    // Then the sign-up failed, saying the identity has not been verified
    // rather than that it is missing.
    assertInstanceOf(error, SimCognitoInvalidEmailRoleAccessPolicyException);
    assertStringIncludes(error.message, "not completed verification");
  });

  it("fails the sign-up where the SES sandbox refuses the recipient", async () => {
    // Given a pool sending through SES with the sender verified, and an
    // account still in the sandbox where the applicant is not.
    const pool = await poolSendingThroughSes();
    const ses = sesIn(pool, "us-east-1");

    ses.verifyIdentity("example.com");

    // When someone signs themselves up.
    const error = await assertThrowsErrorAsync(async () => {
      await signUp(pool);
    });

    // Then the sign-up failed as a delivery failure rather than as a
    // configuration one, which is the difference between an account that is
    // set up wrong and one that has yet to leave the sandbox.
    assertInstanceOf(error, SimCognitoCodeDeliveryFailureException);
    assertIdentical(error.name, "CodeDeliveryFailureException");
    assertStringIncludes(error.message, applicant);
    assertArrayEmpty(ses.sentEmails());
  });

  it("says so where the simulated Cognito was built without SES", async () => {
    // Given a standalone SimCognitoIdentityProvider, built outside SimAws and
    // with no simulated SES anywhere near it.
    const cognito = new SimCognitoIdentityProvider();
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        AutoVerifiedAttributes: ["email"],
        EmailConfiguration: {
          EmailSendingAccount: "DEVELOPER",
          From: "no-reply@example.com",
          SourceArn: sesSourceArn("us-east-1"),
        },
      }),
    );
    assertNonNullable(created.UserPool?.Id);

    const client = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: created.UserPool.Id,
        ClientName: "web",
      }),
    );
    const clientId = client.UserPoolClient?.ClientId;
    assertNonNullable(clientId);

    // When someone signs themselves up.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.signUp(
        new SignUpCommand({
          ClientId: clientId,
          Username: "alice",
          Password: signUpPassword,
          UserAttributes: [{ Name: "email", Value: applicant }],
        }),
      );
    });

    // Then the pool creation went through, because the identity is resolved
    // when a message is sent, and the sign-up says how to reach an SES.
    assertInstanceOf(error, SimCognitoInvalidEmailRoleAccessPolicyException);
    assertStringIncludes(error.message, "without simulated SES");
    assertStringIncludes(error.message, "Reach Cognito through SimAws");
  });
});
