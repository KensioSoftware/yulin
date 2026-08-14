import { CreateClusterCommand } from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimEcsClientException } from "../../error/sim-ecs.error.js";

describe("ECS CreateClusterCommand", () => {
  it("creates a cluster in the account and region", async () => {
    // Given simulated ECS in a known account and region.
    const simEcs = new SimAws()
      .account("555555555555")
      .region("eu-west-1")
      .ecs();

    // When a cluster is created.
    const created = await simEcs.createCluster(
      new CreateClusterCommand({ clusterName: "services" }),
    );

    // Then it has the ARN it would have on real AWS, and no capacity.
    assertIdentical(
      created.cluster?.clusterArn,
      "arn:aws:ecs:eu-west-1:555555555555:cluster/services",
    );
    assertIdentical(created.cluster.clusterName, "services");
    assertIdentical(created.cluster.status, "ACTIVE");
    assertIdentical(created.cluster.runningTasksCount, 0);
    assertIdentical(created.cluster.activeServicesCount, 0);
  });

  it("creates the default cluster when the request names none", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a cluster is created without a name.
    const created = await simEcs.createCluster(new CreateClusterCommand({}));

    // Then it is the default cluster, as it is on real ECS.
    assertIdentical(created.cluster?.clusterName, "default");
  });

  it("hands back the existing cluster when the name is taken", async () => {
    // Given a cluster that already exists.
    const simEcs = new SimAws().ecs();
    const first = await simEcs.createCluster(
      new CreateClusterCommand({
        clusterName: "services",
        tags: [{ key: "team", value: "platform" }],
      }),
    );

    // When the same name is created again.
    const second = await simEcs.createCluster(
      new CreateClusterCommand({ clusterName: "services" }),
    );

    // Then the existing cluster answers, tags and all, rather than an error.
    assertIdentical(second.cluster?.clusterArn, first.cluster?.clusterArn);
    assertArrayLength(second.cluster?.tags, 1);
  });

  it("reports the settings and tags a cluster was created with", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a cluster is created with settings and tags.
    const created = await simEcs.createCluster(
      new CreateClusterCommand({
        clusterName: "services",
        settings: [{ name: "containerInsights", value: "enabled" }],
        tags: [{ key: "team", value: "platform" }],
      }),
    );

    // Then both come back with the created cluster.
    assertArrayLength(created.cluster?.settings, 1);
    assertIdentical(created.cluster.settings[0].value, "enabled");
    assertArrayLength(created.cluster.tags, 1);
    assertIdentical(created.cluster.tags[0].key, "team");
  });

  it("refuses a cluster name ECS would not accept", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a cluster name carries a character ECS does not allow.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.createCluster(new CreateClusterCommand({ clusterName: "my/app" })),
    );

    // Then it is refused here rather than on deployment.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "Invalid cluster name");
  });

  it("refuses a declaration this simulation does not hold", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When a cluster is created with capacity providers.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.createCluster(
        new CreateClusterCommand({
          clusterName: "services",
          capacityProviders: ["FARGATE"],
        }),
      ),
    );

    // Then it is refused, because there is no capacity here to attach.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "capacityProviders is not simulated");
  });

  it("keeps the clusters of one account and region to themselves", async () => {
    // Given two account and region scopes.
    const simAws = new SimAws();

    // When a cluster of the same name is created in each of them.
    const here = await simAws
      .account("111111111111")
      .region("eu-west-2")
      .ecs()
      .createCluster(new CreateClusterCommand({ clusterName: "services" }));
    const elsewhere = await simAws
      .account("111111111111")
      .region("us-east-1")
      .ecs()
      .createCluster(new CreateClusterCommand({ clusterName: "services" }));

    // Then each names its own region in its ARN.
    assertIdentical(
      here.cluster?.clusterArn,
      "arn:aws:ecs:eu-west-2:111111111111:cluster/services",
    );
    assertIdentical(
      elsewhere.cluster?.clusterArn,
      "arn:aws:ecs:us-east-1:111111111111:cluster/services",
    );
  });
});
