import {
  CreateGroupCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";
import type { SimCreateGroupCommandInput } from "./group.command.js";

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

/**
 * Create a group in a fresh pool with the inputs given.
 *
 * The SDK's own types insist on a group name, so this is the request as it
 * reaches the simulator.
 */
async function createGroupWith(
  input: Omit<SimCreateGroupCommandInput, "UserPoolId">,
): Promise<void> {
  const { cognito, userPoolId } = await simCognitoWithPool();

  await cognito.createGroup({ input: { UserPoolId: userPoolId, ...input } });
}

describe("sim Cognito group validation", () => {
  it("refuses a request naming no group at all", async () => {
    // Given a pool.
    // When a group is created with no name.
    const error = await assertThrowsErrorAsync(async () => {
      await createGroupWith({});
    });

    // Then it is refused, naming the input the request left out.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "GroupName is required");
  });

  it("refuses a group name Cognito would not accept", async () => {
    // Given a pool.
    // When a group name with a space in it is created.
    const error = await assertThrowsErrorAsync(async () => {
      await createGroupWith({ GroupName: "the admins" });
    });

    // Then it is refused as a validation error.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "may not hold whitespace");
  });

  it("refuses a precedence outside the range Cognito allows", async () => {
    // Given a pool.
    // When a negative precedence is set.
    const error = await assertThrowsErrorAsync(async () => {
      await createGroupWith({ GroupName: "admins", Precedence: -1 });
    });

    // Then it is refused. Zero is the strongest precedence, not the weakest.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "Precedence must be a whole number");
  });

  it("keeps a precedence of zero, which is the strongest one", async () => {
    // Given a pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a group is created with a precedence of zero.
    const created = await cognito.createGroup(
      new CreateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
        Precedence: 0,
      }),
    );

    // Then it is kept rather than read as no precedence at all.
    assertIdentical(created.Group?.Precedence, 0);
  });

  it("refuses a description longer than Cognito allows", async () => {
    // Given a pool.
    // When a 2049 character description is set.
    const error = await assertThrowsErrorAsync(async () => {
      await createGroupWith({
        GroupName: "admins",
        Description: "a".repeat(2049),
      });
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "2048");
  });

  it("refuses a role that is not an ARN", async () => {
    // Given a pool.
    // When a role name is set where an ARN belongs.
    const error = await assertThrowsErrorAsync(async () => {
      await createGroupWith({ GroupName: "admins", RoleArn: "admins-role" });
    });

    // Then it is refused, because the role reaches token claims that need a
    // real ARN.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "is not an ARN");
  });

  it("refuses a group operation on a pool that does not exist", async () => {
    // Given simulated Cognito with no pools.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a group is created in a pool that was never created.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.createGroup(
        new CreateGroupCommand({
          UserPoolId: "myapp-users",
          GroupName: "admins",
        }),
      );
    });

    // Then the pool id fails validation before anything is looked up.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "is not a user pool id");
  });
});
