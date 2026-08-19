import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaFunction } from "../../lambda/function/sim-lambda-function.js";
import { simCfnSamFunctionTemplateFactory } from "./function/sim-cfn-sam-function-template.factory.js";

describe("SAM Globals Function defaults", () => {
  it("applies the defaults to every function in the template", async () => {
    // Given a SAM template stating defaults and two functions taking them
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "globals-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Globals: {
          Function: {
            Handler: "index.handler",
            Runtime: "nodejs22.x",
            Timeout: 10,
          },
        },
        Resources: {
          Rates: {
            Type: "AWS::Serverless::Function",
            Properties: {
              InlineCode: "exports.handler = async () => 'rates';",
            },
          },
          Quotes: {
            Type: "AWS::Serverless::Function",
            Properties: {
              InlineCode: "exports.handler = async () => 'quotes';",
            },
          },
        },
      },
    });

    // Then both functions were created with them
    for (const logicalId of ["Rates", "Quotes"]) {
      const simFunction = stack.getResource(logicalId)
        ?.simResource as SimLambdaFunction;
      assertNonNullable(simFunction);

      assertIdentical(simFunction.handlerName, "index.handler");
      assertIdentical(simFunction.runtimeName, "nodejs22.x");
      assertIdentical(simFunction.timeoutSeconds, 10);
    }
  });

  it("prefers what the function states over the default", async () => {
    // Given a function stating a timeout of its own over the default one
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "globals-override-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        globals: { Timeout: 10 },
        functionProperties: { Timeout: 30 },
      }),
    });

    // Then the function was created with its own
    const simFunction = stack.getResource("Rates")
      ?.simResource as SimLambdaFunction;
    assertNonNullable(simFunction);

    assertIdentical(simFunction.timeoutSeconds, 30);
  });

  it("merges the variables a function adds with the ones every function gets", async () => {
    // Given a function adding an environment variable to the default ones
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "globals-environment-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        globals: { Environment: { Variables: { STAGE: "test" } } },
        functionProperties: {
          Environment: { Variables: { TABLE_NAME: "rates-table" } },
        },
      }),
    });

    // Then the function has both, rather than only the one it stated
    const simFunction = stack.getResource("Rates")
      ?.simResource as SimLambdaFunction;
    assertNonNullable(simFunction);

    const variables = simFunction.environment.variables();
    assertIdentical(variables["STAGE"], "test");
    assertIdentical(variables["TABLE_NAME"], "rates-table");
  });

  it("gives the default environment to a function stating none", async () => {
    // Given a function that states no environment of its own
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "globals-only-environment-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        globals: { Environment: { Variables: { STAGE: "test" } } },
      }),
    });

    // Then it runs with the variables every function gets
    const simFunction = stack.getResource("Rates")
      ?.simResource as SimLambdaFunction;
    assertNonNullable(simFunction);

    assertIdentical(simFunction.environment.variables()["STAGE"], "test");
  });
});
