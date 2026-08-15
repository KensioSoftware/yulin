import {
  CreateServiceCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { BackgroundTasks } from "../../../../util/background/background.js";
import { SimEcs } from "../../sim-ecs.js";

const queueUrl = "https://sqs.us-east-1.amazonaws.com/888888888888/orders";

describe("A simulated ECS with no simulated SQS behind it", () => {
  it("says a consuming container has no queue to reach", async () => {
    // Given a simulated ECS built on its own, with a consuming container.
    const background = new BackgroundTasks();
    const ecs = new SimEcs({ background });

    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      consumes: { queueUrl, handler: (): undefined => undefined },
    });

    await ecs.createCluster({ input: { clusterName: "default" } });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        containerDefinitions: [{ name: "app", image: "orders-worker:1" }],
      }),
    );

    // When a service starts the container.
    await ecs.createService(
      new CreateServiceCommand({
        serviceName: "orders-worker",
        taskDefinition: "orders-worker",
        desiredCount: 1,
      }),
    );

    // Then the first poll says there is no queue, and how to get one, rather
    // than polling nothing for the length of the test.
    const error = await assertThrowsErrorAsync(async () => {
      await background.complete();
    });

    assertStringIncludes(error.message, "reaches no simulated SQS");
    assertStringIncludes(error.message, "Build it through a SimAws instance");
  });
});
