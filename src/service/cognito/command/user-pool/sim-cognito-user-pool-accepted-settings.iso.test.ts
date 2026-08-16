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
 * asking for nothing in particular, apart from the `AdminCreateUserConfig`
 * this simulation acts on.
 *
 * The verification wording is read: it is what the messages the pool records
 * say, and any wording is accepted. `AccountRecoverySetting` is not read at
 * all, and is recorded so a described pool reports it. They are written here
 * as one block because a default CDK stack sends them together.
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
 * A value this simulation refuses among the settings it otherwise accepts,
 * with what the refusal has to say about it.
 */
interface RefusedValue {
  readonly label: string;
  readonly input: Partial<CreateUserPoolCommandInput>;
  readonly says: string;
}

const refusedValues: readonly RefusedValue[] = [
  {
    label: "VerificationMessageTemplate DefaultEmailOption",
    input: {
      VerificationMessageTemplate: { DefaultEmailOption: "CONFIRM_WITH_LINK" },
    },
    says: "confirming a sign-up by following a link",
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
    // pool was asked for stays visible.
    assertObjectEquals(
      described.UserPool.AccountRecoverySetting,
      cdkDefaultSettings.AccountRecoverySetting,
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
    assertUndefined(described.UserPool.VerificationMessageTemplate);
    assertUndefined(described.UserPool.EmailVerificationMessage);
    assertUndefined(described.UserPool.EmailVerificationSubject);
    assertUndefined(described.UserPool.SmsVerificationMessage);
  });

  it("keeps what the request said rather than the request object", async () => {
    // Given a pool created from an input object the caller still holds.
    const cognito = simCognito();
    const input: Partial<CreateUserPoolCommandInput> =
      structuredClone(cdkDefaultSettings);
    const userPoolId = await createdPoolId(cognito, input);
    assertNonNullable(input.VerificationMessageTemplate);

    // When the caller edits that object afterwards, as it would to create a
    // second pool from the same starting point.
    input.VerificationMessageTemplate.EmailSubject = "Something else";
    input.EmailVerificationSubject = "Something else";

    // Then the pool still reports what the request said when it was made,
    // rather than following the object it was handed.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );
    assertNonNullable(described.UserPool);
    assertObjectEquals(
      described.UserPool.VerificationMessageTemplate,
      cdkDefaultSettings.VerificationMessageTemplate,
    );
    assertIdentical(
      described.UserPool.EmailVerificationSubject,
      "Verify your new account",
    );
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
