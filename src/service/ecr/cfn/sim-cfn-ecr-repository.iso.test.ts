import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const repositoryTemplate = {
  Resources: {
    OrdersRepository: {
      Type: "AWS::ECR::Repository",
      Properties: { RepositoryName: "orders" },
    },
  },
  Outputs: {
    RepositoryArn: {
      Value: { "Fn::GetAtt": ["OrdersRepository", "Arn"] },
    },
    RepositoryUri: {
      Value: { "Fn::GetAtt": ["OrdersRepository", "RepositoryUri"] },
    },
    RepositoryRef: { Value: { Ref: "OrdersRepository" } },
  },
};

describe("AWS::ECR::Repository", () => {
  it("creates a simulated repository the template declares", async () => {
    // Given a template declaring a repository, as a platform stack does.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "platform-stack",
      template: repositoryTemplate,
    });

    await stack.waitForDeployComplete();

    // Then simulated ECR holds the repository, and the Resource answers Ref
    // with its name and Fn::GetAtt with its ARN and URI.
    assertTrue(simAws.ecr().hasRepository("orders"));

    const repository = simAws.ecr().repository("orders");

    assertIdentical(stack.outputs.get("RepositoryRef")?.value, "orders");
    assertIdentical(
      stack.outputs.get("RepositoryArn")?.value,
      repository.repositoryArn,
    );
    assertIdentical(
      stack.outputs.get("RepositoryUri")?.value,
      repository.repositoryUri,
    );

    await simAws.backgroundTasksComplete();
  });

  it("adopts a repository a handler is already registered in", async () => {
    // Given a handler registered as the image in a repository before any
    // stack that declares it is deployed, which is the order these happen in:
    // the image is built long before the stack that runs it.
    const simAws = new SimAws();

    simAws
      .ecr()
      .repository("orders")
      .simulateImage({ handler: () => "held" });

    // When a template declaring that same repository is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "platform-stack",
      template: repositoryTemplate,
    });

    await stack.waitForDeployComplete();

    // Then the registered image is still there, because the repository
    // outlives the stack rather than being replaced by it.
    assertTrue(simAws.ecr().repository("orders").hasImage);

    await simAws.backgroundTasksComplete();
  });

  it("names an unnamed repository after the stack and logical ID", async () => {
    // Given a template leaving RepositoryName out, as CDK does.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "platform-stack",
      template: {
        Resources: {
          OrdersRepository: { Type: "AWS::ECR::Repository" },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the generated name is lower cased, since ECR names are.
    assertTrue(simAws.ecr().hasRepository("platform-stack-ordersrepository"));

    await simAws.backgroundTasksComplete();
  });

  it("records the image properties it has nothing to act on", async () => {
    // Given a repository declaring scanning, tag mutability and a lifecycle
    // policy, all of which are about image content.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "platform-stack",
      template: {
        Resources: {
          OrdersRepository: {
            Type: "AWS::ECR::Repository",
            Properties: {
              RepositoryName: "orders",
              ImageScanningConfiguration: { ScanOnPush: true },
              ImageTagMutability: "IMMUTABLE",
              LifecyclePolicy: { LifecyclePolicyText: "{}" },
              EmptyOnDelete: true,
              Tags: [{ Key: "team", Value: "orders" }],
              WhateverElse: "unknown to this simulation",
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the repository is created, and each property is reported as
    // ignored rather than refusing the stack.
    const resource = stack.getResource("OrdersRepository");

    assertNonNullable(resource);
    assertTrue(resource.deployed);
    assertArrayLength(resource.ignoredProperties, 6);
    assertTrue(
      resource.ignoredProperties.some((ignored) =>
        ignored.reason.includes("nothing is scanned"),
      ),
    );
    assertTrue(
      resource.ignoredProperties.some((ignored) =>
        ignored.reason.includes("not a property simulated ECR knows about"),
      ),
    );

    await simAws.backgroundTasksComplete();
  });

  it("refuses a RepositoryName that is not a string", async () => {
    // Given a template whose RepositoryName is the wrong shape.
    const simAws = new SimAws();

    // When it is deployed, then the deploy fails with the reason rather than
    // skipping the Resource: a repository under a name nothing asked for is
    // not a repository the rest of the stack could refer to.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "platform-stack",
        template: {
          Resources: {
            OrdersRepository: {
              Type: "AWS::ECR::Repository",
              Properties: { RepositoryName: 12 },
            },
          },
        },
      }),
    );

    assertStringIncludes(
      error.message,
      "Invalid sim ECR CloudFormation Resource OrdersRepository: " +
        "RepositoryName must be a string",
    );

    await simAws.backgroundTasksComplete();
  });

  it("removes an empty repository when the stack is torn down", async () => {
    // Given a deployed repository nothing has registered an image in.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "platform-stack",
      template: repositoryTemplate,
    });

    await stack.waitForDeployComplete();

    // When the Stack's Resources are torn down.
    await stack.teardown();
    await simAws.backgroundTasksComplete();

    // Then the repository goes with it, since nothing was holding on to it.
    assertFalse(simAws.ecr().hasRepository("orders"));
    assertIdentical(
      stack.getResource("OrdersRepository")?.status,
      "DELETE_COMPLETE",
    );
  });

  it("keeps a repository holding an image through a teardown", async () => {
    // Given a deployed repository a test registered a handler in, which is
    // where the handler lives for every stack that runs that image.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "platform-stack",
      template: repositoryTemplate,
    });

    await stack.waitForDeployComplete();

    simAws
      .ecr()
      .repository("orders")
      .simulateImage({ handler: () => "held" });

    // When the Stack's Resources are torn down.
    await stack.teardown();
    await simAws.backgroundTasksComplete();

    // Then the repository and its image outlive the Stack, and the deletion
    // is recorded rather than failing the teardown.
    assertTrue(simAws.ecr().repository("orders").hasImage);

    const resource = stack.getResource("OrdersRepository");

    assertTrue(resource?.deletionSkipped ?? false);
    assertNonNullable(resource?.deletionSkippedReason);
    assertStringIncludes(
      resource.deletionSkippedReason,
      "the simulated ECR repository orders holds a simulated image",
    );
  });

  it("refuses an ECR Resource type it does not simulate", async () => {
    // Given the ECR Resource factory.
    const simAws = new SimAws();
    const factory = simAws.ecr().cfnResourceFactory();

    // When a Resource type ECR has no simulation for is created or deleted.
    const created = await assertThrowsErrorAsync(async () =>
      factory.create("PullThroughCacheRule", {} as never, {} as never),
    );
    const deleted = await assertThrowsErrorAsync(async () =>
      factory.delete("PullThroughCacheRule", {} as never, {} as never),
    );

    // Then both are reported as unsupported, which the Stack records as a
    // skip rather than a failure.
    assertIdentical(
      created.message,
      "Unsupported sim ECR CloudFormation Resource PullThroughCacheRule",
    );
    assertIdentical(
      deleted.message,
      "Unsupported sim ECR CloudFormation Resource PullThroughCacheRule " +
        "deletion",
    );
  });
});
