import { DescribeClustersCommand } from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertIdentical,
  assertFalse,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const clusterTemplate = {
  Resources: {
    OrdersCluster: {
      Type: "AWS::ECS::Cluster",
      Properties: {
        ClusterName: "orders",
        ClusterSettings: [{ Name: "containerInsights", Value: "enabled" }],
        Tags: [{ Key: "Team", Value: "payments" }],
      },
    },
  },
  Outputs: {
    ClusterRef: { Value: { Ref: "OrdersCluster" } },
    ClusterArn: { Value: { "Fn::GetAtt": ["OrdersCluster", "Arn"] } },
  },
};

describe("AWS::ECS::Cluster", () => {
  it("creates a simulated cluster the template declares", async () => {
    // Given a template declaring a cluster.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: clusterTemplate,
    });

    await stack.waitForDeployComplete();

    // Then simulated ECS holds the cluster, and the Resource answers Ref with
    // its name and Fn::GetAtt Arn with its ARN.
    const cluster = simAws.ecs().cluster("orders");

    assertTrue(cluster.isActive());
    assertIdentical(stack.outputs.get("ClusterRef")?.value, "orders");
    assertIdentical(stack.outputs.get("ClusterArn")?.value, cluster.clusterArn);

    await simAws.backgroundTasksComplete();
  });

  it("reports the settings and tags the template declared", async () => {
    // Given a deployed cluster declaring settings and tags in the
    // CloudFormation spelling of them.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: clusterTemplate,
    });

    await stack.waitForDeployComplete();

    // When it is described asking for both.
    const described = await simAws.ecs().describeClusters(
      new DescribeClustersCommand({
        clusters: ["orders"],
        include: ["SETTINGS", "TAGS"],
      }),
    );

    // Then they are reported in the spelling the SDK uses, since a template
    // upper cases the first letter of every name the API has.
    assertArrayLength(described.clusters, 1);
    assertIdentical(
      described.clusters[0].settings?.[0]?.name,
      "containerInsights",
    );
    assertIdentical(described.clusters[0].settings[0].value, "enabled");
    assertIdentical(described.clusters[0].tags?.[0]?.key, "Team");
    assertIdentical(described.clusters[0].tags[0].value, "payments");

    await simAws.backgroundTasksComplete();
  });

  it("names an unnamed cluster after the stack and logical ID", async () => {
    // Given a template declaring a cluster without a name, which real
    // CloudFormation would generate one for.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: { OrdersCluster: { Type: "AWS::ECS::Cluster" } },
        Outputs: { ClusterRef: { Value: { Ref: "OrdersCluster" } } },
      },
    });

    await stack.waitForDeployComplete();

    // Then the cluster is named from the stack and the logical ID, without the
    // random part real CloudFormation adds, so a test can predict it.
    assertIdentical(
      stack.outputs.get("ClusterRef")?.value,
      "orders-stack-OrdersCluster",
    );
    assertTrue(simAws.ecs().cluster("orders-stack-OrdersCluster").isActive());

    await simAws.backgroundTasksComplete();
  });

  it("deploys a cluster declaring capacity providers, without them", async () => {
    // Given a template declaring the capacity a cluster has, which there is
    // none of here.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersCluster: {
            Type: "AWS::ECS::Cluster",
            Properties: {
              ClusterName: "orders",
              CapacityProviders: ["FARGATE"],
              ServiceConnectDefaults: { Namespace: "orders" },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the cluster is created without them, and both are recorded so a
    // reader can see what the deployed cluster is not doing.
    assertTrue(simAws.ecs().cluster("orders").isActive());

    const ignored = stack.resources.get("OrdersCluster")?.ignoredProperties;
    assertNonNullable(ignored);
    assertArrayLength(ignored, 2);
    assertStringIncludes(
      ignored.map((property) => property.reason).join(" "),
      "there is nothing for a capacity provider to place it on",
    );

    await simAws.backgroundTasksComplete();
  });

  it("refuses a cluster name that is not a string", async () => {
    // Given a template whose ClusterName is an object rather than a name.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails, naming the Resource and
    // the property.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersCluster: {
              Type: "AWS::ECS::Cluster",
              Properties: { ClusterName: { Name: "orders" } },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "OrdersCluster");
    assertStringIncludes(error.message, "ClusterName is a string");

    await simAws.backgroundTasksComplete();
  });

  it("refuses an attribute a cluster does not have", async () => {
    // Given a template reading an attribute AWS::ECS::Cluster has no answer
    // for.
    const simAws = new SimAws();

    // When it is deployed, then the deployment fails naming the attribute.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersCluster: {
              Type: "AWS::ECS::Cluster",
              Properties: { ClusterName: "orders" },
            },
          },
          Outputs: {
            Nonsense: {
              Value: { "Fn::GetAtt": ["OrdersCluster", "Capacity"] },
            },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::ECS::Cluster attribute Capacity",
    );

    await simAws.backgroundTasksComplete();
  });

  it("marks a cluster INACTIVE when the stack is torn down", async () => {
    // Given a deployed cluster.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: clusterTemplate,
    });

    await stack.waitForDeployComplete();

    // When the stack is deleted.
    await stack.delete();
    await simAws.backgroundTasksComplete();

    // Then the cluster is INACTIVE rather than gone, so something holding its
    // ARN can still find out what became of it.
    assertFalse(simAws.ecs().cluster("orders").isActive());
  });
});
