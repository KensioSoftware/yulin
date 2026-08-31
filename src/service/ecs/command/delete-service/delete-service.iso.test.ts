import {
  DeleteServiceCommand,
  DescribeServicesCommand,
  DescribeTasksCommand,
  ListTasksCommand,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayEmpty,
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
  SimEcsInvalidParameterException,
  SimEcsServiceNotFoundException,
} from "../../error/sim-ecs.error.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";
import { simEcsServiceFactory } from "../../service/sim-ecs-service.factory.js";

describe("ECS DeleteServiceCommand", () => {
  it("stops the tasks of a service it was forced to delete", async () => {
    // Given a service running three tasks.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({ desiredCount: 3 }, simAws);
    await simAws.backgroundTasksComplete();

    const before = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    assertArrayLength(before.taskArns, 3);

    // When it is deleted with force, without being scaled down first.
    const deleted = await ecs.deleteService(
      new DeleteServiceCommand({ service: "checkout", force: true }),
    );
    await simAws.backgroundTasksComplete();

    // Then the service is INACTIVE and its tasks are no longer listed.
    assertIdentical(deleted.service?.status, "INACTIVE");
    assertIdentical(deleted.service.desiredCount, 0);
    assertIdentical(deleted.service.runningCount, 0);

    const after = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    assertArrayEmpty(after.taskArns);

    // And each stopped task says the service being deleted stopped it.
    const stopped = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [before.taskArns[0]] }),
    );

    assertIdentical(stopped.tasks?.[0]?.lastStatus, "STOPPED");
    assertStringIncludes(stopped.tasks[0].stoppedReason ?? "", "being deleted");
  });

  it("deletes a service that has been scaled to nothing", async () => {
    // Given a service scaled to zero.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({ desiredCount: 2 }, simAws);
    await ecs.updateService(
      new UpdateServiceCommand({ service: "checkout", desiredCount: 0 }),
    );
    await simAws.backgroundTasksComplete();

    // When it is deleted without force.
    const deleted = await ecs.deleteService(
      new DeleteServiceCommand({ service: "checkout" }),
    );

    // Then it goes, which is the ordinary way round.
    assertIdentical(deleted.service?.status, "INACTIVE");
  });

  it("refuses to delete a service that is still scaled up", async () => {
    // Given a service running one task.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({}, simAws);
    await simAws.backgroundTasksComplete();

    // When it is deleted without force.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .deleteService(new DeleteServiceCommand({ service: "checkout" })),
    );

    // Then it is refused, as real ECS refuses it: scaling to zero first is the
    // ordinary way round, and a test that skips it would fail on deployment.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "scaled above zero");
  });

  it("still describes a deleted service", async () => {
    // Given a deleted service.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({}, simAws);
    await simAws.backgroundTasksComplete();
    await ecs.deleteService(
      new DeleteServiceCommand({ service: "checkout", force: true }),
    );

    // When it is described.
    const described = await ecs.describeServices(
      new DescribeServicesCommand({ services: ["checkout"] }),
    );

    // Then it is still there as INACTIVE, so something holding its ARN can find
    // out what became of it.
    assertIdentical(described.services?.[0]?.status, "INACTIVE");
    assertArrayEmpty(described.failures);
  });

  it("frees the name a deleted service had", async () => {
    // Given a deleted service.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({}, simAws);
    await ecs.deleteService(
      new DeleteServiceCommand({ service: "checkout", force: true }),
    );

    // When a service of the same name is created again.
    const created = await simEcsServiceFactory.make(
      { desiredCount: 2 },
      simAws,
    );
    await simAws.backgroundTasksComplete();

    // Then it takes the deleted one's place as an active service.
    assertIdentical(created.status, "ACTIVE");

    const described = await ecs.describeServices(
      new DescribeServicesCommand({ services: ["checkout"] }),
    );

    assertIdentical(described.services?.[0]?.status, "ACTIVE");
    assertIdentical(described.services[0].runningCount, 2);
  });

  it("refuses a service the cluster does not hold", async () => {
    // Given a cluster with no service in it.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When a service of it is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .deleteService(new DeleteServiceCommand({ service: "checkout" })),
    );

    // Then it is ECS's own service not found error.
    assertInstanceOf(error, SimEcsServiceNotFoundException);
    assertStringIncludes(error.message, "checkout");
  });

  it("refuses a service ARN naming another cluster", async () => {
    // Given a service in the default cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({ desiredCount: 0 }, simAws);

    // When it is deleted by an ARN naming a different cluster.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().deleteService(
        new DeleteServiceCommand({
          service: `arn:aws:ecs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:service/services/checkout`,
        }),
      ),
    );

    // Then it names nothing, because a service belongs to the cluster it was
    // created in.
    assertInstanceOf(error, SimEcsServiceNotFoundException);
  });
});
