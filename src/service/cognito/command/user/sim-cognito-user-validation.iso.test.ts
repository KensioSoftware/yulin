import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminUpdateUserAttributesCommand,
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
import {
  SimCognitoInvalidParameterException,
  SimCognitoResourceNotFoundException,
  SimCognitoUsernameExistsException,
  SimCognitoUserNotFoundException,
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

describe("sim Cognito user validation", () => {
  it("refuses a username the pool already holds", async () => {
    // Given a pool holding a user.
    const { cognito, userPoolId } = await simCognitoWithPool();
    const aliceCommand = new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: "alice",
    });

    await cognito.adminCreateUser(aliceCommand);

    // When the same username is created again.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminCreateUser(aliceCommand);
    });

    // Then it is refused, as real Cognito refuses it.
    assertInstanceOf(error, SimCognitoUsernameExistsException);
    assertStringIncludes(error.message, "already exists");
  });

  it("refuses an operation on a user the pool does not hold", async () => {
    // Given an empty pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When an unknown user is disabled.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminDisableUser(
        new AdminDisableUserCommand({
          UserPoolId: userPoolId,
          Username: "nobody",
        }),
      );
    });

    // Then it is a missing user rather than a missing resource.
    assertInstanceOf(error, SimCognitoUserNotFoundException);
    assertIdentical(error.name, "UserNotFoundException");
  });

  it("refuses a user operation on a pool that does not exist", async () => {
    // Given simulated Cognito with no pools.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a user is created in a pool that was never created.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminCreateUser(
        new AdminCreateUserCommand({
          UserPoolId: "us-east-1_aBcDeFgHi",
          Username: "alice",
        }),
      );
    });

    // Then the pool is reported missing.
    assertInstanceOf(error, SimCognitoResourceNotFoundException);
  });

  it("refuses a username Cognito would not accept", async () => {
    // Given a pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a username with a space in it is created.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminCreateUser(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: "alice adams",
        }),
      );
    });

    // Then it is refused as a validation error.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "may not hold whitespace");
  });

  it("refuses a request naming no user at all", async () => {
    // Given a pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a user is created with no username. The SDK's own types insist on
    // one, so this is the request as it reaches the simulator.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminCreateUser({ input: { UserPoolId: userPoolId } });
    });

    // Then it is refused, naming the input the request left out.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "Username is required");
  });

  it("refuses a username longer than Cognito allows", async () => {
    // Given a pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a user is created with a 129 character username.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminCreateUser(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: "a".repeat(129),
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "128");
  });

  it("refuses an AdminCreateUser input this simulation does not model", async () => {
    // Given a pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a user is created asking for the temporary password to be emailed.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminCreateUser(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: "alice",
          DesiredDeliveryMediums: ["EMAIL"],
        }),
      );
    });

    // Then it is refused rather than ignored, because nothing here delivers a
    // message.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "DesiredDeliveryMediums");
  });

  it("refuses resending an invitation nobody sent", async () => {
    // Given a pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a user is created with MessageAction RESEND.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminCreateUser(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: "alice",
          MessageAction: "RESEND",
        }),
      );
    });

    // Then it is refused. SUPPRESS is the only value this simulation models,
    // because it is the only one that changes nothing.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "MessageAction");
  });

  it("refuses passing metadata to a Lambda trigger", async () => {
    // Given a pool with a user.
    const { cognito, userPoolId } = await simCognitoWithPool();

    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // When attributes are updated with client metadata.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminUpdateUserAttributes(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: "alice",
          UserAttributes: [{ Name: "nickname", Value: "ali" }],
          ClientMetadata: { source: "test" },
        }),
      );
    });

    // Then it is refused, because Lambda triggers are not simulated.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "ClientMetadata");
  });
});
