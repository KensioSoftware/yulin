import {
  CreateClusterCommand,
  DescribeClustersCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import type { SimEcs } from "../../sim-ecs.js";

async function simEcsWithCluster(): Promise<SimEcs> {
  const simEcs = new SimAws().ecs();
  await simEcs.createCluster(
    new CreateClusterCommand({
      clusterName: "services",
      settings: [{ name: "containerInsights", value: "enabled" }],
      configuration: { executeCommandConfiguration: { logging: "DEFAULT" } },
      tags: [{ key: "team", value: "platform" }],
    }),
  );

  return simEcs;
}

describe("ECS DescribeClustersCommand", () => {
  it("describes a cluster by name and by ARN alike", async () => {
    // Given a cluster.
    const simEcs = await simEcsWithCluster();

    // When it is described by name and by ARN.
    const byName = await simEcs.describeClusters(
      new DescribeClustersCommand({ clusters: ["services"] }),
    );
    const byArn = await simEcs.describeClusters(
      new DescribeClustersCommand({
        clusters: [byName.clusters?.[0]?.clusterArn ?? ""],
      }),
    );

    // Then both reach the same cluster.
    assertArrayLength(byArn.clusters, 1);
    assertIdentical(byArn.clusters[0].clusterName, "services");
    assertArrayEmpty(byArn.failures);
  });

  it("reports a cluster that is not there as a failure", async () => {
    // Given a cluster.
    const simEcs = await simEcsWithCluster();

    // When a request names it alongside one that does not exist.
    const described = await simEcs.describeClusters(
      new DescribeClustersCommand({ clusters: ["services", "missing"] }),
    );

    // Then the one that is there is described and the other is a failure.
    assertArrayLength(described.clusters, 1);
    assertArrayLength(described.failures, 1);
    assertIdentical(described.failures[0].reason, "MISSING");
    assertStringIncludes(described.failures[0].arn ?? "", "cluster/missing");
  });

  it("reports an ARN from another account as a failure", async () => {
    // Given a cluster.
    const simEcs = await simEcsWithCluster();

    // When a cluster ARN in a different account is described.
    const described = await simEcs.describeClusters(
      new DescribeClustersCommand({
        clusters: ["arn:aws:ecs:eu-west-2:999999999999:cluster/services"],
      }),
    );

    // Then it names a cluster somewhere else, so nothing is described.
    assertArrayEmpty(described.clusters);
    assertArrayLength(described.failures, 1);
  });

  it("describes the default cluster when the request names none", async () => {
    // Given the default cluster.
    const simEcs = new SimAws().ecs();
    await simEcs.createCluster(new CreateClusterCommand({}));

    // When clusters are described without naming one.
    const described = await simEcs.describeClusters(
      new DescribeClustersCommand({}),
    );

    // Then the default cluster answers.
    assertArrayLength(described.clusters, 1);
    assertIdentical(described.clusters[0].clusterName, "default");
  });

  it("leaves out settings, configuration and tags unless asked", async () => {
    // Given a cluster with settings, configuration and tags.
    const simEcs = await simEcsWithCluster();

    // When it is described without an include list.
    const described = await simEcs.describeClusters(
      new DescribeClustersCommand({ clusters: ["services"] }),
    );

    // Then none of the three is reported, as on real ECS.
    assertArrayLength(described.clusters, 1);
    assertArrayEmpty(described.clusters[0].settings);
    assertArrayEmpty(described.clusters[0].tags);
    assertUndefined(described.clusters[0].configuration);
  });

  it("reports settings, configuration and tags where asked", async () => {
    // Given a cluster with settings, configuration and tags.
    const simEcs = await simEcsWithCluster();

    // When it is described asking for all three.
    const described = await simEcs.describeClusters(
      new DescribeClustersCommand({
        clusters: ["services"],
        include: ["SETTINGS", "CONFIGURATIONS", "TAGS"],
      }),
    );

    // Then each one comes back as it was created.
    assertArrayLength(described.clusters, 1);
    assertArrayLength(described.clusters[0].settings, 1);
    assertArrayLength(described.clusters[0].tags, 1);
    assertObjectEquals(described.clusters[0].configuration ?? {}, {
      executeCommandConfiguration: { logging: "DEFAULT" },
    });
  });

  it("refuses an include value naming capacity there is none of", async () => {
    // Given a cluster.
    const simEcs = await simEcsWithCluster();

    // When statistics are asked for.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.describeClusters(
        new DescribeClustersCommand({
          clusters: ["services"],
          include: ["STATISTICS"],
        }),
      ),
    );

    // Then ECS refuses it rather than reporting made-up counts.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "STATISTICS is not simulated");
  });
});
