import {
  type UpdateUserPoolCommandInput,
  CreateUserPoolCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCognitoInvalidParameterException,
  SimCognitoResourceNotFoundException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface RefusedInput {
  readonly label: string;
  readonly input: Partial<UpdateUserPoolCommandInput>;
  readonly says: string;
}

/**
 * The inputs an update carries that this simulation does not model. They are
 * the same ones `CreateUserPool` refuses, apart from `PoolName`, which only
 * an update can carry as a change.
 */
const refusedInputs: readonly RefusedInput[] = [
  {
    label: "PoolName",
    input: { PoolName: "myapp-members" },
    says: "renaming a pool",
  },
  {
    label: "MfaConfiguration",
    input: { MfaConfiguration: "OPTIONAL" },
    says: "multi-factor authentication",
  },
  {
    label: "UserPoolTier",
    input: { UserPoolTier: "PLUS" },
    says: "the Lite and Plus feature plans",
  },
  {
    label: "SignInPolicy",
    input: {
      Policies: { SignInPolicy: { AllowedFirstAuthFactors: ["EMAIL_OTP"] } },
    },
    says: "which factors a user may sign in with first",
  },
  {
    label: "PasswordHistorySize",
    input: { Policies: { PasswordPolicy: { PasswordHistorySize: 3 } } },
    says: "a password the user has used before",
  },
  {
    label: "LambdaConfig PreSignUp",
    input: {
      LambdaConfig: { PreSignUp: "arn:aws:lambda:eu-west-2:1:function:f" },
    },
    says: "validating a self-service sign-up",
  },
  {
    label: "UserAttributeUpdateSettings",
    input: {
      UserAttributeUpdateSettings: {
        AttributesRequireVerificationBeforeUpdate: ["email"],
      },
    },
    says: "verification before an attribute changes",
  },
  {
    label: "DeviceConfiguration",
    input: { DeviceConfiguration: { ChallengeRequiredOnNewDevice: true } },
    says: "device remembering",
  },
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
    label: "AdminCreateUserConfig InviteMessageTemplate",
    input: {
      AdminCreateUserConfig: {
        InviteMessageTemplate: { EmailSubject: "Welcome" },
      },
    },
    says: "the wording of the invitation an admin-created user is sent",
  },
  {
    label: "UserPoolAddOns",
    input: { UserPoolAddOns: { AdvancedSecurityMode: "ENFORCED" } },
    says: "threat protection",
  },
  {
    label: "KeyConfiguration",
    input: { KeyConfiguration: { KeyType: "CUSTOMER_MANAGED_KEY" } },
    says: "encryption under a customer managed key",
  },
  {
    label: "IssuerConfiguration",
    input: { IssuerConfiguration: { Type: "UPDATED" } },
    says: "a custom token issuer",
  },
  {
    label: "UserPoolTags",
    input: { UserPoolTags: { team: "platform" } },
    says: "tags",
  },
  {
    label: "EmailConfiguration",
    input: { EmailConfiguration: { EmailSendingAccount: "DEVELOPER" } },
    says: "email delivery",
  },
  {
    label: "SmsConfiguration",
    input: { SmsConfiguration: { SnsCallerArn: "arn:aws:iam::1:role/sms" } },
    says: "SMS delivery",
  },
  {
    label: "SmsAuthenticationMessage",
    input: { SmsAuthenticationMessage: "Your code is {####}" },
    says: "multi-factor authentication messages",
  },
  {
    label: "VerificationMessageTemplate",
    input: {
      VerificationMessageTemplate: { DefaultEmailOption: "CONFIRM_WITH_LINK" },
    },
    says: "the wording of a verification message",
  },
  {
    label: "EmailVerificationMessage",
    input: { EmailVerificationMessage: "Your code is {####}" },
    says: "the wording of a verification message",
  },
];

async function createdPoolId(
  cognito: SimCognitoIdentityProvider,
): Promise<string> {
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );
  const userPoolId = created.UserPool?.Id;
  assertTypeString(userPoolId);

  return userPoolId;
}

describe("sim Cognito UpdateUserPool validation", () => {
  it("refuses every UpdateUserPool input it does not simulate", async () => {
    // Given a created pool.
    const cognito = new SimAws().cognitoIdentityProvider();
    const userPoolId = await createdPoolId(cognito);

    // When each unsimulated input is used in an update.
    const outcomes = await Promise.all(
      refusedInputs.map(async (refused) => ({
        refused,
        error: await assertThrowsErrorAsync(async () => {
          await cognito.updateUserPool(
            new UpdateUserPoolCommand({
              UserPoolId: userPoolId,
              ...refused.input,
            }),
          );
        }, refused.label),
      })),
    );

    // Then each request is refused in the same words CreateUserPool uses,
    // naming UpdateUserPool as the operation that could not honour it.
    for (const { refused, error } of outcomes) {
      assertInstanceOf(error, SimCognitoInvalidParameterException);
      assertStringIncludes(error.message, "UpdateUserPool");
      assertStringIncludes(error.message, refused.says);
      assertStringIncludes(error.message, "is not simulated");
    }
  });

  it("accepts the inputs whose only simulated value is their default", async () => {
    // Given a created pool.
    const cognito = new SimAws().cognitoIdentityProvider();
    const userPoolId = await createdPoolId(cognito);

    // When an update carries them at the values this simulation does model.
    await cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        MfaConfiguration: "OFF",
        UserPoolTier: "ESSENTIALS",
        AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      }),
    );

    // Then the update is applied rather than refused.
    const described = await cognito.describeUserPool({
      input: { UserPoolId: userPoolId },
    });

    assertTrue(
      described.UserPool?.AdminCreateUserConfig?.AllowAdminCreateUserOnly,
    );
  });

  it("refuses an attribute Cognito cannot verify", async () => {
    // Given a created pool.
    const cognito = new SimAws().cognitoIdentityProvider();
    const userPoolId = await createdPoolId(cognito);

    // When an update asks to auto-verify an attribute no code is sent to. The
    // SDK's own types allow only the attributes Cognito can verify, so this is
    // the request as it reaches the simulator.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.updateUserPool({
        input: {
          UserPoolId: userPoolId,
          AutoVerifiedAttributes: ["profile"],
        },
      });
    });

    // Then it is refused, as it is on creation.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "email and phone_number");
  });

  it("refuses an update naming no pool, or one that does not exist", async () => {
    // Given simulated Cognito with no pools.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When an update names no pool, and when it names one never created. The
    // SDK's own types insist on an id, so the first is the request as it
    // reaches the simulator.
    const missingId = await assertThrowsErrorAsync(async () => {
      await cognito.updateUserPool({ input: {} });
    });
    const missingPool = await assertThrowsErrorAsync(async () => {
      await cognito.updateUserPool(
        new UpdateUserPoolCommand({ UserPoolId: "eu-west-2_aBcDeFgHi" }),
      );
    });

    // Then the first fails validation and the second reports the pool
    // missing.
    assertInstanceOf(missingId, SimCognitoInvalidParameterException);
    assertStringIncludes(missingId.message, "UserPoolId is required");
    assertInstanceOf(missingPool, SimCognitoResourceNotFoundException);
    assertStringIncludes(missingPool.message, "does not exist");
  });
});
