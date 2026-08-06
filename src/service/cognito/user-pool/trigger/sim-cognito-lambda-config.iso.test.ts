import {
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { triggerFunctionArn } from "../../../../../test/cognito/trigger-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";

const otherFunctionArn =
  "arn:aws:lambda:eu-west-2:111111111111:function:on-sign-up";

describe("sim Cognito user pool LambdaConfig", () => {
  it("creates a pool with the triggers it simulates and reports them", async () => {
    // Given a simulation.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool is created with both authentication triggers.
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        LambdaConfig: {
          PreAuthentication: triggerFunctionArn,
          PostAuthentication: triggerFunctionArn,
        },
      }),
    );

    assertNonNullable(created.UserPool?.Id);

    // Then a described pool reports the config it was created with, so a
    // template's declaration stays visible.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: created.UserPool.Id }),
    );
    assertObjectEquals(described.UserPool?.LambdaConfig, {
      PreAuthentication: triggerFunctionArn,
      PostAuthentication: triggerFunctionArn,
    });
  });

  it("reports no LambdaConfig for a pool created without one", async () => {
    // Given a simulation.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool is created without naming any trigger.
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );

    // Then it describes without one, rather than with an empty object it never
    // asked for.
    assertUndefined(created.UserPool?.LambdaConfig);
  });

  it("ignores a trigger key the request left undefined", async () => {
    // Given a simulation.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When the config carries a key for a trigger this simulation does not
    // run, with nothing set against it, as a caller spreading an optional
    // value produces.
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        LambdaConfig: {
          PreAuthentication: triggerFunctionArn,
          PreSignUp: undefined,
        },
      }),
    );

    // Then the key that names no function is not refused, and not reported:
    // the request asked for nothing there.
    assertObjectEquals(created.UserPool?.LambdaConfig, {
      PreAuthentication: triggerFunctionArn,
    });
  });

  it("refuses a trigger this simulation does not run, naming it", async () => {
    // Given a simulation.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool asks for a sign-up trigger alongside one that is simulated.
    const error = await assertThrowsErrorAsync(async () =>
      cognito.createUserPool(
        new CreateUserPoolCommand({
          PoolName: "myapp-users",
          LambdaConfig: {
            PreAuthentication: triggerFunctionArn,
            PostConfirmation: otherFunctionArn,
          },
        }),
      ),
    );

    // Then the pool is refused rather than created without the trigger it
    // would never have run.
    assertIdentical(error.name, "InvalidParameterException");
    assertStringIncludes(
      error.message,
      "CreateUserPool LambdaConfig PostConfirmation is not simulated",
    );
    assertStringIncludes(
      error.message,
      "acting on a user confirming its own account",
    );
  });

  it("refuses a LambdaConfig key real Cognito does not have either", async () => {
    // Given a simulation.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool asks for a trigger by a name nothing recognises.
    const error = await assertThrowsErrorAsync(async () =>
      cognito.createUserPool(
        new CreateUserPoolCommand({
          PoolName: "myapp-users",
          LambdaConfig: { PreAuthentications: triggerFunctionArn } as object,
        }),
      ),
    );

    // Then it is refused in the same words, because a pool accepting it would
    // behave the same way as one accepting a real trigger it never runs.
    assertIdentical(error.name, "InvalidParameterException");
    assertStringIncludes(
      error.message,
      "CreateUserPool LambdaConfig PreAuthentications is not simulated",
    );
  });

  it("refuses a trigger that is not a function ARN", async () => {
    // Given a simulation.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool names its trigger with something that is not an ARN string.
    const error = await assertThrowsErrorAsync(async () =>
      cognito.createUserPool(
        new CreateUserPoolCommand({
          PoolName: "myapp-users",
          LambdaConfig: { PreAuthentication: 42 } as object,
        }),
      ),
    );

    // Then it says what the value has to be.
    assertIdentical(error.name, "InvalidParameterException");
    assertStringIncludes(
      error.message,
      "LambdaConfig PreAuthentication must be the ARN of the function",
    );
  });
});
