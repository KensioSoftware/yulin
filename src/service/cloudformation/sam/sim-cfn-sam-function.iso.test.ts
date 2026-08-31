import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimIamRole } from "../../iam/role/sim-iam-role.js";
import type { SimLambdaFunction } from "../../lambda/function/sim-lambda-function.js";

describe("SAM Serverless Function expansion", () => {
  it("deploys a SAM function as an invokable Lambda function", async () => {
    // Given a SAM template declaring one function with its source inline
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Resources: {
          Rates: {
            Type: "AWS::Serverless::Function",
            Properties: {
              FunctionName: "rates",
              Handler: "index.handler",
              Runtime: "nodejs22.x",
              InlineCode: "exports.handler = async () => 'from SAM';",
            },
          },
        },
      },
    });

    // Then the SAM logical ID is a simulated Lambda function
    const functionResource = stack.getResource("Rates");
    assertNonNullable(functionResource);
    assertIdentical(functionResource.type, "AWS::Lambda::Function");
    assertIdentical(
      functionResource.simResource,
      simAws.lambda().getSimFunctionByName("rates"),
    );

    // And nothing about the template was left unsupported
    assertArrayEmpty(stack.skippedResources);

    // And the function runs the source the template held inline
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "rates" }));

    assertIdentical(output.StatusCode, 200);
    assertNonNullable(output.Payload);
    assertIdentical(
      JSON.parse(Buffer.from(output.Payload).toString()),
      "from SAM",
    );
  });

  it("carries the function configuration onto the Lambda function", async () => {
    // Given a SAM function stating every property the expansion carries
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-config-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Resources: {
          Rates: {
            Type: "AWS::Serverless::Function",
            Properties: {
              FunctionName: "configured-rates",
              Handler: "rates.handler",
              Runtime: "nodejs22.x",
              Timeout: 42,
              MemorySize: 512,
              Description: "Exchange rates",
              Environment: { Variables: { TABLE_NAME: "rates-table" } },
              InlineCode: "exports.handler = async () => 'rates';",
            },
          },
        },
      },
    });

    // Then the simulated function was created with what the SAM Resource said
    const simFunction = stack.getResource("Rates")
      ?.simResource as SimLambdaFunction;
    assertNonNullable(simFunction);

    assertIdentical(simFunction.name, "configured-rates");
    assertIdentical(simFunction.handlerName, "rates.handler");
    assertIdentical(simFunction.runtimeName, "nodejs22.x");
    assertIdentical(simFunction.timeoutSeconds, 42);
    assertIdentical(simFunction.memorySizeMb, 512);
    assertIdentical(simFunction.description, "Exchange rates");
    assertIdentical(
      simFunction.environment.variables()["TABLE_NAME"],
      "rates-table",
    );
  });

  it("names an unnamed SAM function after the stack and the SAM logical ID", async () => {
    // Given a SAM function that names itself nothing
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "unnamed-rates-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Resources: {
          Rates: {
            Type: "AWS::Serverless::Function",
            Properties: {
              Handler: "index.handler",
              Runtime: "nodejs22.x",
              InlineCode: "exports.handler = async () => 'unnamed';",
            },
          },
        },
      },
    });

    // Then the function is named after the stack and the SAM logical ID, as
    // CloudFormation names an unnamed function
    const functionName = stack.getResource("Rates")?.refValue;

    assertTypeString(functionName);
    assertStringStartsWith(functionName, "unnamed-rates-stack-Rates-");
    assertNonNullable(simAws.lambda().getSimFunctionByName(functionName));
  });

  it("answers Ref and Fn::GetAtt against the SAM logical ID", async () => {
    // Given a SAM template whose Outputs read the function by its SAM name
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-outputs-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Resources: {
          Rates: {
            Type: "AWS::Serverless::Function",
            Properties: {
              FunctionName: "referenced-rates",
              Handler: "index.handler",
              Runtime: "nodejs22.x",
              InlineCode: "exports.handler = async () => 'rates';",
            },
          },
        },
        Outputs: {
          FunctionName: { Value: { Ref: "Rates" } },
          FunctionArn: { Value: { "Fn::GetAtt": ["Rates", "Arn"] } },
        },
      },
    });

    // Then they answer what they answer for the function it expanded into
    const simFunction = stack.getResource("Rates")
      ?.simResource as SimLambdaFunction;
    assertNonNullable(simFunction);

    assertIdentical(stack.output("FunctionName"), "referenced-rates");
    assertIdentical(stack.output("FunctionArn"), simFunction.arn);
  });

  it("backs the function with a handler bound by logical ID", async () => {
    // Given a SAM function whose CodeUri names a directory nothing reads
    const simAws = new SimAws();
    const observedEvents: unknown[] = [];

    // When it is deployed with a handler bound to its logical ID
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "bound-rates-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Resources: {
          Rates: {
            Type: "AWS::Serverless::Function",
            Properties: {
              FunctionName: "bound-rates",
              CodeUri: "src/rates/",
              Handler: "index.handler",
              Runtime: "nodejs22.x",
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "Rates",
          handler: (event: { currency: string }) => {
            observedEvents.push(event);
            return `rate for ${event.currency}`;
          },
        },
      ],
    });

    // Then invoking the function runs the bound handler in-process
    const output = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "bound-rates",
        Payload: JSON.stringify({ currency: "GBP" }),
      }),
    );

    assertNonNullable(output.Payload);
    assertIdentical(
      JSON.parse(Buffer.from(output.Payload).toString()),
      "rate for GBP",
    );
    assertArrayLength(observedEvents, 1);
    assertArrayEmpty(stack.skippedResources);
  });

  it("runs the function as the execution Role it was expanded with", async () => {
    // Given a SAM function that names no Role of its own
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "rates-role-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Resources: {
          Rates: {
            Type: "AWS::Serverless::Function",
            Properties: {
              FunctionName: "roled-rates",
              Handler: "index.handler",
              Runtime: "nodejs22.x",
              InlineCode: "exports.handler = async () => 'rates';",
            },
          },
        },
      },
    });

    // Then the Stack holds an execution Role named after the function
    const roleResource = stack.getResource("RatesRole");
    assertNonNullable(roleResource);
    assertIdentical(roleResource.type, "AWS::IAM::Role");

    // And the function runs as it
    const role = roleResource.simResource as SimIamRole;
    const simFunction = stack.getResource("Rates")
      ?.simResource as SimLambdaFunction;
    assertNonNullable(role);
    assertNonNullable(simFunction);
    assertIdentical(simFunction.roleArn, role.arn);
  });

  it("conditions the function and its Role the way the template did", async () => {
    // Given a SAM function the template conditions out
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "conditioned-rates-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Parameters: { Stage: { Type: "String" } },
        Conditions: {
          IsProduction: { "Fn::Equals": [{ Ref: "Stage" }, "production"] },
        },
        Resources: {
          Rates: {
            Type: "AWS::Serverless::Function",
            Condition: "IsProduction",
            Properties: {
              FunctionName: "conditioned-rates",
              Handler: "index.handler",
              Runtime: "nodejs22.x",
              InlineCode: "exports.handler = async () => 'rates';",
            },
          },
        },
      },
      parameters: { Stage: "test" },
    });

    // Then neither the function nor the Role it would have run as was created
    assertUndefined(stack.getResource("Rates"));
    assertUndefined(stack.getResource("RatesRole"));
    assertUndefined(simAws.lambda().getSimFunctionByName("conditioned-rates"));
  });

  it("carries what the SAM Resource depends on onto the function", async () => {
    // Given a SAM function and a Bucket each declaring they need the other
    // first, which the Stack can only see as a cycle if the function kept what
    // the SAM Resource depended on
    const simAws = new SimAws();

    // When it is deployed
    const deployment = simAws.cloudFormation().deployTemplate({
      stackName: "circular-rates-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Resources: {
          Rates: {
            Type: "AWS::Serverless::Function",
            DependsOn: "RatesBucket",
            Properties: {
              FunctionName: "circular-rates",
              Handler: "index.handler",
              Runtime: "nodejs22.x",
              InlineCode: "exports.handler = async () => 'rates';",
            },
          },
          RatesBucket: {
            Type: "AWS::S3::Bucket",
            DependsOn: "Rates",
            Properties: { BucketName: "rates-bucket" },
          },
        },
      },
    });

    // Then the Stack refuses the dependencies it cannot resolve
    const error = await assertThrowsErrorAsync(async () => deployment);

    assertStringIncludes(
      error.message,
      "Could not resolve simulated CloudFormation Resource dependencies",
    );
  });

  it("expands a function that states nothing beyond the defaults", async () => {
    // Given a SAM function taking everything it has from Globals
    const simAws = new SimAws();

    // When it is deployed with a handler bound to it
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "defaulted-rates-stack",
      template: {
        Transform: "AWS::Serverless-2016-10-31",
        Globals: {
          Function: { Handler: "index.handler", Runtime: "nodejs22.x" },
        },
        Resources: { Rates: { Type: "AWS::Serverless::Function" } },
      },
      bindings: [{ logicalId: "Rates", handler: () => "defaulted rates" }],
    });

    // Then the function was created from the defaults alone
    const functionName = stack.getResource("Rates")?.refValue;

    assertTypeString(functionName);

    const simFunction = simAws.lambda().getSimFunctionByName(functionName);
    assertNonNullable(simFunction);
    assertIdentical(simFunction.runtimeName, "nodejs22.x");
  });
});
