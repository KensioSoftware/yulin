import { DescribeTasksCommand, RunTaskCommand } from "@aws-sdk/client-ecs";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeConsumedQueue } from "../../../../test/ecs/consuming-service-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simEcsClusterFactory } from "../cluster/sim-ecs-cluster.factory.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../task-definition/sim-ecs-registered-task-definition.factory.js";
import { SimEcsContainerBindings } from "./sim-ecs-container-bindings.js";

const queueUrl = "https://sqs.us-east-1.amazonaws.com/888888888888/orders";

describe("Binding a simulated ECS container that consumes a queue", () => {
  it("refuses a queue URL that names no queue", () => {
    // Given bindings to bind against.
    const bindings = new SimEcsContainerBindings();

    // When a container is bound to consume something that is not a queue URL.
    const error = assertThrowsError(() => {
      bindings.add({
        family: "orders-worker",
        containerName: "app",
        consumes: {
          queueUrl: "orders",
          handler: (): undefined => undefined,
        },
      });
    });

    // Then binding says so, where the mistake is, rather than polling nothing.
    assertStringIncludes(error.message, "names its queue by the URL");
  });

  it("refuses a batch size SQS would not hand out", () => {
    // Given bindings to bind against.
    const bindings = new SimEcsContainerBindings();

    // When a container asks for more messages than one receive gives.
    const error = assertThrowsError(() => {
      bindings.add({
        family: "orders-worker",
        containerName: "app",
        consumes: {
          queueUrl,
          batchSize: 25,
          handler: (): undefined => undefined,
        },
      });
    });

    // Then binding refuses it rather than quietly handing over ten.
    assertStringIncludes(error.message, "a whole number from 1 to 10");
  });

  it("refuses a consuming binding with no handler", () => {
    // Given bindings to bind against.
    const bindings = new SimEcsContainerBindings();

    // When a container declares a queue and nothing to do with it.
    const error = assertThrowsError(() => {
      bindings.add({
        family: "orders-worker",
        containerName: "app",
        consumes: { queueUrl } as never,
      });
    });

    // Then binding says what a consuming container needs.
    assertStringIncludes(error.message, "needs a handler");
  });

  it("has no run handler for a task to run", async () => {
    // Given a container bound to consume a queue.
    const bindings = new SimEcsContainerBindings();

    bindings.add({
      family: "orders-worker",
      containerName: "app",
      consumes: { queueUrl, handler: (): undefined => undefined },
    });

    const bound = bindings.find("orders-worker", {
      name: "app",
      image: "orders-worker:1",
    } as never);

    // When something asks it to run once.
    const error = await assertThrowsErrorAsync(async () => {
      await bound?.runHandler();
    });

    // Then it says that what it supplies is the body of a loop.
    assertStringIncludes(error.message, "consumes a queue");
  });

  it("records a consuming container of a run task as one a service runs", async () => {
    // Given a task definition whose container consumes a queue.
    const simAws = new SimAws();
    const ecs = simAws.ecs();

    await makeConsumedQueue(simAws);
    await simEcsClusterFactory.make({}, simAws);
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      consumes: { queueUrl, handler: (): undefined => undefined },
    });
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a task is run from it rather than a service created.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "checkout" }),
    );
    await simAws.backgroundTasksComplete();

    // Then the container says where it does run, rather than being run once
    // and called a task.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );
    const container = described.tasks?.[0]?.containers?.[0];

    assertIdentical(container?.lastStatus, "STOPPED");
    assertStringIncludes(container.reason ?? "", "Create a service");
  });
});
