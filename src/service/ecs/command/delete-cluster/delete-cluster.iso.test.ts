import {
  CreateClusterCommand,
  DeleteClusterCommand,
  DescribeClustersCommand,
  ListClustersCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimEcsClusterNotFoundException } from "../../error/sim-ecs.error.js";
import type { SimEcs } from "../../sim-ecs.js";

async function simEcsWithCluster(): Promise<SimEcs> {
  const simEcs = new SimAws().ecs();
  await simEcs.createCluster(
    new CreateClusterCommand({ clusterName: "services" }),
  );

  return simEcs;
}

describe("ECS DeleteClusterCommand", () => {
  it("marks a deleted cluster inactive and leaves it describable", async () => {
    // Given a cluster.
    const simEcs = await simEcsWithCluster();

    // When it is deleted.
    const deleted = await simEcs.deleteCluster(
      new DeleteClusterCommand({ cluster: "services" }),
    );

    // Then it is reported as INACTIVE, and it is still describable.
    assertIdentical(deleted.cluster?.status, "INACTIVE");

    const described = await simEcs.describeClusters(
      new DescribeClustersCommand({ clusters: ["services"] }),
    );

    assertArrayLength(described.clusters, 1);
    assertIdentical(described.clusters[0].status, "INACTIVE");
  });

  it("stops a deleted cluster being listed", async () => {
    // Given a cluster that has been deleted.
    const simEcs = await simEcsWithCluster();
    await simEcs.deleteCluster(
      new DeleteClusterCommand({ cluster: "services" }),
    );

    // When the clusters are listed.
    const listed = await simEcs.listClusters(new ListClustersCommand({}));

    // Then the deleted one is not among them.
    assertArrayLength(listed.clusterArns, 0);
  });

  it("deletes a cluster named by its ARN", async () => {
    // Given a cluster and the ARN it was given.
    const simEcs = await simEcsWithCluster();
    const described = await simEcs.describeClusters(
      new DescribeClustersCommand({ clusters: ["services"] }),
    );

    // When it is deleted by ARN.
    const deleted = await simEcs.deleteCluster(
      new DeleteClusterCommand({
        cluster: described.clusters?.[0]?.clusterArn,
      }),
    );

    // Then the same cluster is the one deleted.
    assertIdentical(deleted.cluster?.clusterName, "services");
  });

  it("frees the name for a new cluster", async () => {
    // Given a cluster that has been deleted.
    const simEcs = await simEcsWithCluster();
    await simEcs.deleteCluster(
      new DeleteClusterCommand({ cluster: "services" }),
    );

    // When a cluster with the same name is created again.
    const created = await simEcs.createCluster(
      new CreateClusterCommand({ clusterName: "services" }),
    );

    // Then it is a new active cluster.
    assertIdentical(created.cluster?.status, "ACTIVE");
  });

  it("refuses a cluster that is not there", async () => {
    // Given simulated ECS holding no clusters.
    const simEcs = new SimAws().ecs();

    // When a cluster that does not exist is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.deleteCluster(new DeleteClusterCommand({ cluster: "services" })),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsClusterNotFoundException);
    assertIdentical(error.name, "ClusterNotFoundException");
    assertStringIncludes(error.message, "no active cluster services");
  });

  it("refuses a cluster that is already deleted", async () => {
    // Given a cluster that has been deleted.
    const simEcs = await simEcsWithCluster();
    await simEcs.deleteCluster(
      new DeleteClusterCommand({ cluster: "services" }),
    );

    // When it is deleted again.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.deleteCluster(new DeleteClusterCommand({ cluster: "services" })),
    );

    // Then ECS refuses it, since there is no active cluster of that name.
    assertInstanceOf(error, SimEcsClusterNotFoundException);
  });

  it("refuses the default cluster where there is none", async () => {
    // Given simulated ECS holding no clusters.
    const simEcs = new SimAws().ecs();

    // When a deletion names no cluster at all.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.deleteCluster({ input: {} }),
    );

    // Then it means the default cluster, which is not there either.
    assertInstanceOf(error, SimEcsClusterNotFoundException);
    assertStringIncludes(error.message, "no active cluster default");
  });

  it("refuses an identifier that is not an ECS ARN", async () => {
    // Given a cluster.
    const simEcs = await simEcsWithCluster();

    // When something that is not an ECS ARN is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.deleteCluster(
        new DeleteClusterCommand({
          cluster: "arn:aws:s3:::example-bucket/services",
        }),
      ),
    );

    // Then it names no cluster here, so nothing is deleted.
    assertInstanceOf(error, SimEcsClusterNotFoundException);
  });

  it("refuses an ARN belonging to another region", async () => {
    // Given a cluster.
    const simEcs = await simEcsWithCluster();

    // When a cluster ARN in a different region is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.deleteCluster(
        new DeleteClusterCommand({
          cluster: "arn:aws:ecs:ap-south-1:888888888888:cluster/services",
        }),
      ),
    );

    // Then it names a cluster somewhere else, so nothing is deleted.
    assertInstanceOf(error, SimEcsClusterNotFoundException);
  });
});
