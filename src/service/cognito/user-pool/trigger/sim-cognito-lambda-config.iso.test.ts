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

  it("creates a pool with the token trigger and reports it", async () => {
    // Given a simulation.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool is created with a PreTokenGeneration trigger, which is the
    // V1_0 token trigger this simulation runs.
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        LambdaConfig: { PreTokenGeneration: triggerFunctionArn },
      }),
    );

    assertNonNullable(created.UserPool?.Id);

    // Then a described pool reports it.
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: created.UserPool.Id }),
    );
    assertObjectEquals(described.UserPool?.LambdaConfig, {
      PreTokenGeneration: triggerFunctionArn,
    });
  });

  it("refuses the token trigger versions that customise an access token", async () => {
    // Given a simulation.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool asks for the V2_0 or V3_0 token trigger.
    const error = await assertThrowsErrorAsync(async () =>
      cognito.createUserPool(
        new CreateUserPoolCommand({
          PoolName: "myapp-users",
          LambdaConfig: {
            PreTokenGenerationConfig: {
              LambdaArn: triggerFunctionArn,
              LambdaVersion: "V2_0",
            },
          },
        }),
      ),
    );

    // Then it is refused, and pointed at the trigger that does run here.
    assertIdentical(error.name, "InvalidParameterException");
    assertStringIncludes(
      error.message,
      "CreateUserPool LambdaConfig PreTokenGenerationConfig is not simulated",
    );
    assertStringIncludes(
      error.message,
      "Name the function in PreTokenGeneration",
    );
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
          PreTokenGeneration: undefined,
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

    // When a pool asks for a message trigger alongside one that is simulated.
    const error = await assertThrowsErrorAsync(async () =>
      cognito.createUserPool(
        new CreateUserPoolCommand({
          PoolName: "myapp-users",
          LambdaConfig: {
            PreAuthentication: triggerFunctionArn,
            CustomMessage: otherFunctionArn,
          },
        }),
      ),
    );

    // Then the pool is refused rather than created without the trigger it
    // would never have run.
    assertIdentical(error.name, "InvalidParameterException");
    assertStringIncludes(
      error.message,
      "CreateUserPool LambdaConfig CustomMessage is not simulated",
    );
    assertStringIncludes(
      error.message,
      "writing the wording of a message the pool sends",
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
