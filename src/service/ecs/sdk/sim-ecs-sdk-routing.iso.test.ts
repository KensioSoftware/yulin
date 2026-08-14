import {
  CreateClusterCommand,
  DeleteClusterCommand,
  DeregisterTaskDefinitionCommand,
  DescribeClustersCommand,
  DescribeTaskDefinitionCommand,
  ECSClient,
  ListClustersCommand,
  ListTaskDefinitionFamiliesCommand,
  ListTaskDefinitionsCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayIncludesAll,
  assertArrayLength,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimEcs } from "../sim-ecs.js";

describe("ECS SDK interception", () => {
  it("routes an intercepted ECSClient to simulated ECS", async () => {
    // Given an intercepted ECS SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(ECSClient);

    const ecs = new ECSClient({ region: "eu-west-2" });

    // When ordinary SDK code registers and describes a task definition.
    await ecs.send(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );
    const described = await ecs.send(
      new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
    );

    // Then the simulated revision answers, with nothing touching the network.
    assertIdentical(described.taskDefinition?.revision, 1);
    assertIdentical(
      described.taskDefinition.containerDefinitions?.[0]?.image,
      "checkout:1",
    );
  });

  it("routes an intercepted cluster command to simulated ECS", async () => {
    // Given an intercepted ECS SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(ECSClient);

    const ecs = new ECSClient({ region: "eu-west-2" });

    // When ordinary SDK code creates a cluster and lists the clusters.
    await ecs.send(new CreateClusterCommand({ clusterName: "services" }));
    const listed = await ecs.send(new ListClustersCommand({}));

    // Then the simulated cluster is the one listed.
    assertArrayLength(listed.clusterArns, 1);
    assertIdentical(
      listed.clusterArns[0],
      `arn:aws:ecs:eu-west-2:${simSdk.simAws.defaultAccountId}:cluster/services`,
    );
  });

  it("routes every operation this service simulates", async () => {
    // Given an intercepted ECS SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(ECSClient);

    const ecs = new ECSClient({ region: "eu-west-2" });
    await ecs.send(new CreateClusterCommand({ clusterName: "services" }));
    await ecs.send(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When each remaining operation is sent through the client.
    const clusters = await ecs.send(
      new DescribeClustersCommand({ clusters: ["services"] }),
    );
    const families = await ecs.send(new ListTaskDefinitionFamiliesCommand({}));
    const revisions = await ecs.send(new ListTaskDefinitionsCommand({}));
    const deregistered = await ecs.send(
      new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
    );
    const deleted = await ecs.send(
      new DeleteClusterCommand({ cluster: "services" }),
    );

    // Then each one is answered by the simulation.
    assertArrayLength(clusters.clusters, 1);
    assertArrayLength(families.families, 1);
    assertArrayLength(revisions.taskDefinitionArns, 1);
    assertIdentical(deregistered.taskDefinition?.status, "INACTIVE");
    assertIdentical(deleted.cluster?.status, "INACTIVE");
  });

  it("supports every ECS operation this service simulates", () => {
    // Given simulated ECS.
    const simEcs = new SimEcs();

    // When its SDK Command router is asked what it handles.
    const supported = simEcs.sdkCommandRouter().supportedCommandNames();

    // Then every simulated operation is routable from an SDK client.
    assertArrayIncludesAll(supported, [
      CreateClusterCommand.name,
      DescribeClustersCommand.name,
      DeleteClusterCommand.name,
      ListClustersCommand.name,
      RegisterTaskDefinitionCommand.name,
      DeregisterTaskDefinitionCommand.name,
      DescribeTaskDefinitionCommand.name,
      ListTaskDefinitionsCommand.name,
      ListTaskDefinitionFamiliesCommand.name,
    ]);
  });

  it("has no route for an operation it does not simulate", () => {
    // Given simulated ECS.
    const simEcs = new SimEcs();

    // When a command it does not handle is looked up.
    const route = simEcs.sdkCommandRouter().route("RunTaskCommand");

    // Then there is no route for it, so interception reports it as
    // unsupported rather than answering with nothing.
    assertUndefined(route);
  });
});
