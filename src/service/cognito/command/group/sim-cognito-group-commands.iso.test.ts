import {
  CreateGroupCommand,
  CreateUserPoolCommand,
  DeleteGroupCommand,
  GetGroupCommand,
  UpdateGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCognitoGroupExistsException,
  SimCognitoResourceNotFoundException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface SimCognitoWithPool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

async function simCognitoWithPool(): Promise<SimCognitoWithPool> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  return { cognito, userPoolId: created.UserPool.Id };
}

describe("sim Cognito group commands", () => {
  it("creates a group with the properties the request gave it", async () => {
    // Given a simulated user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a group is created.
    const created = await cognito.createGroup(
      new CreateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
        Description: "People who can change things",
        Precedence: 1,
        RoleArn: "arn:aws:iam::111111111111:role/admins",
      }),
    );

    // Then the group comes back with them, and with the pool it belongs to.
    assertNonNullable(created.Group);
    assertObjectMatches(created.Group, {
      GroupName: "admins",
      UserPoolId: userPoolId,
      Description: "People who can change things",
      Precedence: 1,
      RoleArn: "arn:aws:iam::111111111111:role/admins",
    });
    assertInstanceOf(created.Group.CreationDate, Date);
  });

  it("leaves out the properties a group does not have", async () => {
    // Given a simulated user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a group is created with nothing but a name.
    const created = await cognito.createGroup(
      new CreateGroupCommand({ UserPoolId: userPoolId, GroupName: "readers" }),
    );

    // Then it has no precedence rather than a zero, which is a precedence of
    // its own and the strongest one.
    assertUndefined(created.Group?.Precedence);
    assertUndefined(created.Group?.Description);
    assertUndefined(created.Group?.RoleArn);
  });

  it("refuses a group name the pool already holds", async () => {
    // Given a pool holding a group.
    const { cognito, userPoolId } = await simCognitoWithPool();
    const adminsCommand = new CreateGroupCommand({
      UserPoolId: userPoolId,
      GroupName: "admins",
    });

    await cognito.createGroup(adminsCommand);

    // When the same name is created again.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.createGroup(adminsCommand);
    });

    // Then it is refused, as real Cognito refuses it.
    assertInstanceOf(error, SimCognitoGroupExistsException);
    assertStringIncludes(error.message, "already exists");
  });

  it("reads a group back by name", async () => {
    // Given a created group.
    const { cognito, userPoolId } = await simCognitoWithPool();
    await cognito.createGroup(
      new CreateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
        Precedence: 3,
      }),
    );

    // When it is read.
    const read = await cognito.getGroup(
      new GetGroupCommand({ UserPoolId: userPoolId, GroupName: "admins" }),
    );

    // Then the same group comes back, and the simulator's own accessor finds
    // it too.
    assertNonNullable(read.Group);
    assertIdentical(read.Group.GroupName, "admins");
    assertIdentical(read.Group.Precedence, 3);
    assertNonNullable(cognito.findUserPool(userPoolId)?.findGroup("admins"));
  });

  it("refuses an operation on a group the pool does not hold", async () => {
    // Given an empty pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When an unknown group is read.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.getGroup(
        new GetGroupCommand({ UserPoolId: userPoolId, GroupName: "nobody" }),
      );
    });

    // Then it is reported missing.
    assertInstanceOf(error, SimCognitoResourceNotFoundException);
    assertStringIncludes(error.message, "does not exist");
  });

  it("replaces every group property an update names", async () => {
    // Given a group with a description and a precedence.
    const { cognito, userPoolId } = await simCognitoWithPool();
    await cognito.createGroup(
      new CreateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
        Description: "People who can change things",
        Precedence: 5,
      }),
    );

    // When both are updated.
    const updated = await cognito.updateGroup(
      new UpdateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
        Description: "Now something else",
        Precedence: 2,
      }),
    );

    // Then the group carries the new values.
    assertNonNullable(updated.Group);
    assertObjectMatches(updated.Group, {
      Description: "Now something else",
      Precedence: 2,
    });
  });

  it("clears a group property an update leaves out", async () => {
    // Given a group with a description.
    const { cognito, userPoolId } = await simCognitoWithPool();
    await cognito.createGroup(
      new CreateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
        Description: "People who can change things",
        Precedence: 5,
      }),
    );

    // When only the precedence is updated.
    await cognito.updateGroup(
      new UpdateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
        Precedence: 2,
      }),
    );

    // Then the description is gone: an update replaces all three properties,
    // because real Cognito does not say whether it replaces or merges.
    const read = await cognito.getGroup(
      new GetGroupCommand({ UserPoolId: userPoolId, GroupName: "admins" }),
    );

    assertUndefined(read.Group?.Description);
    assertIdentical(read.Group?.Precedence, 2);
  });

  it("deletes a group", async () => {
    // Given a created group.
    const { cognito, userPoolId } = await simCognitoWithPool();
    await cognito.createGroup(
      new CreateGroupCommand({ UserPoolId: userPoolId, GroupName: "admins" }),
    );

    // When it is deleted.
    await cognito.deleteGroup(
      new DeleteGroupCommand({ UserPoolId: userPoolId, GroupName: "admins" }),
    );

    // Then it is gone.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.getGroup(
        new GetGroupCommand({ UserPoolId: userPoolId, GroupName: "admins" }),
      );
    });

    assertInstanceOf(error, SimCognitoResourceNotFoundException);
  });
});
