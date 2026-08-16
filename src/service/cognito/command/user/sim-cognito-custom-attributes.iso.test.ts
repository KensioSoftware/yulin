import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  ListUsersCommand,
  SignUpCommand,
  type AttributeType,
  type SchemaAttributeType,
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

const password = "Sup3rSecret!";

/**
 * The schema the pool in most of these tests declares: an identifier the
 * application keys its own data on, which is what a custom attribute is for,
 * and a mutable number beside it.
 */
const appSchema: readonly SchemaAttributeType[] = [
  { Name: "userId", AttributeDataType: "String", Mutable: false },
  {
    Name: "seats",
    AttributeDataType: "Number",
    Mutable: true,
    NumberAttributeConstraints: { MinValue: "1", MaxValue: "10" },
  },
];

interface SimCognitoPool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
}

/**
 * A pool declaring the schema given, with an app client users sign up at.
 */
async function poolWith(
  schema: readonly SchemaAttributeType[],
): Promise<SimCognitoPool> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users", Schema: [...schema] }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: pool.UserPool.Id,
      ClientName: "web",
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  return {
    cognito,
    userPoolId: pool.UserPool.Id,
    clientId: client.UserPoolClient.ClientId,
  };
}

/**
 * The value of one attribute of a user, as `AdminGetUser` reports it.
 */
async function attributeOf(
  pool: SimCognitoPool,
  username: string,
  name: string,
): Promise<string | undefined> {
  const user = await pool.cognito.adminGetUser(
    new AdminGetUserCommand({
      UserPoolId: pool.userPoolId,
      Username: username,
    }),
  );

  return user.UserAttributes?.find((attribute) => attribute.Name === name)
    ?.Value;
}

/**
 * Sign a user up with the attributes given.
 */
async function signUpWith(
  pool: SimCognitoPool,
  attributes: readonly AttributeType[],
): Promise<void> {
  await pool.cognito.signUp(
    new SignUpCommand({
      ClientId: pool.clientId,
      Username: "alice",
      Password: password,
      UserAttributes: [...attributes],
    }),
  );
}

/**
 * Create a user with the attributes given, as an administrator.
 */
async function adminCreateWith(
  pool: SimCognitoPool,
  attributes: readonly AttributeType[],
): Promise<void> {
  await pool.cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: pool.userPoolId,
      Username: "alice",
      UserAttributes: [...attributes],
    }),
  );
}

