import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

const ordersImageUri =
  "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders:latest";

/**
 * What CDK synthesizes for a DockerImageFunction: PackageType and an image
 * URI, with no Runtime and no Handler.
 */
const imageFunctionTemplate = {
  Resources: {
    OrdersFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        PackageType: "Image",
        Code: { ImageUri: ordersImageUri },
      },
    },
  },
};

describe("Lambda CloudFormation container image Functions", () => {
  it("skips a container image function with no bound handler", async () => {
    // Given a template with a container image function, as CDK synthesizes
    // for a DockerImageFunction.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: imageFunctionTemplate,
    });

    // Then the Resource is skipped rather than failing the stack, naming the
    // image it could not run.
    const functionResource = stack.getResource("OrdersFunction");

    assertNonNullable(functionResource);
    assertTrue(functionResource.skipped);
    assertNonNullable(functionResource.skippedReason);
    assertStringIncludes(functionResource.skippedReason, ordersImageUri);
    assertStringIncludes(functionResource.skippedReason, "Bind a real");

    // And no simulated function is created for it.
    assertUndefined(simAws.lambda().getSimFunctionByName("orders"));

    await simAws.backgroundTasksComplete();
  });

  it("deploys the rest of a stack around a skipped image function", async () => {
    // Given an image function alongside another Resource in the same stack.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          ...imageFunctionTemplate.Resources,
          OrdersBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "orders-uploads" },
          },
        },
      },
    });

    // Then the skipped function does not take the stack down with it.
    await stack.waitForDeployComplete();

    assertNonNullable(simAws.s3().getSimBucketByName("orders-uploads"));

    await simAws.backgroundTasksComplete();
  });

  it("deploys a container image function when a handler is bound", async () => {
    // Given the same image function, with a real in-process handler bound to
    // it, which replaces the image wholesale.
    const simAws = new SimAws();

    // When the template is deployed with the binding.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: imageFunctionTemplate,
      bindings: [
        {
          logicalId: "OrdersFunction",
          handler: (): { source: string } => ({ source: "bound-handler" }),
        },
      ],
    });

    // Then the Resource deploys, because the bound handler is what runs.
    const functionResource = stack.getResource("OrdersFunction");

    assertNonNullable(functionResource);
    assertUndefined(functionResource.skippedReason);

    const invokeOutput = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "orders" }));

    assertIdentical(invokeOutput.StatusCode, 200);
    assertUndefined(invokeOutput.FunctionError);
    assertNonNullable(invokeOutput.Payload);
    assertStringIncludes(
      Buffer.from(invokeOutput.Payload).toString(),
      "bound-handler",
    );

    await simAws.backgroundTasksComplete();
  });

  it("skips a function declaring an image URI without PackageType", async () => {
    // Given a hand-written template naming an image but leaving PackageType
    // out, which CDK never does but a template author can.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "orders",
              Role: "arn:aws:iam::111111111111:role/OrdersRole",
              Code: { ImageUri: ordersImageUri },
            },
          },
        },
      },
    });

    // Then it is skipped in the same way, naming the image.
    const functionResource = stack.getResource("OrdersFunction");

    assertNonNullable(functionResource);
    assertTrue(functionResource.skipped);
    assertNonNullable(functionResource.skippedReason);
    assertStringIncludes(functionResource.skippedReason, ordersImageUri);

    await simAws.backgroundTasksComplete();
  });

  it("skips a function packaged as an image that names no image", async () => {
    // Given PackageType Image with no Code at all, which is invalid on real
    // AWS but must not fail the stack here.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "orders",
              Role: "arn:aws:iam::111111111111:role/OrdersRole",
              PackageType: "Image",
            },
          },
        },
      },
    });

    // Then it is skipped with a reason that still reads properly.
    const functionResource = stack.getResource("OrdersFunction");

    assertNonNullable(functionResource);
    assertTrue(functionResource.skipped);
    assertNonNullable(functionResource.skippedReason);
    assertStringIncludes(
      functionResource.skippedReason,
      "cannot run container images",
    );

    await simAws.backgroundTasksComplete();
  });

  it("ignores ImageConfig on a bound container image function", async () => {
    // Given an image function declaring ImageConfig, which has no meaning for
    // a bound in-process handler.
    const simAws = new SimAws();

    // When the template is deployed with a binding.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "orders",
              Role: "arn:aws:iam::111111111111:role/OrdersRole",
              PackageType: "Image",
              Code: { ImageUri: ordersImageUri },
              ImageConfig: {
                Command: ["index.handler"],
                EntryPoint: ["/lambda-entrypoint.sh"],
                WorkingDirectory: "/var/task",
              },
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "OrdersFunction",
          handler: (): string => "bound-handler",
        },
      ],
    });

    // Then ImageConfig is ignored rather than refused, and the function runs.
    const functionResource = stack.getResource("OrdersFunction");

    assertNonNullable(functionResource);
    assertUndefined(functionResource.skippedReason);

    const invokeOutput = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "orders" }));

    assertIdentical(invokeOutput.StatusCode, 200);
    assertUndefined(invokeOutput.FunctionError);

    await simAws.backgroundTasksComplete();
  });
});
