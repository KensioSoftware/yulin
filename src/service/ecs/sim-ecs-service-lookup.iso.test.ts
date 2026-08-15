import {
  DeleteServiceCommand,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs";
import {
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simEcsClusterFactory } from "./cluster/sim-ecs-cluster.factory.js";
import { simEcsServiceFactory } from "./service/sim-ecs-service.factory.js";
import { simEcsRegisteredTaskDefinitionFactory } from "./task-definition/sim-ecs-registered-task-definition.factory.js";

/**
 * Create the default service of the default cluster.
 */
async function createdService(simAws: SimAws): Promise<string> {
  await simEcsClusterFactory.make({}, simAws);
  await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

  const created = await simEcsServiceFactory.make({}, simAws);

  return created.serviceArn ?? "";
}

describe("Looking a simulated ECS service up", () => {
  it("finds a service by its name and by its ARN", async () => {
    // Given a created service.
    const simAws = new SimAws();
    const serviceArn = await createdService(simAws);

    await simAws.backgroundTasksComplete();

    // When it is looked up both ways.
    const byName = simAws.ecs().service("checkout", "default");
    const byArn = simAws.ecs().service(serviceArn);

    // Then both give the same service, since the ARN carries the cluster the
    // name has to be given alongside.
    assertIdentical(byName, byArn);
    assertIdentical(byName.serviceName, "checkout");
  });

  it("finds a deleted service", async () => {
    // Given a service that has been scaled to nothing and deleted.
    const simAws = new SimAws();
    await createdService(simAws);
    await simAws
      .ecs()
      .updateService(
        new UpdateServiceCommand({ service: "checkout", desiredCount: 0 }),
      );
    await simAws
      .ecs()
      .deleteService(new DeleteServiceCommand({ service: "checkout" }));
    await simAws.backgroundTasksComplete();

    // When it is looked up.
    const service = simAws.ecs().service("checkout");

    // Then it is answered as the INACTIVE service it now is, rather than
    // reported missing, which is what real ECS leaves behind a deletion.
    assertFalse(service.isActive());
  });

  it("refuses a service name nothing holds", async () => {
    // Given a simulated ECS holding one service.
    const simAws = new SimAws();
    await createdService(simAws);
    await simAws.backgroundTasksComplete();

    // When another name is looked up, then it is refused rather than answered
    // with nothing.
    const error = assertThrowsError(() => simAws.ecs().service("orders"));

    assertStringIncludes(error.message, "holds no service orders");
  });

  it("refuses an identifier that names no service at all", async () => {
    // Given a simulated ECS holding one service.
    const simAws = new SimAws();
    await createdService(simAws);
    await simAws.backgroundTasksComplete();

    // When something that is not a service ARN is looked up, then it is
    // refused naming what was asked for.
    const error = assertThrowsError(() =>
      simAws
        .ecs()
        .service("arn:aws:ecs:us-east-1:888888888888:cluster/default"),
    );

    assertStringIncludes(error.message, "names no service");
  });
});
