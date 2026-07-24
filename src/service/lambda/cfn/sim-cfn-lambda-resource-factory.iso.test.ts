import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCloudFormationResourceCreateContext } from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import {
  DEFAULT_SIM_LAMBDA_MEMORY_SIZE_MB,
  DEFAULT_SIM_LAMBDA_TIMEOUT_SECONDS,
  SimLambdaFunction,
} from "../function/sim-lambda-function.js";
import { SimLambdaCloudFormationResourceFactory } from "./sim-cfn-lambda-resource-factory.js";

const accountRegionScope: SimAwsAccountRegionScope = {
  accountId: "111111111111" as SimAwsAccountId,
  regionName: "eu-west-2",
};

describe("SimLambdaCloudFormationResourceFactory", () => {
  it("creates a Lambda function from inline ZipFile source", async () => {
    // Given a Lambda CloudFormation Resource factory and a Function resource
    // with inline ZipFile source, as real CloudFormation supports for small
    // functions.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    const resource = new SimCfnResource({
      accountRegionScope,
      logicalId: "GreeterFunction",
      template: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "greeter",
          Role: "arn:aws:iam::111111111111:role/GreeterRole",
          Code: {
            ZipFile:
              "exports.handler = async (event) => 'Hello ' + event.name;",
          },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
          Description: "Greets by name",
          Timeout: 10,
          MemorySize: 256,
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimLambdaCloudFormationResourceFactory(simLambda);

    // When the Function resource type is created.
    const created = await factory.create("Function", resource, context);

    // Then the named function is created and returned with its configuration.
    const storedFunction = simLambda.getSimFunctionByName("greeter");

    assertNonNullable(storedFunction);
    assertIdentical(created, storedFunction);
    assertIdentical(
      storedFunction.roleArn,
      "arn:aws:iam::111111111111:role/GreeterRole",
    );
    assertIdentical(storedFunction.handlerName, "index.handler");
    assertIdentical(storedFunction.runtimeName, "nodejs20.x");
    assertIdentical(storedFunction.description, "Greets by name");
    assertIdentical(storedFunction.timeoutSeconds, 10);
    assertIdentical(storedFunction.memorySizeMb, 256);

    // And the inline source code runs in the simulated runtime.
    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "greeter",
        Payload: JSON.stringify({ name: "Yulin" }),
      }),
    );

    assertIdentical(output.StatusCode, 200);
    assertNonNullable(output.Payload);
    assertIdentical(
      JSON.parse(Buffer.from(output.Payload).toString()),
      "Hello Yulin",
    );

    await simAws.backgroundTasksComplete();
  });

  it("defaults the function name and configuration values", async () => {
    // Given a Function resource without FunctionName, Timeout or MemorySize.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    const resource = new SimCfnResource({
      accountRegionScope,
      logicalId: "DefaultNamedFunction",
      template: {
        Type: "AWS::Lambda::Function",
        Properties: {
          Role: "arn:aws:iam::111111111111:role/DefaultRole",
          Code: {
            ZipFile: "exports.handler = async () => 'ok';",
          },
          Handler: "index.handler",
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimLambdaCloudFormationResourceFactory(simLambda);

    // When the Function resource type is created.
    const created = await factory.create("Function", resource, context);

    // Then a function named from the logical ID is created with AWS-like
    // default configuration.
    const storedFunction = simLambda.getSimFunctionByName(
      "DefaultNamedFunction",
    );

    assertNonNullable(storedFunction);
    assertIdentical(created, storedFunction);
    assertIdentical(
      storedFunction.timeoutSeconds,
      DEFAULT_SIM_LAMBDA_TIMEOUT_SECONDS,
    );
    assertIdentical(
      storedFunction.memorySizeMb,
      DEFAULT_SIM_LAMBDA_MEMORY_SIZE_MB,
    );

    await simAws.backgroundTasksComplete();
  });

  it("returns a SimLambdaFunction as the backing sim resource", async () => {
    // Given a Function resource created through the factory.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    const resource = new SimCfnResource({
      accountRegionScope,
      logicalId: "TypedFunction",
      template: {
        Type: "AWS::Lambda::Function",
        Properties: {
          Role: "arn:aws:iam::111111111111:role/TypedRole",
          Code: {
            ZipFile: "exports.handler = async () => 'typed';",
          },
          Handler: "index.handler",
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimLambdaCloudFormationResourceFactory(simLambda);

    // When the Function resource type is created.
    const created = await factory.create("Function", resource, context);

    // Then the returned sim resource is the simulated Lambda function model.
    assertInstanceOf(created, SimLambdaFunction);

    await simAws.backgroundTasksComplete();
  });

  it("rejects unsupported Lambda resource types", async () => {
    // Given a Lambda CloudFormation Resource factory and an unsupported
    // Resource type.
    const simAws = new SimAws();
    const simLambda = simAws.lambda();
    const resource = new SimCfnResource({
      accountRegionScope,
      logicalId: "ExampleAlias",
      template: {
        Type: "AWS::Lambda::Alias",
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimLambdaCloudFormationResourceFactory(simLambda);

    // When creation is attempted, then it rejects with an unsupported Resource
    // type error.
    const error = await assertThrowsErrorAsync(async () =>
      factory.create("Alias", resource, context),
    );

    // Then the unsupported Resource type name is included for diagnosis.
    assertIdentical(
      error.message,
      "Unsupported sim Lambda CloudFormation Resource Alias",
    );
  });
});
