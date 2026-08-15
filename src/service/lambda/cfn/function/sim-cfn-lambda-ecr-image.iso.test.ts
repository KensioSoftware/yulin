import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";

const accountIdTwoTwos = "222222222222" as SimAwsAccountId;

const ordersRepositoryUri =
  "888888888888.dkr.ecr.us-east-1.amazonaws.com/orders";

/**
 * A container image function, tagged the way CDK tags an image asset: with a
 * content hash, which changes whenever the image source does.
 */
function imageFunctionResource(properties: {
  readonly functionName: string;
  readonly imageUri?: SimCfnTemplateValue;
}): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::Lambda::Function",
    Properties: {
      FunctionName: properties.functionName,
      Role: "arn:aws:iam::888888888888:role/OrdersRole",
      PackageType: "Image",
      Code: {
        ImageUri: properties.imageUri ?? `${ordersRepositoryUri}:2f0e1dab4c`,
      },
    },
  };
}

async function invokePayload(
  simAws: SimAws,
  functionName: string,
): Promise<unknown> {
  const output = await simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: functionName }));

  assertIdentical(output.StatusCode, 200);
  assertUndefined(output.FunctionError);
  assertNonNullable(output.Payload);

  return JSON.parse(Buffer.from(output.Payload).toString()) as unknown;
}

describe("Lambda CloudFormation Functions from simulated ECR images", () => {
  it("creates a function from the image its repository holds", async () => {
    // Given a handler registered as the image in a repository, and a template
    // function running an image from it under some other tag.
    const simAws = new SimAws();

    simAws
      .ecr()
      .repository("orders")
      .simulateImage({ handler: () => "ran the repository image" });

    // When the template is deployed, with no binding of any kind.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({ functionName: "orders" }),
        },
      },
    });

    // Then the function is created rather than skipped for its image, and the
    // registered handler is what runs.
    const functionResource = stack.getResource("OrdersFunction");

    assertNonNullable(functionResource);
    assertUndefined(functionResource.skippedReason);
    assertIdentical(
      await invokePayload(simAws, "orders"),
      "ran the repository image",
    );

    await simAws.backgroundTasksComplete();
  });

  it("serves functions in more than one stack from one registration", async () => {
    // Given one registration, and two stacks running that image.
    const simAws = new SimAws();

    simAws
      .ecr()
      .repository("orders")
      .simulateImage({ handler: () => "one registration" });

    // When both stacks are deployed.
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-api-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({ functionName: "orders-api" }),
        },
      },
    });
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-worker-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({
            functionName: "orders-worker",
            imageUri: `${ordersRepositoryUri}:9c3b7f`,
          }),
        },
      },
    });

    // Then the handler backs the function in each stack, whatever tag each
    // one names.
    assertIdentical(
      await invokePayload(simAws, "orders-api"),
      "one registration",
    );
    assertIdentical(
      await invokePayload(simAws, "orders-worker"),
      "one registration",
    );

    await simAws.backgroundTasksComplete();
  });

  it("runs the image tagged the way the template names it", async () => {
    // Given two tags registered in one repository, as a blue/green deploy has.
    const simAws = new SimAws();

    simAws
      .ecr()
      .repository("orders")
      .simulateImage({ imageTag: "blue", handler: () => "blue image" })
      .simulateImage({ imageTag: "green", handler: () => "green image" });

    // When a template names one of them.
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({
            functionName: "orders",
            imageUri: `${ordersRepositoryUri}:blue`,
          }),
        },
      },
    });

    // Then that tag's image is the one the function runs.
    assertIdentical(await invokePayload(simAws, "orders"), "blue image");

    await simAws.backgroundTasksComplete();
  });

  it("lets a deploy-time binding back a function the repository could", async () => {
    // Given a registered repository image and a binding that both match one
    // function.
    const simAws = new SimAws();

    simAws
      .ecr()
      .repository("orders")
      .simulateImage({ handler: () => "repository image" });

    // When the template is deployed with the binding.
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({ functionName: "orders" }),
        },
      },
      bindings: [
        { logicalId: "OrdersFunction", handler: () => "deploy binding" },
      ],
    });

    // Then the binding is what backs the function, because it is the more
    // specific thing to have said: it is about this deploy, where the
    // repository is a standing statement about the image.
    assertIdentical(await invokePayload(simAws, "orders"), "deploy binding");

    await simAws.backgroundTasksComplete();
  });

  it("skips an image whose repository nothing holds", async () => {
    // Given a simulation with no repository of that name.
    const simAws = new SimAws();

    // When a template running an image from it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({ functionName: "orders" }),
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the function is skipped, and the reason says the repository is
    // missing rather than its image.
    const functionResource = stack.getResource("OrdersFunction");

    assertNonNullable(functionResource);
    assertTrue(functionResource.skipped);
    assertNonNullable(functionResource.skippedReason);
    assertStringIncludes(
      functionResource.skippedReason,
      "no simulated ECR repository holds the container image",
    );
    assertStringIncludes(
      functionResource.skippedReason,
      "register one as the image in a simulated ECR repository",
    );

    await simAws.backgroundTasksComplete();
  });

  it("skips an image whose repository holds no image", async () => {
    // Given a repository made, as a platform stack declaring it makes one,
    // with no handler registered in it.
    const simAws = new SimAws();

    simAws.ecr().repository("orders");

    // When a template running an image from it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({ functionName: "orders" }),
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the function is skipped, and the reason says the repository is
    // there and its image is not, which is the other half of the answer.
    const functionResource = stack.getResource("OrdersFunction");

    assertNonNullable(functionResource);
    assertTrue(functionResource.skipped);
    assertNonNullable(functionResource.skippedReason);
    assertStringIncludes(
      functionResource.skippedReason,
      `the simulated ECR repository ${ordersRepositoryUri} holds no image`,
    );

    await simAws.backgroundTasksComplete();
  });

  it("creates a function from a repository in another account", async () => {
    // Given an image registered in another account's registry, as a shared
    // platform account holds one.
    const simAws = new SimAws();
    const repository = simAws
      .accountRegionScope(accountIdTwoTwos)
      .ecr()
      .repository("orders");

    repository.simulateImage({ handler: () => "another account's image" });

    // When a function in the default account runs that image.
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({
            functionName: "orders",
            imageUri: `${repository.repositoryUri}:latest`,
          }),
        },
      },
    });

    // Then it is created from that account's image, as real Lambda pulls
    // across accounts.
    assertIdentical(
      await invokePayload(simAws, "orders"),
      "another account's image",
    );

    await simAws.backgroundTasksComplete();
  });
});
