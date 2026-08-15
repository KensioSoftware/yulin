import {
  CreateServiceCommand,
  DeregisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
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
  SimEcsInvalidParameterException,
} from "../../error/sim-ecs.error.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";
import { simEcsServiceFactory } from "../../service/sim-ecs-service.factory.js";

describe("Refusing a simulated ECS CreateService request", () => {
  it("refuses an input this simulation does not hold", async () => {
    // Given a registered task definition.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a service is created behind a load balancer.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().createService(
        new CreateServiceCommand({
          serviceName: "checkout",
          taskDefinition: "checkout",
          desiredCount: 1,
          loadBalancers: [{ containerName: "app", containerPort: 8080 }],
        }),
      ),
    );

    // Then it is refused rather than dropped, since nothing here would send it
    // a request.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "loadBalancers");
    assertStringIncludes(error.message, "not simulated");
  });

  it("refuses a scheduling strategy of DAEMON", async () => {
    // Given a registered task definition.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a daemon service is created.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().createService(
        new CreateServiceCommand({
          serviceName: "checkout",
          taskDefinition: "checkout",
          desiredCount: 1,
          schedulingStrategy: "DAEMON",
        }),
      ),
    );

    // Then it is refused, because there are no container instances here to
    // place one task on each of.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "DAEMON");
  });

  it("refuses a request that does not say how many tasks to keep", async () => {
    // Given a registered task definition.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a service is created without a desired count.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().createService(
        new CreateServiceCommand({
          serviceName: "checkout",
          taskDefinition: "checkout",
        }),
      ),
    );

    // Then it is refused, as real ECS refuses a replica service without one.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "desiredCount");
  });

  it("refuses a desired count that is not a whole number of tasks", async () => {
    // Given a registered task definition.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a service is created with a negative desired count.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().createService(
        new CreateServiceCommand({
          serviceName: "checkout",
          taskDefinition: "checkout",
          desiredCount: -1,
        }),
      ),
    );

    // Then it is refused rather than kept as state nothing could reach.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "whole number");
  });

  it("refuses a service name real ECS would not accept", async () => {
    // Given a registered task definition.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a service is created with a name holding a slash.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().createService(
        new CreateServiceCommand({
          serviceName: "checkout/api",
          taskDefinition: "checkout",
          desiredCount: 1,
        }),
      ),
    );

    // Then it is refused here rather than on deployment.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "service name");
  });

  it("refuses a name an active service of the cluster already has", async () => {
    // Given a service that is already there.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({}, simAws);

    // When another of the same name is created in the same cluster.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().createService(
        new CreateServiceCommand({
          serviceName: "checkout",
          taskDefinition: "checkout",
          desiredCount: 1,
        }),
      ),
    );

    // Then it is refused rather than handed the existing one, as real ECS
    // refuses it.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "already holds an active service");
  });

  it("refuses a revision that has been deregistered", async () => {
    // Given a task definition whose only revision has been deregistered.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simAws
      .ecs()
      .deregisterTaskDefinition(
        new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
      );

    // When a service is created from it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().createService(
        new CreateServiceCommand({
          serviceName: "checkout",
          taskDefinition: "checkout:1",
          desiredCount: 1,
        }),
      ),
    );

    // Then it is refused, because a deregistered revision is one nothing is
    // meant to start from any more.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "INACTIVE");
  });

  it("refuses a cluster that is not there", async () => {
    // Given a registered task definition and no cluster.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a service is created.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().createService(
        new CreateServiceCommand({
          serviceName: "checkout",
          taskDefinition: "checkout",
          desiredCount: 1,
        }),
      ),
    );

    // Then it is refused, because Yulin creates no cluster of its own.
    assertInstanceOf(error, SimEcsClusterNotFoundException);
    assertStringIncludes(error.message, "default");
  });
});
