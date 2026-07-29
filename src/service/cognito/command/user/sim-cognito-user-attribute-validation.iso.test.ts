import { CreateUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoAttributeType } from "../../user-pool/user/sim-cognito-user-attributes.js";

/**
 * Create a user in a fresh pool with the attributes given.
 *
 * The SDK's own types insist on a Name and a Value, so these are the requests
 * as they reach the simulator.
 */
async function createUserWith(
  attributes: readonly SimCognitoAttributeType[],
): Promise<void> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  await cognito.adminCreateUser({
    input: {
      UserPoolId: created.UserPool.Id,
      Username: "alice",
      UserAttributes: attributes,
    },
  });
}

describe("sim Cognito user attribute validation", () => {
  it("refuses an attribute the pool's schema does not hold", async () => {
    // Given a pool with the standard schema, which is the only one here.
    // When a custom attribute is set.
    const error = await assertThrowsErrorAsync(async () => {
      await createUserWith([{ Name: "custom:tenant", Value: "acme" }]);
    });

    // Then it is refused, because CreateUserPool refuses a Schema of its own
    // and so no custom attribute can exist.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "not in the pool's schema");
  });

  it("refuses a request setting a user's sub", async () => {
    // Given a pool.
    // When a user is created with a sub of its own.
    const error = await assertThrowsErrorAsync(async () => {
      await createUserWith([{ Name: "sub", Value: "chosen-by-the-caller" }]);
    });

    // Then it is refused: Cognito allocates a sub, and nothing else can.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "read-only");
  });

  it("refuses an attribute naming nothing", async () => {
    // Given a pool.
    // When an attribute arrives without a Name.
    const error = await assertThrowsErrorAsync(async () => {
      await createUserWith([{ Value: "alice@example.com" }]);
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "needs a Name");
  });

  it("refuses an attribute with no value", async () => {
    // Given a pool.
    // When an attribute arrives without a Value.
    const error = await assertThrowsErrorAsync(async () => {
      await createUserWith([{ Name: "email" }]);
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "needs a Value");
  });

  it("refuses an attribute value longer than Cognito allows", async () => {
    // Given a pool.
    // When a 2049 character value arrives.
    const error = await assertThrowsErrorAsync(async () => {
      await createUserWith([{ Name: "nickname", Value: "a".repeat(2049) }]);
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "2048");
  });

  it("accepts the standard attributes", async () => {
    // Given a pool.
    // When a user is created with standard attributes.
    await createUserWith([
      { Name: "email", Value: "alice@example.com" },
      { Name: "phone_number", Value: "+447700900000" },
      { Name: "email_verified", Value: "true" },
    ]);

    // Then they are accepted, because every pool's schema holds them.
  });
});
