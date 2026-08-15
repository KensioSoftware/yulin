import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simAwsWithConsumingService,
  sqsConsumingActions,
} from "../../../../../test/ecs/consuming-service-fixture.js";
import { SimSdk } from "../../../../sdk/index.js";

describe("Authorizing what a simulated ECS container's polling does", () => {
  it("refuses to receive for a task Role that may not read the queue", async () => {
    // Given a task Role allowed to look at the queue but not to read it.
    // When a service starts a container that consumes the queue.
    const error = await assertThrowsErrorAsync(async () => {
      await simAwsWithConsumingService({
        roleActions: ["sqs:GetQueueAttributes"],
      });
    });

    // Then its first poll is refused, as it would be for the deployed
    // container, rather than being polled as whoever created the service.
    assertStringIncludes(error.message, "sqs:ReceiveMessage");
    assertStringIncludes(error.message, "role/OrdersTaskRole");
  });

  it("refuses to poll at all for a task definition with no task Role", async () => {
    // Given a task definition declaring no task Role.
    // When a service starts a container that consumes a queue.
    const error = await assertThrowsErrorAsync(async () => {
      await simAwsWithConsumingService({ withoutTaskRole: true });
    });

    // Then it polls as nobody and is denied, as a real task with no
    // credentials of its own would be.
    assertStringIncludes(error.message, "anonymous");
    assertStringIncludes(error.message, "sqs:GetQueueAttributes");
  });

  it("refuses to delete for a task Role without sqs:DeleteMessage", async () => {
    // Given a consuming container whose task Role may receive but not delete.
    const { simAws, queueUrl, batches } = await simAwsWithConsumingService({
      roleActions: ["sqs:GetQueueAttributes", "sqs:ReceiveMessage"],
    });

    // When a message is sent to it.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // Then the handler was given the batch, and the delete that followed it
    // was refused, exactly as it would be for the deployed container.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.backgroundTasksComplete();
    });

    assertArrayLength(batches, 1);
    assertStringIncludes(error.message, "sqs:DeleteMessage");
  });

  it("attributes the handler's own AWS calls to the task Role", async () => {
    // Given a consuming container that writes an SSM parameter through an
    // ordinary SDK client.
    using simSdk = new SimSdk();

    simSdk.intercept(SSMClient);

    const { simAws, queueUrl } = await simAwsWithConsumingService({
      simAws: simSdk.simAws,
      roleActions: [...sqsConsumingActions, "ssm:PutParameter"],
      roleResource: "*",
      onBatch: async (messages): Promise<void> => {
        await new SSMClient({}).send(
          new PutParameterCommand({
            Name: "/orders/last-handled",
            Value: messages[0]?.Body ?? "",
            Type: "String",
          }),
        );
      },
    });

    // When it handles a message.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // Then simulated IAM allowed the write, so the parameter is there.
    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/orders/last-handled" }));

    assertIdentical(read.Parameter?.Value, "order-1");
  });

  it("refuses a handler's own AWS call the task Role has no policy for", async () => {
    // Given a consuming container whose task Role may poll and nothing else.
    using simSdk = new SimSdk();

    simSdk.intercept(SSMClient);

    const failures: unknown[] = [];
    const { simAws, queueUrl } = await simAwsWithConsumingService({
      simAws: simSdk.simAws,
      onBatch: async (): Promise<void> => {
        try {
          await new SSMClient({}).send(
            new PutParameterCommand({
              Name: "/orders/last-handled",
              Value: "order-1",
              Type: "String",
            }),
          );
        } catch (error) {
          failures.push(error);
        }
      },
    });

    // When it handles a message.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // Then the write was refused rather than being allowed by whoever created
    // the service.
    assertArrayLength(failures, 1);
    assertStringIncludes(String(failures[0]), "ssm:PutParameter");
  });
});
