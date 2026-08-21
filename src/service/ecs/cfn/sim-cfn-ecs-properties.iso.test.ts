import { UpdateStackCommand } from "@aws-sdk/client-cloudformation";
import {
  DescribeClustersCommand,
  DescribeTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";

const appContainer = {
  Name: "app",
  Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1",
};

/**
 * A stack holding one task definition with the properties under test.
 */
function taskDefinitionTemplate(properties: object): CfnTemplateBodyRecord {
  return {
    Resources: {
      WorkerTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: "orders-worker",
          ContainerDefinitions: [appContainer],
          ...properties,
        },
      },
    },
  };
}

describe("ECS CloudFormation property reading", () => {
  it("translates the structures a task definition declares", async () => {
    // Given a template declaring the volumes, placement and platform a real
    // Fargate task definition carries, in CloudFormation's spelling.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: taskDefinitionTemplate({
        Volumes: [
          {
            Name: "state",
            EFSVolumeConfiguration: {
              FilesystemId: "fs-1",
              RootDirectory: "/",
            },
          },
        ],
        PlacementConstraints: [{ Type: "memberOf", Expression: "attribute:x" }],
        RuntimePlatform: {
          CpuArchitecture: "ARM64",
          OperatingSystemFamily: "LINUX",
        },
        EphemeralStorage: { SizeInGiB: 40 },
        ProxyConfiguration: {
          Type: "APPMESH",
          ContainerName: "envoy",
          ProxyConfigurationProperties: [{ Name: "IgnoredUID", Value: "1337" }],
        },
      }),
    });

    await stack.waitForDeployComplete();

    // When the revision is described.
    const described = await simAws
      .ecs()
      .describeTaskDefinition(
        new DescribeTaskDefinitionCommand({ taskDefinition: "orders-worker" }),
      );
    const taskDefinition = described.taskDefinition;
    assertNonNullable(taskDefinition);

    // Then each of them reads back in the SDK's spelling, including the two
    // names the ECS API does not simply lower the first letter of.
    assertObjectEquals(taskDefinition.volumes?.[0]?.efsVolumeConfiguration, {
      filesystemId: "fs-1",
      rootDirectory: "/",
    });
    assertIdentical(
      taskDefinition.placementConstraints?.[0]?.expression,
      "attribute:x",
    );
    assertIdentical(taskDefinition.runtimePlatform?.cpuArchitecture, "ARM64");
    assertIdentical(taskDefinition.ephemeralStorage?.sizeInGiB, 40);
    assertObjectEquals(taskDefinition.proxyConfiguration?.properties?.[0], {
      name: "IgnoredUID",
      value: "1337",
    });

    await simAws.backgroundTasksComplete();
  });

  it("translates a cluster's configuration", async () => {
    // Given a template declaring a cluster configuration.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersCluster: {
            Type: "AWS::ECS::Cluster",
            Properties: {
              ClusterName: "orders",
              Configuration: {
                ExecuteCommandConfiguration: { Logging: "DEFAULT" },
              },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // When the cluster is described asking for it.
    const described = await simAws.ecs().describeClusters(
      new DescribeClustersCommand({
        clusters: ["orders"],
        include: ["CONFIGURATIONS"],
      }),
    );

    // Then it reads back in the SDK's spelling.
    assertObjectEquals(described.clusters?.[0]?.configuration, {
      executeCommandConfiguration: { logging: "DEFAULT" },
    });

    await simAws.backgroundTasksComplete();
  });

  it("records a task definition property simulated ECS knows nothing of", async () => {
    // Given a template carrying a property no version of ECS has, which is
    // usually a typo in a hand-written template.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: taskDefinitionTemplate({ NetworkModes: ["awsvpc"] }),
    });

    await stack.waitForDeployComplete();

    // Then the revision is registered without it, and it is recorded.
    const ignored = stack.getResource(
      "WorkerTaskDefinition",
    )?.ignoredProperties;
    assertNonNullable(ignored);
    assertArrayLength(ignored, 1);
    assertStringIncludes(
      ignored[0].reason,
      "not a property simulated ECS knows about",
    );

    await simAws.backgroundTasksComplete();
  });

  it("records a cluster property simulated ECS knows nothing of", async () => {
    // Given the same mistake on a cluster.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersCluster: {
            Type: "AWS::ECS::Cluster",
            Properties: { ClusterName: "orders", ClusterSetting: [] },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the cluster is created without it, and it is recorded.
    const ignored = stack.getResource("OrdersCluster")?.ignoredProperties;
    assertNonNullable(ignored);
    assertArrayLength(ignored, 1);
    assertStringIncludes(
      ignored[0].reason,
      "not a property simulated ECS knows about",
    );

    await simAws.backgroundTasksComplete();
  });

  it("refuses a list of compatibilities holding something that is not one", async () => {
    // Given a template whose RequiresCompatibilities holds an object.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the entry.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: taskDefinitionTemplate({
          RequiresCompatibilities: [{ LaunchType: "FARGATE" }],
        }),
      });
    });

    assertStringIncludes(
      error.message,
      "RequiresCompatibilities entry 0 is a string",
    );
  });

  it("refuses a runtime platform that is not an object", async () => {
    // Given a template whose RuntimePlatform is a string.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the property.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: taskDefinitionTemplate({ RuntimePlatform: "ARM64" }),
      });
    });

    assertStringIncludes(error.message, "RuntimePlatform is an object");
  });

  it("refuses a container definition that is not an object", async () => {
    // Given a template whose ContainerDefinitions holds a container name
    // rather than a container.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the entry.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            WorkerTaskDefinition: {
              Type: "AWS::ECS::TaskDefinition",
              Properties: {
                Family: "orders-worker",
                ContainerDefinitions: ["app"],
              },
            },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "ContainerDefinitions entry 0 is an object",
    );
  });

  it("refuses a task definition declaring no containers, as ECS does", async () => {
    // Given a template declaring no ContainerDefinitions at all.
    const simAws = new SimAws();

    // When it is deployed, then RegisterTaskDefinition refuses it in the same
    // words it refuses an SDK caller, since the Resource is registered by
    // calling it.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            WorkerTaskDefinition: {
              Type: "AWS::ECS::TaskDefinition",
              Properties: { Family: "orders-worker" },
            },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "must declare at least one container definition",
    );
  });

  it("skips an ECS Resource type nothing creates", async () => {
    // Given a template declaring capacity, which there is none of here.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersCapacity: {
            Type: "AWS::ECS::CapacityProvider",
            Properties: { Name: "orders" },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the Resource is skipped rather than failing the stack, and the
    // teardown steps over it.
    assertArrayLength(stack.skippedResources, 1);
    assertStringIncludes(
      stack.getResource("OrdersCapacity")?.skippedReason ?? "",
      "Unsupported sim ECS CloudFormation Resource CapacityProvider",
    );

    await stack.teardown();

    assertIdentical(
      stack.getResource("OrdersCapacity")?.status,
      "DELETE_COMPLETE",
    );
  });

  it("refuses to delete a Resource type it does not create", async () => {
    // Given a Resource type simulated ECS has no factory for, which a Stack
    // would have skipped rather than created.
    const simAws = new SimAws();
    const resource = new SimCfnResource({
      logicalId: "OrdersCapacity",
      template: { Type: "AWS::ECS::CapacityProvider" },
    });

    // When its deletion is asked for directly, then it is refused, which is
    // what a teardown records as a skipped deletion.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .ecs()
        .cfnResourceFactory()
        .delete("CapacityProvider", resource, { simAws, resources: new Map() });
    });

    assertStringIncludes(
      error.message,
      "Unsupported sim ECS CloudFormation Resource CapacityProvider deletion",
    );
  });

  it("registers a new revision when the stack is updated", async () => {
    // Given a deployed task definition.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: taskDefinitionTemplate({}),
    });

    await stack.waitForDeployComplete();

    // When the stack is updated with a changed container image.
    const updated = taskDefinitionTemplate({
      ContainerDefinitions: [
        {
          Name: "app",
          Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:2",
        },
      ],
    });

    await simAws.cloudFormation().updateStack(
      new UpdateStackCommand({
        StackName: "orders-stack",
        TemplateBody: JSON.stringify(updated),
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then a second revision is registered, and the one it replaced is
    // INACTIVE, because sim CloudFormation replaces a changed Resource rather
    // than updating it in place.
    assertIdentical(simAws.ecs().taskDefinition("orders-worker").revision, 2);
    assertFalse(simAws.ecs().taskDefinition("orders-worker:1").isActive());
  });

  it("refuses a cluster name nothing holds", () => {
    // Given a simulated ECS with no clusters in it.
    const simAws = new SimAws();

    // When a cluster is looked up by name, then it is refused rather than
    // answered with nothing.
    const error = assertThrowsError(() => simAws.ecs().cluster("orders"));

    assertStringIncludes(error.message, "hold no cluster orders");
  });
});
