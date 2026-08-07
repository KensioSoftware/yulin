import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

const roleArn = "arn:aws:iam::111111111111:role/GreeterRole";

/**
 * Deploy a single AWS::Lambda::Function with the given extra properties.
 */
async function deployFunction(
  simAws: SimAws,
  properties: SimCfnTemplateValueRecord,
): Promise<void> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "greeter-stack",
    template: {
      Resources: {
        GreeterFunction: {
          Type: "AWS::Lambda::Function",
          Properties: {
            FunctionName: "greeter",
            Role: roleArn,
            Handler: "index.handler",
            Runtime: "nodejs20.x",
            ...properties,
          },
        },
      },
    },
  });
  await stack.waitForDeployComplete();
}

describe("Lambda CloudFormation Function environment", () => {
  it("gives template code the variables declared in the template", async () => {
    // Given a template declaring Environment.Variables on the function.
    const simAws = new SimAws();
    await deployFunction(simAws, {
      Code: {
        ZipFile:
          "exports.handler = async () => ({" +
          " greeting: process.env.GREETING," +
          " tableName: process.env.TABLE_NAME," +
          " region: process.env.AWS_REGION });",
      },
      Environment: {
        Variables: { GREETING: "Hello", TABLE_NAME: "widgets" },
      },
    });

    // When the deployed function is invoked.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "greeter", Payload: "{}" }));

    // Then the vm runtime gave the code the declared variables alongside the
    // AWS-provided ones.
    assertNonNullable(output.Payload);
    assertObjectEquals(
      JSON.parse(Buffer.from(output.Payload).toString()) as unknown,
      {
        greeting: "Hello",
        tableName: "widgets",
        region: simAws.defaultRegionName,
      },
    );
  });

  it("gives a bound in-process handler the template's variables", async () => {
    // Given a template function backed by a real in-process handler.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: {
        Resources: {
          GreeterFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "greeter",
              Role: roleArn,
              Environment: { Variables: { TABLE_NAME: "widgets" } },
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "GreeterFunction",
          handler: () => ({ tableName: process.env["TABLE_NAME"] }),
        },
      ],
    });
    await stack.waitForDeployComplete();

    // When the deployed function is invoked.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "greeter", Payload: "{}" }));

    // Then the bound handler read the template's variables, so a debuggable
    // handler and template code behave the same way.
    assertNonNullable(output.Payload);
    assertObjectEquals(
      JSON.parse(Buffer.from(output.Payload).toString()) as unknown,
      { tableName: "widgets" },
    );
  });

  it("accepts a template Environment with no Variables", async () => {
    // Given an Environment property holding nothing.
    const simAws = new SimAws();
    await deployFunction(simAws, {
      Code: {
        ZipFile:
          "exports.handler = async () => ({ region: process.env.AWS_REGION });",
      },
      Environment: {},
    });

    // When the deployed function is invoked.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "greeter", Payload: "{}" }));

    // Then it runs with just the AWS-provided runtime variables.
    assertNonNullable(output.Payload);
    assertObjectEquals(
      JSON.parse(Buffer.from(output.Payload).toString()) as unknown,
      { region: simAws.defaultRegionName },
    );
  });

  it("fails a template whose Environment is not an object", async () => {
    // Given an Environment property that is not an object.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await deployFunction(simAws, {
        Code: { ZipFile: "exports.handler = async () => null;" },
        Environment: "TABLE_NAME=widgets",
      });
    });

    // Then it fails naming the property and the logical ID.
    assertStringIncludes(error.message, "GreeterFunction");
    assertStringIncludes(error.message, "Environment must be an object");
  });

  it("fails a template whose Variables is not an object", async () => {
    // Given a Variables property that is not an object.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await deployFunction(simAws, {
        Code: { ZipFile: "exports.handler = async () => null;" },
        Environment: { Variables: "TABLE_NAME=widgets" },
      });
    });

    // Then it fails naming the nested property.
    assertStringIncludes(
      error.message,
      "Environment.Variables must be an object",
    );
  });

  it("fails a template with a non-string variable value", async () => {
    // Given a variable whose value is a number rather than a string.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await deployFunction(simAws, {
        Code: { ZipFile: "exports.handler = async () => null;" },
        Environment: { Variables: { RETRY_COUNT: 3 } },
      });
    });

    // Then it fails naming the individual variable.
    assertStringIncludes(
      error.message,
      "Environment.Variables.RETRY_COUNT must be a string",
    );
  });
});
