import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type {
  AccountRecoverySettingType,
  CreateUserPoolCommandInput,
  RecoveryOptionType,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertFalse,
  assertInstanceOf,
  assertObjectEquals,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";

/**
 * What CDK writes for `AccountRecovery.EMAIL_ONLY`, which is the setting a
 * pool that sends no SMS asks for.
 */
const emailOnlyRecovery: AccountRecoverySettingType = {
  RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }],
};

/**
 * A mechanism Cognito does not have, which the SDK's own types do not allow,
 * so a request carrying one reaches the simulator as it is written here.
 */
const unrecognisedRecovery = {
  RecoveryMechanisms: [{ Name: "verified_fax", Priority: 1 }],
};

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

async function describedRecovery(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
): Promise<object | undefined> {
  const described = await cognito.describeUserPool(
    new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
  );
  assertNonNullable(described.UserPool);

  return described.UserPool.AccountRecoverySetting;
}

describe("sim Cognito account recovery", () => {
  it("creates a pool that recovers an account by email alone", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When a pool is created asking for email-only recovery, as a pool with
    // no phone number to recover through does.
    const userPoolId = await createdPoolId(cognito, {
      AccountRecoverySetting: emailOnlyRecovery,
    });

    // Then the pool exists, and reports back the mechanism it was asked for
    // rather than the two real Cognito gives a pool that asked for none.
    assertObjectEquals(
      await describedRecovery(cognito, userPoolId),
      emailOnlyRecovery,
    );
  });

  it("keeps the mechanisms in the order the request listed them", async () => {
    // Given a pool created listing both mechanisms the other way round to the
    // default, so email is tried first.
    const cognito = simCognito();
    const emailFirst: AccountRecoverySettingType = {
      RecoveryMechanisms: [
        { Name: "verified_email", Priority: 1 },
        { Name: "verified_phone_number", Priority: 2 },
      ],
    };
    const userPoolId = await createdPoolId(cognito, {
      AccountRecoverySetting: emailFirst,
    });

    // Then that is the order it is reported in, because the order is what the
    // priorities say.
    assertObjectEquals(
      await describedRecovery(cognito, userPoolId),
      emailFirst,
    );
  });

  it("creates a pool that recovers nothing without an administrator", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When a pool asks for admin_only, which is what CDK writes for
    // AccountRecovery.NONE.
    const userPoolId = await createdPoolId(cognito, {
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: "admin_only", Priority: 1 }],
      },
    });

    // Then it is created, rather than refused for choosing something no
    // recovery here would have reached anyway.
    assertObjectEquals(await describedRecovery(cognito, userPoolId), {
      RecoveryMechanisms: [{ Name: "admin_only", Priority: 1 }],
    });
  });

  it("reports nothing for a pool created without a recovery setting", async () => {
    // Given a pool created with nothing but a name.
    const cognito = simCognito();
    const userPoolId = await createdPoolId(cognito, {});

    // When it is described.
    // Then it reports no recovery setting, rather than the mechanisms real
    // Cognito would have given it, because it chose none.
    assertUndefined(await describedRecovery(cognito, userPoolId));
  });

  it("keeps what the request said rather than the request object", async () => {
    // Given a pool created from an input object the caller still holds.
    const cognito = simCognito();
    const mechanism: RecoveryOptionType = {
      Name: "verified_email",
      Priority: 1,
    };
    const userPoolId = await createdPoolId(cognito, {
      AccountRecoverySetting: { RecoveryMechanisms: [mechanism] },
    });

    // When the caller edits that object afterwards, as it would to create a
    // second pool from the same starting point.
    mechanism.Name = "verified_phone_number";

    // Then the pool still reports what the request said when it was made.
    assertObjectEquals(
      await describedRecovery(cognito, userPoolId),
      emailOnlyRecovery,
    );
  });

  it("refuses a mechanism Cognito does not have", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When a pool asks to recover an account a way Cognito cannot.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.createUserPool({
        input: {
          PoolName: "myapp-users",
          AccountRecoverySetting: unrecognisedRecovery,
        },
      });
    });

    // Then it is refused, naming the mechanism and the ones Cognito has, as
    // real Cognito refuses a pool it cannot create.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "CreateUserPool");
    assertStringIncludes(error.message, "verified_fax");
    assertStringIncludes(error.message, "verified_email");
    assertStringIncludes(error.message, "admin_only");
  });

  it("refuses a mechanism with no name", async () => {
    // Given simulated Cognito. The SDK's own types allow a mechanism without a
    // name, so this is the request as it reaches the simulator.
    const cognito = simCognito();

    // When a pool lists a mechanism that says only where it comes in the
    // order.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.createUserPool({
        input: {
          PoolName: "myapp-users",
          AccountRecoverySetting: { RecoveryMechanisms: [{ Priority: 1 }] },
        },
      });
    });

    // Then it is refused, because real Cognito needs the name.
    assertStringIncludes(error.message, "entry with no Name");
  });

  it("refuses a mechanism an update names, in its own words", async () => {
    // Given a pool created with email-only recovery.
    const cognito = simCognito();
    const userPoolId = await createdPoolId(cognito, {
      AccountRecoverySetting: emailOnlyRecovery,
    });

    // When an update asks for a mechanism Cognito does not have.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.updateUserPool({
        input: {
          UserPoolId: userPoolId,
          AccountRecoverySetting: unrecognisedRecovery,
        },
      });
    });

    // Then the refusal names the operation that was attempted.
    assertStringIncludes(error.message, "UpdateUserPool");

    // And the pool still recovers the way it did before the update.
    assertObjectEquals(
      await describedRecovery(cognito, userPoolId),
      emailOnlyRecovery,
    );
  });

  it("signs a user up in a pool that recovers by email alone", async () => {
    // Given a pool with email-only recovery that users may sign themselves up
    // in.
    const cognito = simCognito();
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        AccountRecoverySetting: emailOnlyRecovery,
        AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
      }),
    );
    const userPoolId = created.UserPool?.Id;
    assertTypeString(userPoolId);

    const client = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );
    const clientId = client.UserPoolClient?.ClientId;
    assertTypeString(clientId);

    // When a user signs itself up.
    const signedUp = await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "ada",
        Password: "Sup3rSecret!",
        UserAttributes: [{ Name: "email", Value: "ada@example.com" }],
      }),
    );

    // Then the sign-up works as it does in any other pool: the recovery
    // setting is about a password that was forgotten, not one being set.
    assertFalse(signedUp.UserConfirmed);
    assertTypeString(signedUp.UserSub);
  });
});
