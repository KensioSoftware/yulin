import {
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertStringLength,
  assertStringStartsWith,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoResourceNotFoundException } from "../../error/sim-cognito.error.js";

function simCognitoInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: "111111111111",
    defaultRegionName: "eu-west-2",
  });
}

describe("sim Cognito user pool commands", () => {
  it("creates a user pool with an id naming its region", async () => {
    // Given simulated Cognito in one account and region.
    const simAws = simCognitoInEuWest2();

    // When a pool is created.
    const created = await simAws
      .cognitoIdentityProvider()
      .createUserPool(new CreateUserPoolCommand({ PoolName: "myapp-users" }));

    // Then the id takes the real '<region>_<nine characters>' form, and the
    // ARN names that id.
    assertNonNullable(created.UserPool);
    assertNonNullable(created.UserPool.Id);
    assertStringStartsWith(created.UserPool.Id, "eu-west-2_");
    assertStringLength(created.UserPool.Id.split("_", 2)[1] ?? "", 9);
    assertIdentical(
      created.UserPool.Arn,
      `arn:aws:cognito-idp:eu-west-2:111111111111:userpool/${created.UserPool.Id}`,
    );
    assertIdentical(created.UserPool.Name, "myapp-users");
    assertInstanceOf(created.UserPool.CreationDate, Date);
  });

  it("defaults a new pool to the real Cognito defaults", async () => {
    // Given simulated Cognito.
    const simAws = simCognitoInEuWest2();

    // When a pool is created with nothing but a name.
    const created = await simAws
      .cognitoIdentityProvider()
      .createUserPool(new CreateUserPoolCommand({ PoolName: "myapp-users" }));

    // Then its password policy is the eight character one real Cognito
    // applies, it has no MFA, and it is not protected against deletion.
    assertNonNullable(created.UserPool);
    assertObjectMatches(created.UserPool, {
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8,
          RequireUppercase: true,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
          TemporaryPasswordValidityDays: 7,
        },
      },
      MfaConfiguration: "OFF",
      DeletionProtection: "INACTIVE",
      EstimatedNumberOfUsers: 0,
    });
  });

  it("keeps the parts of a password policy the request sets", async () => {
    // Given simulated Cognito.
    const simAws = simCognitoInEuWest2();

    // When a pool is created with a longer minimum and no symbol required.
    const created = await simAws.cognitoIdentityProvider().createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        Policies: {
          PasswordPolicy: { MinimumLength: 12, RequireSymbols: false },
        },
      }),
    );

    // Then those are stored, and the rest keep their defaults.
    assertNonNullable(created.UserPool);
    assertObjectMatches(created.UserPool, {
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireSymbols: false,
          RequireUppercase: true,
          TemporaryPasswordValidityDays: 7,
        },
      },
    });
  });

  it("describes a pool by its id", async () => {
    // Given a created pool.
    const simAws = simCognitoInEuWest2();
    const cognito = simAws.cognitoIdentityProvider();
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );

    // When it is described.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: created.UserPool?.Id }),
    );

    // Then the same pool comes back.
    assertNonNullable(described.UserPool);
    assertIdentical(described.UserPool.Id, created.UserPool?.Id);
    assertIdentical(described.UserPool.Name, "myapp-users");
  });

  it("deletes a pool", async () => {
    // Given a created pool.
    const simAws = simCognitoInEuWest2();
    const cognito = simAws.cognitoIdentityProvider();
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = created.UserPool?.Id;

    // When it is deleted.
    await cognito.deleteUserPool(
      new DeleteUserPoolCommand({ UserPoolId: userPoolId }),
    );

    // Then it is gone.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.describeUserPool(
        new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
      );
    });

    assertInstanceOf(error, SimCognitoResourceNotFoundException);
    assertStringIncludes(error.message, "does not exist");
  });

  it("refuses to delete a pool protected against deletion", async () => {
    // Given a pool created with deletion protection active.
    const simAws = simCognitoInEuWest2();
    const cognito = simAws.cognitoIdentityProvider();
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        DeletionProtection: "ACTIVE",
      }),
    );

    // When deleting it is tried.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.deleteUserPool(
        new DeleteUserPoolCommand({ UserPoolId: created.UserPool?.Id }),
      );
    });

    // Then it is refused, as real Cognito refuses it.
    assertIdentical(error.name, "InvalidParameterException");
    assertStringIncludes(error.message, "protected against deletion");
  });

  it("keeps pools in one account and region out of another", async () => {
    // Given a pool in one account and region.
    const simAws = new SimAws();
    const created = await simAws
      .account("111111111111")
      .region("eu-west-2")
      .cognitoIdentityProvider()
      .createUserPool(new CreateUserPoolCommand({ PoolName: "myapp-users" }));

    // When another scope is asked for it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .account("222222222222")
        .region("us-east-1")
        .cognitoIdentityProvider()
        .describeUserPool(
          new DescribeUserPoolCommand({ UserPoolId: created.UserPool?.Id }),
        );
    });

    // Then it is not there, as a pool belongs to one account and region.
    assertInstanceOf(error, SimCognitoResourceNotFoundException);
  });
});