describe("sim Cognito custom user attributes", () => {
  it("takes a custom attribute on a sign-up", async () => {
    // Given a pool declaring an identifier of its own.
    const pool = await poolWith(appSchema);

    // When a user signs itself up with one.
    await signUpWith(pool, [
      { Name: "custom:userId", Value: "usr_01H8" },
      { Name: "email", Value: "alice@example.com" },
    ]);

    // Then the user holds it, under the name Cognito gave the attribute.
    assertIdentical(
      await attributeOf(pool, "alice", "custom:userId"),
      "usr_01H8",
    );
  });

  it("takes a custom attribute on an admin-created user", async () => {
    // Given a pool declaring an identifier of its own.
    const pool = await poolWith(appSchema);

    // When an administrator creates a user with one.
    await adminCreateWith(pool, [{ Name: "custom:userId", Value: "usr_01H8" }]);

    // Then ListUsers reports it alongside the standard attributes.
    const listed = await pool.cognito.listUsers(
      new ListUsersCommand({ UserPoolId: pool.userPoolId }),
    );
    const attribute = listed.Users?.[0]?.Attributes?.find(
      (each) => each.Name === "custom:userId",
    );

    assertIdentical(attribute?.Value, "usr_01H8");
  });

  it("changes a mutable custom attribute", async () => {
    // Given a user holding a mutable custom attribute.
    const pool = await poolWith(appSchema);

    await adminCreateWith(pool, [{ Name: "custom:seats", Value: "3" }]);

    // When it is updated.
    await pool.cognito.adminUpdateUserAttributes(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
        UserAttributes: [{ Name: "custom:seats", Value: "7" }],
      }),
    );

    // Then the new value is the one the user holds.
    assertIdentical(await attributeOf(pool, "alice", "custom:seats"), "7");
  });

  it("refuses a second value for an immutable attribute", async () => {
    // Given a user created with an immutable identifier.
    const pool = await poolWith(appSchema);

    await adminCreateWith(pool, [{ Name: "custom:userId", Value: "usr_01H8" }]);

    // When something tries to change it.
    const error = await assertThrowsErrorAsync(async () => {
      await pool.cognito.adminUpdateUserAttributes(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: pool.userPoolId,
          Username: "alice",
          UserAttributes: [{ Name: "custom:userId", Value: "usr_02K1" }],
        }),
      );
    });

    // Then it is refused, as real Cognito refuses a write to an immutable
    // attribute the user already has.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "cannot be changed");
    assertIdentical(
      await attributeOf(pool, "alice", "custom:userId"),
      "usr_01H8",
    );
  });

  it("refuses an attribute the pool's schema does not declare", async () => {
    // Given a pool declaring two attributes of its own.
    const pool = await poolWith(appSchema);

    // When a third is set.
    const error = await assertThrowsErrorAsync(async () => {
      await adminCreateWith(pool, [{ Name: "custom:tenant", Value: "acme" }]);
    });

    // Then it is refused, saying what the pool's schema does declare.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "is not in the pool's schema");
    assertStringIncludes(error.message, "custom:userId, custom:seats");
  });

  it("holds a custom attribute to the type it was declared with", async () => {
    // Given a pool with a number attribute.
    const pool = await poolWith(appSchema);

    // When a user is created with something that is not a number.
    const error = await assertThrowsErrorAsync(async () => {
      await adminCreateWith(pool, [{ Name: "custom:seats", Value: "plenty" }]);
    });

    // Then it is refused, because Cognito refuses a value it cannot read.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "which is not a Number");
  });

  it("holds a custom attribute to the bounds it was declared with", async () => {
    // Given a pool whose number attribute is bounded.
    const pool = await poolWith(appSchema);

    // When a user is created outside those bounds.
    const below = await assertThrowsErrorAsync(async () => {
      await adminCreateWith(pool, [{ Name: "custom:seats", Value: "0" }]);
    });
    const above = await assertThrowsErrorAsync(async () => {
      await adminCreateWith(pool, [{ Name: "custom:seats", Value: "11" }]);
    });

    // Then each is refused, naming the bound it went past.
    assertStringIncludes(below.message, "below the MinValue of 1");
    assertStringIncludes(above.message, "above the MaxValue of 10");
  });

  it("holds a string attribute to the length it was declared with", async () => {
    // Given a pool whose custom attribute is a bounded string.
    const pool = await poolWith([
      {
        Name: "userId",
        AttributeDataType: "String",
        Mutable: true,
        StringAttributeConstraints: { MinLength: "4", MaxLength: "8" },
      },
    ]);

    // When a user is created outside those lengths.
    const shorter = await assertThrowsErrorAsync(async () => {
      await adminCreateWith(pool, [{ Name: "custom:userId", Value: "abc" }]);
    });
    const longer = await assertThrowsErrorAsync(async () => {
      await adminCreateWith(pool, [
        { Name: "custom:userId", Value: "abcdefghi" },
      ]);
    });

    // Then each is refused, naming the length the schema wants.
    assertStringIncludes(shorter.message, "shorter than the 4 characters");
    assertStringIncludes(longer.message, "longer than the 8 characters");
  });

  it("takes the other attribute types Cognito declares", async () => {
    // Given a pool with a boolean attribute and a date one.
    const pool = await poolWith([
      { Name: "trial", AttributeDataType: "Boolean", Mutable: true },
      { Name: "joinedAt", AttributeDataType: "DateTime", Mutable: true },
    ]);

    // When a user is created with a value of each.
    await adminCreateWith(pool, [
      { Name: "custom:trial", Value: "true" },
      { Name: "custom:joinedAt", Value: "2026-08-16T09:00:00Z" },
    ]);

    // Then both are held, a date written as the seconds since the epoch is
    // held too, and a value neither type could hold is refused.
    assertIdentical(await attributeOf(pool, "alice", "custom:trial"), "true");

    await pool.cognito.adminUpdateUserAttributes(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
        UserAttributes: [{ Name: "custom:joinedAt", Value: "1755331200" }],
      }),
    );

    assertIdentical(
      await attributeOf(pool, "alice", "custom:joinedAt"),
      "1755331200",
    );

    const error = await assertThrowsErrorAsync(async () => {
      await pool.cognito.adminUpdateUserAttributes(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: pool.userPoolId,
          Username: "alice",
          UserAttributes: [{ Name: "custom:trial", Value: "yes" }],
        }),
      );
    });

    assertStringIncludes(error.message, "which is not a Boolean");
  });

  it("refuses a user created without an attribute the schema requires", async () => {
    // Given a pool whose Schema made email required, as a CDK pool asking for
    // a required standard attribute does.
    const pool = await poolWith([{ Name: "email", Required: true }]);

    // When a user signs up without one.
    const error = await assertThrowsErrorAsync(async () => {
      await signUpWith(pool, [{ Name: "given_name", Value: "Alice" }]);
    });

    // Then it is refused, as real Cognito refuses a sign-up missing it.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "email are required by the pool's");
  });
});
