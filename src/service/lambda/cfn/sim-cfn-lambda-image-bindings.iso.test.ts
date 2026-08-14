import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../cloudformation/template/value/sim-cfn-template-value.js";

const ordersRepository = "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders";

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
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      PackageType: "Image",
      Code: {
        ImageUri: properties.imageUri ?? `${ordersRepository}:2f0e1dab4c`,
      },
    },
  };
}

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
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

  return parsePayload(output.Payload);
}

describe("Lambda CloudFormation Function image repository bindings", () => {
  it("binds a real in-process handler by container image repository", async () => {
    // Given a container image function whose image tag is a content hash, and
    // a binding naming only the repository it comes from.
    const simAws = new SimAws();

    // When the template is deployed with the binding.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({ functionName: "orders" }),
        },
      },
      bindings: [
        {
          imageRepository: ordersRepository,
          handler: () => "bound by image repository",
        },
      ],
    });

    // Then the function is created rather than skipped for its image, and
    // the bound handler is what runs.
    const functionResource = stack.getResource("OrdersFunction");

    assertNonNullable(functionResource);
    assertUndefined(functionResource.skippedReason);
    assertIdentical(
      await invokePayload(simAws, "orders"),
      "bound by image repository",
    );

    await simAws.backgroundTasksComplete();
  });

  it("matches an image URI built from a stack parameter", async () => {
    // Given an image URI assembled by Fn::Sub from pseudo parameters and a
    // build tag passed in as a stack parameter, as a pipeline-built image is.
    const simAws = new SimAws();
    const repository =
      `${simAws.defaultAccountId}.dkr.ecr.` +
      `${simAws.defaultRegionName}.amazonaws.com/orders`;

    // When the template is deployed with a binding naming the repository.
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Parameters: {
          ImageTag: { Type: "String" },
        },
        Resources: {
          OrdersFunction: imageFunctionResource({
            functionName: "orders",
            imageUri: {
              "Fn::Sub":
                // eslint-disable-next-line no-template-curly-in-string
                "${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/orders:${ImageTag}",
            },
          }),
        },
      },
      parameters: { ImageTag: "build-4172" },
      bindings: [
        {
          imageRepository: repository,
          handler: () => "bound by resolved image repository",
        },
      ],
    });

    // Then the resolved image URI is what the binding matched.
    assertIdentical(
      await invokePayload(simAws, "orders"),
      "bound by resolved image repository",
    );

    await simAws.backgroundTasksComplete();
  });

  it("matches functions in more than one stack", async () => {
    // Given one binding for a repository two stacks both run a function from.
    const simAws = new SimAws();
    const bindings = [
      {
        imageRepository: ordersRepository,
        handler: () => "bound in both stacks",
      },
    ];

    // When both stacks are deployed with the same binding.
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-api-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({ functionName: "orders-api" }),
        },
      },
      bindings,
    });
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-worker-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({
            functionName: "orders-worker",
            imageUri: `${ordersRepository}:9c3b7f`,
          }),
        },
      },
      bindings,
    });

    // Then the handler backs the function in each stack.
    assertIdentical(
      await invokePayload(simAws, "orders-api"),
      "bound in both stacks",
    );
    assertIdentical(
      await invokePayload(simAws, "orders-worker"),
      "bound in both stacks",
    );

    await simAws.backgroundTasksComplete();
  });

  it("rejects an image repository binding that matches nothing", async () => {
    // Given a binding for a repository no function in the template runs.
    const simAws = new SimAws();

    // When the template is deployed, then binding validation rejects it with
    // the unmatched repository for diagnosis.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersFunction: imageFunctionResource({ functionName: "orders" }),
          },
        },
        bindings: [
          {
            imageRepository:
              "111111111111.dkr.ecr.eu-west-2.amazonaws.com/invoices",
            handler: () => "never runs",
          },
        ],
      }),
    );

    assertIdentical(
      error.message,
      "Invalid sim CloudFormation executable binding in Stack orders-stack: " +
        'imageRepository "111111111111.dkr.ecr.eu-west-2.amazonaws.com/invoices" ' +
        "does not resolve to a Resource in the Stack",
    );

    await simAws.backgroundTasksComplete();
  });

  it("backs a function with the first binding that matches it", async () => {
    // Given a function both an image repository binding and a logicalId
    // binding could back, listed in one order and then the other.
    const simAws = new SimAws();
    const imageBinding = {
      imageRepository: ordersRepository,
      handler: () => "bound by image repository",
    };
    const logicalIdBinding = {
      logicalId: "OrdersFunction",
      handler: () => "bound by logical id",
    };
    const template = {
      Resources: {
        OrdersFunction: imageFunctionResource({ functionName: "orders" }),
      },
    };

    // When each order is deployed, into its own simulated AWS so the function
    // name is free both times.
    await simAws.cloudFormation().deployTemplate({
      stackName: "image-first-stack",
      template,
      bindings: [imageBinding, logicalIdBinding],
    });

    const reversedSimAws = new SimAws();

    await reversedSimAws.cloudFormation().deployTemplate({
      stackName: "logical-id-first-stack",
      template,
      bindings: [logicalIdBinding, imageBinding],
    });

    // Then the binding listed first is the one that backs the function.
    assertIdentical(
      await invokePayload(simAws, "orders"),
      "bound by image repository",
    );
    assertIdentical(
      await invokePayload(reversedSimAws, "orders"),
      "bound by logical id",
    );

    await simAws.backgroundTasksComplete();
    await reversedSimAws.backgroundTasksComplete();
  });

  it("leaves a function from another repository skipped", async () => {
    // Given two image functions from different repositories, with a binding
    // for one of them.
    const simAws = new SimAws();

    // When the template is deployed with that binding.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: imageFunctionResource({ functionName: "orders" }),
          InvoicesFunction: imageFunctionResource({
            functionName: "invoices",
            imageUri:
              "111111111111.dkr.ecr.eu-west-2.amazonaws.com/invoices:latest",
          }),
        },
      },
      bindings: [
        {
          imageRepository: ordersRepository,
          handler: () => "bound by image repository",
        },
      ],
    });

    await stack.waitForDeployComplete();

    // Then the unmatched function is skipped for its image, as an unbound
    // image function is, while the matched one runs its handler.
    const invoicesResource = stack.getResource("InvoicesFunction");

    assertNonNullable(invoicesResource);
    assertTrue(invoicesResource.skipped);
    assertNonNullable(invoicesResource.skippedReason);
    assertStringIncludes(
      invoicesResource.skippedReason,
      "cannot run the container image",
    );
    assertIdentical(
      await invokePayload(simAws, "orders"),
      "bound by image repository",
    );

    await simAws.backgroundTasksComplete();
  });
});
