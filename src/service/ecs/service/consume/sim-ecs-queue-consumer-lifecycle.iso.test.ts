import {
  DeleteServiceCommand,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithConsumingService } from "../../../../../test/ecs/consuming-service-fixture.js";
import { BackgroundTasks } from "../../../../util/background/background.js";

describe("What a simulated ECS container's polling outlives", () => {
  it("stops polling when the service is deleted, leaving nothing scheduled", async () => {
    // Given a running consumer that has handled a message, so it is watching
    // its queue and has a turn waiting on the clock.
    const background = new BackgroundTasks();
    const { simAws, queueUrl, batches } = await simAwsWithConsumingService({
      background,
    });

    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    const handledWhileRunning = batches.length;

    // When the service is deleted.
    await simAws
      .ecs()
      .deleteService(
        new DeleteServiceCommand({ service: "orders-worker", force: true }),
      );
    await simAws.backgroundTasksComplete();

    // Then nothing is left waiting on the clock or on the event loop.
    assertIdentical(handledWhileRunning, 1);
    assertIdentical(background.pendingTaskCount, 0);
    assertIdentical(background.dueTaskCount, 0);

    // And a message sent afterwards is left where it was sent.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-2" }),
      );
    await simAws.backgroundTasksComplete();

    assertArrayLength(batches, 1);
  });

  it("stops polling when the simulated environment closes", async () => {
    // Given a running consumer.
    const background = new BackgroundTasks();
    const { simAws, queueUrl, batches } = await simAwsWithConsumingService({
      background,
    });

    // When the environment is finished with.
    await simAws.close();

    // Then a message sent afterwards reaches nothing.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    assertArrayLength(batches, 0);
    assertIdentical(background.dueTaskCount, 0);
  });

  it("stops polling when the service scales to nothing, and starts again when it scales back out", async () => {
    // Given a running consumer whose service is then scaled to zero.
    const { simAws, queueUrl, batches } = await simAwsWithConsumingService();
    const ecs = simAws.ecs();

    await ecs.updateService(
      new UpdateServiceCommand({ service: "orders-worker", desiredCount: 0 }),
    );
    await simAws.backgroundTasksComplete();

    // When a message is sent while nothing is running.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    const whileScaledIn = batches.length;

    // And the service is scaled back out.
    await ecs.updateService(
      new UpdateServiceCommand({ service: "orders-worker", desiredCount: 1 }),
    );
    await simAws.backgroundTasksComplete();

    // Then nothing was handled while there was no container, and what was
    // waiting is handled once there is one again.
    assertIdentical(whileScaledIn, 0);
    assertArrayLength(batches, 1);
    assertIdentical(batches[0][0]?.Body, "order-1");
  });

  it("keeps polling across a service moving to another revision", async () => {
    // Given a running consumer whose service is redeployed.
    const { simAws, queueUrl, batches, taskRoleArn } =
      await simAwsWithConsumingService();

    await simAws.ecs().registerTaskDefinition({
      input: {
        family: "orders-worker",
        taskRoleArn,
        containerDefinitions: [{ name: "app", image: "orders-worker:2" }],
      },
    });
    await simAws.ecs().updateService(
      new UpdateServiceCommand({
        service: "orders-worker",
        taskDefinition: "orders-worker:2",
      }),
    );
    await simAws.backgroundTasksComplete();

    // When a message is sent to the queue the new revision's container reads.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // Then it is handled by the binding, which follows the container rather
    // than the revision.
    assertArrayLength(batches, 1);
    assertIdentical(batches[0][0]?.Body, "order-1");
  });
});
