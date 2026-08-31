import { CreateClusterCommand, ListClustersCommand } from "@aws-sdk/client-ecs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import type { SimEcs } from "../../sim-ecs.js";

async function simEcsWithClusters(): Promise<SimEcs> {
  const simEcs = new SimAws().ecs();

  await simEcs.createCluster(
    new CreateClusterCommand({ clusterName: "services-1" }),
  );
  await simEcs.createCluster(
    new CreateClusterCommand({ clusterName: "services-2" }),
  );
  await simEcs.createCluster(
    new CreateClusterCommand({ clusterName: "services-3" }),
  );

  return simEcs;
}

describe("ECS ListClustersCommand", () => {
  it("lists the ARNs of the clusters that are there", async () => {
    // Given three clusters.
    const simEcs = await simEcsWithClusters();

    // When the clusters are listed.
    const listed = await simEcs.listClusters(new ListClustersCommand({}));

    // Then every ARN comes back, in the order they were created.
    assertArrayLength(listed.clusterArns, 3);
    assertStringIncludes(listed.clusterArns[0], "cluster/services-1");
    assertStringIncludes(listed.clusterArns[2], "cluster/services-3");
    assertUndefined(listed.nextToken);
  });

  it("lists nothing where there are no clusters", async () => {
    // Given simulated ECS holding no clusters.
    const simEcs = new SimAws().ecs();

    // When the clusters are listed.
    const listed = await simEcs.listClusters(new ListClustersCommand({}));

    // Then the listing is empty rather than absent.
    assertArrayEmpty(listed.clusterArns);
  });

  it("pages a listing at the size the request asked for", async () => {
    // Given three clusters.
    const simEcs = await simEcsWithClusters();

    // When they are listed two at a time.
    const first = await simEcs.listClusters(
      new ListClustersCommand({ maxResults: 2 }),
    );
    const second = await simEcs.listClusters(
      new ListClustersCommand({ maxResults: 2, nextToken: first.nextToken }),
    );

    // Then the pages carry the clusters between them, and the last has no
    // token.
    assertArrayLength(first.clusterArns, 2);
    assertIdentical(first.nextToken, "2");
    assertArrayLength(second.clusterArns, 1);
    assertUndefined(second.nextToken);
  });

  it("refuses a page size ECS would not take", async () => {
    // Given some clusters.
    const simEcs = await simEcsWithClusters();

    // When a listing asks for more than one page holds.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.listClusters(new ListClustersCommand({ maxResults: 500 })),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "maxResults");
  });

  it("refuses a continuation token it did not issue", async () => {
    // Given three clusters.
    const simEcs = await simEcsWithClusters();

    // When a listing carries a token from nowhere.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.listClusters(
        new ListClustersCommand({ maxResults: 2, nextToken: "1" }),
      ),
    );

    // Then it is refused rather than answered from part way into a page.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "nextToken");
  });
});
