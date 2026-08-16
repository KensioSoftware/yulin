import {
  type CreateUserPoolCommandInput,
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
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
  readonly input: Partial<CreateUserPoolCommandInput>;
  readonly says: string;
}

/**
 * Each of these changes what a real pool does, so a request carrying one is
 * refused rather than answered with a pool that behaves differently.
 */
const refusedInputs: readonly RefusedInput[] = [
  {
    label: "UsernameAttributes",
    input: { UsernameAttributes: ["email"] },
    says: "stores a generated UUID as the username",
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
    label: "LambdaConfig",
    input: {
      LambdaConfig: {
        UserMigration: "arn:aws:lambda:eu-west-2:1:function:f",
      },
    },
    says: "LambdaConfig UserMigration is not simulated",
  },
  {
    label: "AliasAttributes",
    input: { AliasAttributes: ["email"] },
    says: "sign-in aliases",
  },
  {
    label: "UsernameConfiguration",
    input: { UsernameConfiguration: { CaseSensitive: false } },
    says: "case-insensitive usernames",
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
        RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }],
      },
    },
    says: "account recovery",
  },
  {
    label: "AdminCreateUserConfig InviteMessageTemplate",
    input: {
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: true,
        InviteMessageTemplate: { EmailSubject: "Welcome" },
      },
    },
    says: "the wording of the invitation an admin-created user is sent",
  },
  {
    label: "AdminCreateUserConfig UnusedAccountValidityDays",
    input: {
      AdminCreateUserConfig: { UnusedAccountValidityDays: 3 },
    },
    says: "expiring the temporary password an admin-created user was sent",
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
    input: {
      SmsConfiguration: { SnsCallerArn: "arn:aws:iam::1:role/sms" },
    },
    says: "SMS delivery",
  },
  {
    label: "VerificationMessageTemplate DefaultEmailOption",
    input: {
      VerificationMessageTemplate: { DefaultEmailOption: "CONFIRM_WITH_LINK" },
    },
    says: "confirming a sign-up by following a link",
  },
  {
    label: "VerificationMessageTemplate EmailMessageByLink",
    input: {
      VerificationMessageTemplate: { EmailMessageByLink: "Follow {##here##}" },
    },
    says: "confirming a sign-up by following a link",
  },
  {
    label: "VerificationMessageTemplate EmailSubjectByLink",
    input: {
      VerificationMessageTemplate: { EmailSubjectByLink: "Confirm" },
    },
    says: "confirming a sign-up by following a link",
  },
  {
    label: "SmsAuthenticationMessage",
    input: { SmsAuthenticationMessage: "Your code is {####}" },
    says: "multi-factor authentication messages",
  },
];

function simCognito(): SimCognitoIdentityProvider {
  return new SimAws().cognitoIdentityProvider();
}

async function refusedPool(
  cognito: SimCognitoIdentityProvider,
  input: Partial<CreateUserPoolCommandInput>,
  label: string,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users", ...input }),
    );
  }, label);
}

describe("sim Cognito user pool validation", () => {
  it("refuses every CreateUserPool input it does not simulate", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When each unsimulated input is used.
    const outcomes = await Promise.all(
      refusedInputs.map(async (refused) => ({
        refused,
        error: await refusedPool(cognito, refused.input, refused.label),
      })),
    );

    // Then each request is refused, saying what it was that could not be
    // honoured.
    for (const { refused, error } of outcomes) {
      assertInstanceOf(error, SimCognitoInvalidParameterException);
      assertStringIncludes(error.message, refused.says);
    }
  });

  it("accepts the inputs whose only simulated value is their default", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When a pool asks for the settings this simulation does model.
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        UserPoolTier: "ESSENTIALS",
      }),
    );

    // Then it is created rather than refused.
    assertIdentical(created.UserPool?.Name, "myapp-users");
  });

  it("refuses a request with no pool name", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When a pool is created without a name. The SDK's own types insist on
    // one, so this is the request as it reaches the simulator.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.createUserPool({ input: {} });
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "PoolName is required");
  });

  it("refuses a pool name Cognito would refuse", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When names Cognito does not allow are used.
    const tooLong = await refusedPool(
      cognito,
      { PoolName: "a".repeat(129) },
      "too long",
    );
    const badCharacters = await refusedPool(
      cognito,
      { PoolName: "myapp/users" },
      "bad characters",
    );

    // Then both are refused before anything is created.
    assertStringIncludes(tooLong.message, "longer than the 128 characters");
    assertStringIncludes(
      badCharacters.message,
      "contains characters Cognito does not allow",
    );
  });

  it("refuses a password policy outside the range Cognito allows", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When a minimum length below six and a temporary password validity over
    // a year are asked for.
    const tooShort = await refusedPool(
      cognito,
      { Policies: { PasswordPolicy: { MinimumLength: 4 } } },
      "minimum length",
    );
    const tooLong = await refusedPool(
      cognito,
      {
        Policies: {
          PasswordPolicy: { TemporaryPasswordValidityDays: 400 },
        },
      },
      "temporary password validity",
    );

    // Then both are refused.
    assertStringIncludes(tooShort.message, "MinimumLength must be a whole");
    assertStringIncludes(
      tooLong.message,
      "TemporaryPasswordValidityDays must be a whole",
    );
  });

  it("refuses a deletion protection value Cognito does not have", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When a pool asks for protection in a word Cognito does not use.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.createUserPool({
        input: { PoolName: "myapp-users", DeletionProtection: "ENABLED" },
      });
    });

    // Then it is refused.
    assertStringIncludes(error.message, "use ACTIVE or INACTIVE");
  });

  it("refuses a request naming no pool, or one that is not a pool id", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When a pool is described with a missing id and with a malformed one.
    const missing = await assertThrowsErrorAsync(async () => {
      await cognito.describeUserPool({ input: {} });
    });
    const malformed = await assertThrowsErrorAsync(async () => {
      await cognito.describeUserPool(
        new DescribeUserPoolCommand({ UserPoolId: "myapp-users" }),
      );
    });

    // Then both fail as validation errors rather than as missing pools.
    assertInstanceOf(missing, SimCognitoInvalidParameterException);
    assertStringIncludes(missing.message, "UserPoolId is required");
    assertInstanceOf(malformed, SimCognitoInvalidParameterException);
    assertStringIncludes(malformed.message, "is not a user pool id");
  });

  it("reports a well-formed id for a pool that does not exist as missing", async () => {
    // Given simulated Cognito with no pools.
    const cognito = simCognito();

    // When a pool that was never created is described.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.describeUserPool(
        new DescribeUserPoolCommand({ UserPoolId: "eu-west-2_aBcDeFgHi" }),
      );
    });

    // Then it is missing rather than malformed.
    assertInstanceOf(error, SimCognitoResourceNotFoundException);
    assertStringIncludes(error.message, "eu-west-2_aBcDeFgHi does not exist");
  });
});
