import {
  AdminCreateUserCommand,
  CreateUserPoolCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface SimCognitoWithUsers {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

/**
 * A pool holding alice, bob and carol, created in that order.
 */
async function simCognitoWithUsers(): Promise<SimCognitoWithUsers> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  const userPoolId = created.UserPool.Id;

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
  );
  await cognito.adminCreateUser(
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "bob" }),
  );
  await cognito.adminCreateUser(
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "carol" }),
  );

  return { cognito, userPoolId };
}

describe("sim Cognito ListUsers", () => {
  it("lists the users of one pool", async () => {
    // Given a pool with three users.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    // When its users are listed.
    const listed = await cognito.listUsers(
      new ListUsersCommand({ UserPoolId: userPoolId }),
    );

    // Then all three come back, with the status each was created in.
    assertArrayEquals(
      (listed.Users ?? []).map((user) => user.Username),
      ["alice", "bob", "carol"],
    );
    assertIdentical(listed.Users?.[0]?.UserStatus, "FORCE_CHANGE_PASSWORD");
    assertUndefined(listed.PaginationToken);
  });

  it("pages the listing by Limit and PaginationToken", async () => {
    // Given a pool with three users.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    // When two are asked for, then the rest.
    const firstPage = await cognito.listUsers(
      new ListUsersCommand({ UserPoolId: userPoolId, Limit: 2 }),
    );
    const secondPage = await cognito.listUsers(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Limit: 2,
        PaginationToken: firstPage.PaginationToken,
      }),
    );

    // Then the pages carry the users between them, and the last one ends the
    // listing.
    assertArrayEquals(
      (firstPage.Users ?? []).map((user) => user.Username),
      ["alice", "bob"],
    );
    assertArrayEquals(
      (secondPage.Users ?? []).map((user) => user.Username),
      ["carol"],
    );
    assertUndefined(secondPage.PaginationToken);
  });

  it("refuses a Limit outside the range Cognito allows", async () => {
    // Given a pool with three users.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    // When more than sixty users are asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.listUsers(
        new ListUsersCommand({ UserPoolId: userPoolId, Limit: 61 }),
      );
    });

    // Then it is refused, naming the input the request used.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "Limit must be a whole number");
  });

  it("refuses a PaginationToken it did not issue", async () => {
    // Given a pool with three users.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    // When a made up token is followed.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.listUsers(
        new ListUsersCommand({
          UserPoolId: userPoolId,
          PaginationToken: "somewhere-else",
        }),
      );
    });

    // Then it is refused rather than starting again from the beginning.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "PaginationToken");
  });

  it("refuses a Filter rather than ignoring it", async () => {
    // Given a pool with three users.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    // When the listing is filtered by email.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.listUsers(
        new ListUsersCommand({
          UserPoolId: userPoolId,
          Filter: 'email = "alice@example.com"',
        }),
      );
    });

    // Then it is refused, because a dropped filter answers with the wrong
    // users rather than with an error.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "Filter is not simulated");
  });

  it("refuses returning only some of each user's attributes", async () => {
    // Given a pool with three users.
    const { cognito, userPoolId } = await simCognitoWithUsers();

    // When only the email is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.listUsers(
        new ListUsersCommand({
          UserPoolId: userPoolId,
          AttributesToGet: ["email"],
        }),
      );
    });

    // Then it is refused rather than answered with every attribute.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "AttributesToGet");
  });
});
