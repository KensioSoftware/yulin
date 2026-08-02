import {
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { CreateUserPoolCommandInput } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertObjectEquals,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

/**
 * The pool settings `aws-cdk-lib` 2.262.1 emits for a `UserPool` construct
 * asking for nothing in particular.
 *
 * Each configures message delivery, verification wording or account recovery.
 * None of those is simulated, and none of these values asks for anything this
 * simulation does not already do, so a pool is created with them rather than
 * refused. They are recorded here as one block because a default CDK stack
 * sends all six together.
 */
const verificationMessage =
  "The verification code to your new account is {####}";

const cdkDefaultSettings = {
  AccountRecoverySetting: {
    RecoveryMechanisms: [
      { Name: "verified_phone_number", Priority: 1 },
      { Name: "verified_email", Priority: 2 },
    ],
  },
  AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
  EmailVerificationMessage: verificationMessage,
  EmailVerificationSubject: "Verify your new account",
  SmsVerificationMessage: verificationMessage,
  VerificationMessageTemplate: {
    DefaultEmailOption: "CONFIRM_WITH_CODE",
    EmailMessage: verificationMessage,
    EmailSubject: "Verify your new account",
    SmsMessage: verificationMessage,
  },
} satisfies Partial<CreateUserPoolCommandInput>;

/**
 * A value of each accepted setting that this simulation refuses, with what
 * the refusal has to say about it.
 */
interface RefusedValue {
  readonly label: string;
  readonly input: Partial<CreateUserPoolCommandInput>;
  readonly says: string;
}

const refusedValues: readonly RefusedValue[] = [
  {
    label: "AccountRecoverySetting",
    input: {
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: "admin_only", Priority: 1 }],
      },
    },
    says: "account recovery",
  },
  {
    label: "AdminCreateUserConfig self sign-up",
    input: { AdminCreateUserConfig: { AllowAdminCreateUserOnly: false } },
    says: "self-service sign-up",
  },
  {
    label: "AdminCreateUserConfig extra key",
    input: {
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: true,
        InviteMessageTemplate: { EmailSubject: "Welcome" },
      },
    },
    says: "self-service sign-up",
  },
  {
    label: "EmailVerificationMessage",
    input: { EmailVerificationMessage: "Your code is {####}" },
    says: "the wording of a verification message",
  },
  {
    label: "EmailVerificationSubject",
    input: { EmailVerificationSubject: "Confirm your address" },
    says: "the wording of a verification message",
  },
  {
    label: "SmsVerificationMessage",
    input: { SmsVerificationMessage: "Your code is {####}" },
    says: "the wording of a verification message",
  },
  {
    label: "VerificationMessageTemplate",
    input: {
      VerificationMessageTemplate: { DefaultEmailOption: "CONFIRM_WITH_LINK" },
    },
    says: "the wording of a verification message",
  },
];

function simCognito(): SimCognitoIdentityProvider {
  return new SimAws().cognitoIdentityProvider();
}

async function createdPoolId(
  cognito: SimCognitoIdentityProvider,
  input: Partial<CreateUserPoolCommandInput>,
): Promise<string> {
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users", ...input }),
  );
  const userPoolId = created.UserPool?.Id;
  assertTypeString(userPoolId);

  return userPoolId;
}

describe("sim Cognito user pool settings accepted without being simulated", () => {
  it("creates a pool with the settings a default CDK pool sends", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When a pool is created with all six settings at the values CDK emits.
    const userPoolId = await createdPoolId(cognito, cdkDefaultSettings);

    // Then the pool exists, rather than the request being refused for asking
    // about message delivery this simulation does not do.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );
    assertNonNullable(described.UserPool);

    // And each setting is reported back as the request set it, so what the
    // pool was asked for stays visible even though nothing here reads it.
    assertObjectEquals(
      described.UserPool.AccountRecoverySetting,
      cdkDefaultSettings.AccountRecoverySetting,
    );
    assertObjectEquals(
      described.UserPool.AdminCreateUserConfig,
      cdkDefaultSettings.AdminCreateUserConfig,
    );
    assertObjectEquals(
      described.UserPool.VerificationMessageTemplate,
      cdkDefaultSettings.VerificationMessageTemplate,
    );
    assertIdentical(
      described.UserPool.EmailVerificationMessage,
      cdkDefaultSettings.EmailVerificationMessage,
    );
    assertIdentical(
      described.UserPool.EmailVerificationSubject,
      cdkDefaultSettings.EmailVerificationSubject,
    );
    assertIdentical(
      described.UserPool.SmsVerificationMessage,
      cdkDefaultSettings.SmsVerificationMessage,
    );
  });

  it("reports none of them for a pool created without them", async () => {
    // Given a pool created with nothing but a name.
    const cognito = simCognito();
    const userPoolId = await createdPoolId(cognito, {});

    // When it is described.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );

    // Then none of the settings appears, rather than the pool reporting the
    // value a request would have had to use to be accepted.
    assertNonNullable(described.UserPool);
    assertUndefined(described.UserPool.AccountRecoverySetting);
    assertUndefined(described.UserPool.AdminCreateUserConfig);
    assertUndefined(described.UserPool.VerificationMessageTemplate);
    assertUndefined(described.UserPool.EmailVerificationMessage);
    assertUndefined(described.UserPool.EmailVerificationSubject);
    assertUndefined(described.UserPool.SmsVerificationMessage);
  });

  it("refuses each of them at any other value", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When each setting is used at a value this simulation does not model.
    const outcomes = await Promise.all(
      refusedValues.map(async (refused) => ({
        refused,
        error: await assertThrowsErrorAsync(async () => {
          await createdPoolId(cognito, refused.input);
        }, refused.label),
      })),
    );

    // Then each refusal names the input, the value asked for, and what would
    // have been ignored here and applied on real AWS.
    for (const { refused, error } of outcomes) {
      assertStringIncludes(error.message, "CreateUserPool");
      assertStringIncludes(error.message, refused.says);
      assertStringIncludes(error.message, "is not simulated");
      assertStringIncludes(error.message, "Only");
    }
  });
});
