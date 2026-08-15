import {
  CreateServiceCommand,
  DeleteServiceCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  makeServedTargetGroup,
  servedServiceNames,
  simAwsWithServedService,
} from "../../../../../test/ecs/served-service-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simAwsAccountRegionScopeFactory } from "../../../aws/sim-aws-account-region-scope.factory.js";
import { createFixtureLambdaTargetGroup } from "../../../elbv2/sim-elbv2.fixture.js";
import { SimEcs } from "../../sim-ecs.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";

/**
 * How many targets a target group holds.
 */
async function registeredTargets(
  simAws: SimAws,
  targetGroupArn: string,
): Promise<number> {
  const health = await simAws
    .elbV2()
    .describeTargetHealth({ input: { TargetGroupArn: targetGroupArn } });

  return health.TargetHealthDescriptions?.length ?? 0;
}

describe("Registering a simulated ECS service with a target group", () => {
  it("registers one target for each task the service keeps running", async () => {
    // Given a service keeping two tasks running behind a target group.
    const { simAws, targetGroupArn } = await simAwsWithServedService({
      desiredCount: 2,
      withoutLoadBalancer: true,
    });

    // When the target group's health is described.
    const health = await simAws
      .elbV2()
      .describeTargetHealth({ input: { TargetGroupArn: targetGroupArn } });

    // Then each task is a target, on the port the registration named, at an
    // address of its own.
    assertArrayLength(health.TargetHealthDescriptions, 2);
    assertIdentical(health.TargetHealthDescriptions[0].Target.Id, "10.0.0.1");
    assertIdentical(health.TargetHealthDescriptions[1].Target.Id, "10.0.0.2");
    assertIdentical(
      health.TargetHealthDescriptions[0].Target.Port,
      servedServiceNames.containerPort,
    );
  });

  it("takes the targets out again when the service is deleted", async () => {
    // Given a service registered into a target group.
    const { simAws, targetGroupArn } = await simAwsWithServedService({
      withoutLoadBalancer: true,
    });

    // When the service is deleted.
    await simAws.ecs().deleteService(
      new DeleteServiceCommand({
        cluster: servedServiceNames.cluster,
        service: servedServiceNames.service,
        force: true,
      }),
    );

    // Then the group holds nothing, because the tasks that were its targets
    // have stopped.
    assertIdentical(await registeredTargets(simAws, targetGroupArn), 0);
  });

  it("follows the desired count as the service is scaled", async () => {
    // Given a service keeping one task running behind a target group.
    const { simAws, targetGroupArn } = await simAwsWithServedService({
      withoutLoadBalancer: true,
    });
    const ecs = simAws.ecs();

    // When it is scaled out and then back in.
    await ecs.updateService(
      new UpdateServiceCommand({
        cluster: servedServiceNames.cluster,
        service: servedServiceNames.service,
        desiredCount: 3,
      }),
    );
    await simAws.backgroundTasksComplete();

    const scaledOut = await registeredTargets(simAws, targetGroupArn);

    await ecs.updateService(
      new UpdateServiceCommand({
        cluster: servedServiceNames.cluster,
        service: servedServiceNames.service,
        desiredCount: 1,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the targets are the tasks the service is keeping, at each point.
    assertIdentical(scaledOut, 3);
    assertIdentical(await registeredTargets(simAws, targetGroupArn), 1);
  });

  it("leaves a target group that has been deleted alone", async () => {
    // Given a service registered into a target group that is then deleted,
    // which takes its targets with it.
    const { simAws, targetGroupArn } = await simAwsWithServedService({
      withoutLoadBalancer: true,
    });

    await simAws
      .elbV2()
      .deleteTargetGroup({ input: { TargetGroupArn: targetGroupArn } });

    // When the service is scaled out and then deleted.
    await simAws.ecs().updateService(
      new UpdateServiceCommand({
        cluster: servedServiceNames.cluster,
        service: servedServiceNames.service,
        desiredCount: 2,
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.ecs().deleteService(
      new DeleteServiceCommand({
        cluster: servedServiceNames.cluster,
        service: servedServiceNames.service,
        force: true,
      }),
    );

    // Then neither the task that started nor the tasks that stopped had
    // anywhere to be registered, and neither the scale nor the delete failed
    // over it.
    assertFalse(
      simAws
        .ecs()
        .service(servedServiceNames.service, servedServiceNames.cluster)
        .isActive(),
    );
  });
});

describe("Refusing a simulated ECS service load balancer", () => {
  it("refuses a target group nothing holds", async () => {
    // Given a registered task definition and no target group.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When a service names one anyway, then it says so rather than being
    // created registered with nothing.
    const error = await assertThrowsErrorAsync(async () => {
      return await ecs.createService(
        new CreateServiceCommand({
          serviceName: "checkout",
          taskDefinition: "checkout",
          desiredCount: 1,
          loadBalancers: [
            {
              targetGroupArn:
                "arn:aws:elasticloadbalancing:us-east-1:888888888888:targetgroup/gone/0000000000000001",
              containerName: "app",
              containerPort: 8080,
            },
          ],
        }),
      );
    });

    assertStringIncludes(error.message, "names no simulated target group");
  });

  it("refuses a target group that holds functions", async () => {
    // Given a registered task definition and a lambda target group.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    const targetGroupArn = await createFixtureLambdaTargetGroup(simAws.elbV2());

    // When a service names it, then it says what a service registers as.
    const error = await assertThrowsErrorAsync(async () => {
      return await ecs.createService(
        new CreateServiceCommand({
          serviceName: "checkout",
          taskDefinition: "checkout",
          desiredCount: 1,
          loadBalancers: [
            { targetGroupArn, containerName: "app", containerPort: 8080 },
          ],
        }),
      );
    });

    assertStringIncludes(error.message, "holds lambda targets");
  });

  it("says what is missing when simulated ECS reaches no load balancing", async () => {
    // Given a simulated ECS built on its own, which has no ELBv2 to reach.
    const accountRegionScope = simAwsAccountRegionScopeFactory.make();
    const ecs = new SimEcs({ accountRegionScope });
    const targetGroupArn = `arn:aws:elasticloadbalancing:${accountRegionScope.regionName}:${accountRegionScope.accountId}:targetgroup/checkout-tg/0000000000000001`;
    await ecs.createCluster({ input: { clusterName: "orders" } });
    await ecs.registerTaskDefinition({
      input: {
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      },
    });

    // When a service names a target group, then it says how to reach one
    // rather than registering with nothing.
    const error = await assertThrowsErrorAsync(async () => {
      return await ecs.createService({
        input: {
          cluster: "orders",
          serviceName: "checkout",
          taskDefinition: "checkout",
          desiredCount: 1,
          loadBalancers: [
            { targetGroupArn, containerName: "app", containerPort: 8080 },
          ],
        },
      });
    });

    assertStringIncludes(error.message, "reaches no simulated Elastic Load");
  });

  it("refuses a container port nothing could listen on", async () => {
    // Given a registered task definition and a target group of addresses.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    const targetGroupArn = await makeServedTargetGroup(simAws);

    // When a service registers on a port outside the range a target takes,
    // then it says so rather than registering a target nothing could reach.
    const error = await assertThrowsErrorAsync(async () => {
      return await ecs.createService(
        new CreateServiceCommand({
          serviceName: "checkout",
          taskDefinition: "checkout",
          desiredCount: 1,
          loadBalancers: [
            { targetGroupArn, containerName: "app", containerPort: 70_000 },
          ],
        }),
      );
    });

    assertStringIncludes(error.message, "not a port between 1 and 65535");
  });

  it("refuses a target group of another Account or Region", async () => {
    // Given a registered task definition and a target group in another Region.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    const elsewhere = simAws.account("888888888888").region("eu-west-1");
    const targetGroupArn = await makeServedTargetGroup(
      simAws,
      elsewhere.elbV2(),
    );

    // When a service names it, then it says where a service registers.
    const error = await assertThrowsErrorAsync(async () => {
      return await ecs.createService(
        new CreateServiceCommand({
          serviceName: "checkout",
          taskDefinition: "checkout",
          desiredCount: 1,
          loadBalancers: [
            { targetGroupArn, containerName: "app", containerPort: 8080 },
          ],
        }),
      );
    });

    assertStringIncludes(error.message, "in another Account or Region");
  });

  it("records a serving container of a run task as not simulated", async () => {
    // Given a task definition whose container answers requests.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await makeServedTargetGroup(simAws);
    await simEcsClusterFactory.make({}, simAws);
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      http: () => new Response("checkout"),
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When a task is run from it rather than a service created.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "checkout" }),
    );
    await simAws.backgroundTasksComplete();

    // Then the container says where it does run, rather than being called
    // with no request to answer.
    const task = simAws.ecs();
    const described = await task.describeTasks({
      input: { tasks: [run.tasks?.[0]?.taskArn ?? ""] },
    });

    assertStringIncludes(
      described.tasks?.[0]?.containers?.[0]?.reason ?? "",
      "answers HTTP requests",
    );
  });
});
