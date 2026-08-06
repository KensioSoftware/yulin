import {
  type UpdateUserPoolCommandInput,
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolCommand,
  ListUserPoolsCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

/**
 * The settings a pool is created with in the tests that then change them,
 * each one at something other than its default.
 */
const createdSettings = {
  Policies: { PasswordPolicy: { MinimumLength: 12, RequireSymbols: false } },
  DeletionProtection: "ACTIVE",
  AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
  AutoVerifiedAttributes: ["email"],
} satisfies Partial<UpdateUserPoolCommandInput>;

describe("sim Cognito UpdateUserPool", () => {
  it("applies the settings an update names", async () => {
    // Given a pool created with nothing but a name.
    const cognito = new SimAws().cognitoIdentityProvider();
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = created.UserPool?.Id;

    // When it is updated with each of the settings this simulation models.
    await cognito.updateUserPool(
      new UpdateUserPoolCommand({ UserPoolId: userPoolId, ...createdSettings }),
    );

    // Then the described pool reports every one of them.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );

    assertNonNullable(described.UserPool);
    assertObjectMatches(described.UserPool, {
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireSymbols: false,
          RequireUppercase: true,
        },
      },
      DeletionProtection: "ACTIVE",
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      AutoVerifiedAttributes: ["email"],
    });
  });

  it("resets the settings an update leaves out", async () => {
    // Given a pool created with all of those settings, and one of the
    // settings this simulation accepts without acting on.
    const cognito = new SimAws().cognitoIdentityProvider();
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        ...createdSettings,
        EmailVerificationSubject: "Verify your new account",
      }),
    );
    const userPoolId = created.UserPool?.Id;

    // When an update names only the deletion protection.
    await cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        DeletionProtection: "INACTIVE",
      }),
    );

    // Then the settings it left out are back at the defaults CreateUserPool
    // would have given them, because an update replaces rather than merges.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );

    assertNonNullable(described.UserPool);
    assertObjectMatches(described.UserPool, {
      Policies: { PasswordPolicy: { MinimumLength: 8, RequireSymbols: true } },
      DeletionProtection: "INACTIVE",
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
    });
    assertUndefined(described.UserPool.AutoVerifiedAttributes);
    assertUndefined(described.UserPool.EmailVerificationSubject);

    // And the pool keeps the name it was created with, which is not a setting
    // an update carries.
    assertIdentical(described.UserPool.Name, "myapp-users");
  });

  it("replaces the Lambda triggers a pool runs", async () => {
    // Given a pool created with a PreAuthentication trigger.
    const cognito = new SimAws().cognitoIdentityProvider();
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        LambdaConfig: {
          PreAuthentication: "arn:aws:lambda:us-east-1:111111111111:function:a",
        },
      }),
    );
    const userPoolId = created.UserPool?.Id;

    // When an update names a PostAuthentication trigger and nothing else.
    await cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        LambdaConfig: {
          PostAuthentication:
            "arn:aws:lambda:us-east-1:111111111111:function:b",
        },
      }),
    );

    // Then the pool runs that trigger and no longer runs the first, because
    // the whole LambdaConfig is replaced.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );

    assertNonNullable(described.UserPool);
    assertObjectEquals(described.UserPool.LambdaConfig, {
      PostAuthentication: "arn:aws:lambda:us-east-1:111111111111:function:b",
    });
  });

  it("reports when the pool was last updated", async () => {
    // Given a pool created twenty minutes ago, on a clock held still so the
    // dates are exactly the twenty minutes apart.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();

    simAws.clock().freeze();

    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = created.UserPool?.Id;

    await simAws.clock().advanceBy({ minutes: 20 });

    // When it is updated.
    await cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        DeletionProtection: "ACTIVE",
      }),
    );

    // Then it reports the update as its LastModifiedDate, and its creation
    // date is unchanged.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );
    const creationTime = created.UserPool?.CreationDate?.getTime();

    assertNonNullable(creationTime);
    assertIdentical(described.UserPool?.CreationDate?.getTime(), creationTime);
    assertIdentical(
      described.UserPool.LastModifiedDate?.getTime(),
      creationTime + 20 * 60 * 1000,
    );

    // And a listed pool reports the same, as ListUserPools reports both dates.
    const listed = await cognito.listUserPools(
      new ListUserPoolsCommand({ MaxResults: 10 }),
    );

    assertIdentical(
      listed.UserPools?.[0]?.LastModifiedDate?.getTime(),
      creationTime + 20 * 60 * 1000,
    );
  });

  it("reports the creation date for a pool never updated", async () => {
    // Given a pool nothing has changed since it was created.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();

    simAws.clock().freeze();

    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );

    await simAws.clock().advanceBy({ minutes: 20 });

    // When it is described and listed.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: created.UserPool?.Id }),
    );
    const listed = await cognito.listUserPools(
      new ListUserPoolsCommand({ MaxResults: 10 }),
    );

    // Then both report its creation date as the last modified date, rather
    // than the time they were asked.
    const creationTime = created.UserPool?.CreationDate?.getTime();

    assertNonNullable(creationTime);
    assertIdentical(
      described.UserPool?.LastModifiedDate?.getTime(),
      creationTime,
    );
    assertIdentical(
      listed.UserPools?.[0]?.LastModifiedDate?.getTime(),
      creationTime,
    );
  });

  it("deletes a pool an update has unprotected", async () => {
    // Given a pool created with deletion protection active.
    const cognito = new SimAws().cognitoIdentityProvider();
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        DeletionProtection: "ACTIVE",
      }),
    );
    const userPoolId = created.UserPool?.Id;

    assertTypeString(userPoolId);

    // And deleting it refused, saying to deactivate the protection first.
    const protectedError = await assertThrowsErrorAsync(async () => {
      await cognito.deleteUserPool(
        new DeleteUserPoolCommand({ UserPoolId: userPoolId }),
      );
    });

    assertStringIncludes(protectedError.message, "UpdateUserPool");

    // When the protection is deactivated and the pool deleted.
    await cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        DeletionProtection: "INACTIVE",
      }),
    );
    await cognito.deleteUserPool(
      new DeleteUserPoolCommand({ UserPoolId: userPoolId }),
    );

    // Then it is gone.
    const listed = await cognito.listUserPools(
      new ListUserPoolsCommand({ MaxResults: 10 }),
    );

    assertIdentical(listed.UserPools?.length, 0);
  });
});
