import { DescribeServicesCommand } from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";
import {
  SimEcsClientException,
  SimEcsClusterNotFoundException,
} from "../../error/sim-ecs.error.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";
import { simEcsServiceFactory } from "../../service/sim-ecs-service.factory.js";

describe("ECS DescribeServicesCommand", () => {
  it("describes a service by its name and by its ARN", async () => {
    // Given a service.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    const created = await simEcsServiceFactory.make({}, simAws);
    await simAws.backgroundTasksComplete();

    // When it is described both ways.
    const described = await ecs.describeServices(
      new DescribeServicesCommand({
        services: ["checkout", created.serviceArn ?? ""],
      }),
    );

    // Then both name the same service, since the two forms are interchangeable
    // wherever ECS takes one.
    assertArrayLength(described.services, 2);
    assertIdentical(described.services[0].serviceArn, created.serviceArn);
    assertIdentical(described.services[1].serviceArn, created.serviceArn);
    assertIdentical(described.services[0].clusterArn, created.clusterArn);
    assertStringIncludes(
      described.services[0].taskDefinition ?? "",
      "task-definition/checkout:1",
    );
  });

  it("reports a service it cannot find as a failure", async () => {
    // Given a cluster holding one service.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({}, simAws);
    await simAws.backgroundTasksComplete();

    // When two services are described, one of which is not there.
    const described = await ecs.describeServices(
      new DescribeServicesCommand({ services: ["checkout", "orders"] }),
    );

    // Then the one that is there is described and the other is a failure entry
    // rather than an error.
    assertArrayLength(described.services, 1);
    assertArrayLength(described.failures, 1);
    assertIdentical(described.failures[0].reason, "MISSING");
    assertStringIncludes(
      described.failures[0].arn ?? "",
      ":service/default/orders",
    );
  });

  it("describes a service named by an ARN in the older format", async () => {
    // Given a service.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({}, simAws);
    await simAws.backgroundTasksComplete();

    // When it is described by an ARN that leaves the cluster out, which is the
    // format ECS used before it named the cluster in one.
    const described = await simAws.ecs().describeServices(
      new DescribeServicesCommand({
        services: [
          `arn:aws:ecs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:service/checkout`,
        ],
      }),
    );

    // Then it names the service in the cluster the request meant.
    assertArrayLength(described.services, 1);
    assertIdentical(described.services[0].serviceName, "checkout");
  });

  it("reports a service ARN naming another cluster as a failure", async () => {
    // Given a service in the default cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({}, simAws);
    await simAws.backgroundTasksComplete();

    // When it is described by an ARN naming a different cluster.
    const described = await simAws.ecs().describeServices(
      new DescribeServicesCommand({
        services: [
          `arn:aws:ecs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:service/services/checkout`,
        ],
      }),
    );

    // Then it names nothing, because a service belongs to the cluster it was
    // created in.
    assertArrayLength(described.services, 0);
    assertArrayLength(described.failures, 1);
  });

  it("reports a service ARN from another region as a failure", async () => {
    // Given a service.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({}, simAws);

    // When it is described by an ARN belonging to another Region.
    const described = await simAws.ecs().describeServices(
      new DescribeServicesCommand({
        services: [
          `arn:aws:ecs:eu-central-1:${simAws.defaultAccountId}:service/default/checkout`,
        ],
      }),
    );

    // Then it names nothing here, because it names a service somewhere else on
    // real AWS.
    assertArrayLength(described.services, 0);
    assertArrayLength(described.failures, 1);
  });

  it("refuses a request naming no service", async () => {
    // Given a cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When services are described without naming any.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .describeServices(new DescribeServicesCommand({ services: [] })),
    );

    // Then it is refused, as real ECS refuses it.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "at least one service");
  });

  it("refuses more services than one request may name", async () => {
    // Given a cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When eleven services are described in one request.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().describeServices(
        new DescribeServicesCommand({
          services: Array.from(
            { length: 11 },
            (_, index) => `s${String(index)}`,
          ),
        }),
      ),
    );

    // Then it is refused at the limit real ECS applies.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "at most 10");
  });

  it("raises for a cluster that is not there", async () => {
    // Given no cluster at all.
    const simAws = new SimAws();

    // When a service of one is described.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .describeServices(
          new DescribeServicesCommand({ services: ["checkout"] }),
        ),
    );

    // Then the cluster is reported rather than every service in it being
    // reported as missing.
    assertInstanceOf(error, SimEcsClusterNotFoundException);
  });
});
