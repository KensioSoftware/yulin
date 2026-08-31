import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaFunction } from "../../lambda/function/sim-lambda-function.js";

const ratesFunction = {
  Type: "AWS::Serverless::Function",
  Properties: {
    FunctionName: "rates",
    Handler: "index.handler",
    Runtime: "nodejs22.x",
    InlineCode: "exports.handler = async () => 'rates';",
  },
};

describe("SAM transform", () => {
  it("expands the SAM Resources of a template naming another macro too", async () => {
    // Given a template running SAM alongside a macro of its own
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "two-macro-stack",
      template: {
        Transform: ["AWS::LanguageExtensions", "AWS::Serverless-2016-10-31"],
        Resources: { Rates: ratesFunction },
      },
    });

    // Then the SAM function was expanded, since SAM is one of the macros the
    // template named
    const simFunction = stack.getResource("Rates")
      ?.simResource as SimLambdaFunction;
    assertNonNullable(simFunction);
    assertIdentical(simFunction.name, "rates");
  });

  it("records a SAM function as unsupported without the transform", async () => {
    // Given a template declaring a SAM function while naming no transform,
    // which is a template real CloudFormation has no expansion for either
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "untransformed-stack",
      template: { Resources: { Rates: ratesFunction } },
    });

    // Then the function is recorded as unsupported rather than created
    assertArrayLength(stack.skippedResources, 1);
    const skipped = stack.skippedResources[0];
    assertNonNullable(skipped);
    assertIdentical(skipped.logicalId, "Rates");
    assertIdentical(
      skipped.skippedReason,
      "Unsupported sim CloudFormation Resource service Serverless",
    );
  });

  it("records a SAM Resource type it does not expand as unsupported", async () => {
    // Given a SAM template holding a function and a state machine, which is a
    // SAM Resource type with no simulated service behind it
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "state-machine-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Resources: {
          Rates: ratesFunction,
          RatesWorkflow: {
            Type: "AWS::Serverless::StateMachine",
            Properties: { Definition: { StartAt: "Rates" } },
          },
        },
      },
    });

    // Then the function deployed, and the state machine is recorded the way
    // any Resource type nothing models is
    assertNonNullable(simAws.lambda().getSimFunctionByName("rates"));
    assertArrayLength(stack.skippedResources, 1);
    assertIdentical(stack.skippedResources[0].logicalId, "RatesWorkflow");
  });

  it("leaves a Resource it cannot read for the template to answer for", async () => {
    // Given a SAM template holding a Resource written as a string, which is a
    // Resource the expansion has no Type to read
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "malformed-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Resources: { Rates: ratesFunction, Quotes: "quotes" },
      },
    });

    // Then the function deployed, and the malformed Resource was carried
    // through the expansion for the template body to answer for
    assertNonNullable(simAws.lambda().getSimFunctionByName("rates"));
    assertArrayEmpty(stack.skippedResources);
  });
});
