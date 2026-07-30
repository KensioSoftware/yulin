import {
  DeleteEventSourceMappingCommand,
  GetEventSourceMappingCommand,
  ListEventSourceMappingsCommand,
} from "@aws-sdk/client-lambda";
import { PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithSqsEventSource } from "../../../../../test/lambda/event-source-fixture.js";

describe("sim Lambda event source mapping commands", () => {
  it("reads one mapping back by its UUID", async () => {
    // Given a mapping between a queue and a function.
    const { simAws, uuid, queueArn } = await simAwsWithSqsEventSource();

    // When it is read back.
    const mapping = await simAws
      .lambda()
      .getEventSourceMapping(new GetEventSourceMappingCommand({ UUID: uuid }));

    // Then it reports what it was created with.
    assertIdentical(mapping.UUID, uuid);
    assertIdentical(mapping.EventSourceArn, queueArn);
    assertIdentical(mapping.BatchSize, 10);
  });

  it("refuses a UUID belonging to no mapping", async () => {
    // Given a simulated AWS with one mapping on it.
    const { simAws } = await simAwsWithSqsEventSource();

    // When another UUID is read.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.lambda().getEventSourceMapping(
        new GetEventSourceMappingCommand({
          UUID: "1a4b6c8d-0000-0000-0000-000000000000",
        }),
      );
    });

    // Then it is reported as missing.
    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("lists the mappings of a queue", async () => {
    // Given a mapping between a queue and a function.
    const { simAws, queueArn, uuid } = await simAwsWithSqsEventSource();

    // When the mappings of that queue are listed.
    const listed = await simAws
      .lambda()
      .listEventSourceMappings(
        new ListEventSourceMappingsCommand({ EventSourceArn: queueArn }),
      );

    // Then the mapping is in the listing.
    assertArrayLength(listed.EventSourceMappings, 1);
    assertIdentical(listed.EventSourceMappings[0].UUID, uuid);
  });

  it("leaves out the mappings of another queue", async () => {
    // Given a mapping between a queue and a function.
    const { simAws } = await simAwsWithSqsEventSource();

    // When the mappings of a different queue are listed.
    const listed = await simAws.lambda().listEventSourceMappings(
      new ListEventSourceMappingsCommand({
        EventSourceArn: `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:invoices`,
      }),
    );

    // Then nothing is listed.
    assertArrayLength(listed.EventSourceMappings, 0);
  });

  it("stops delivering once the mapping is deleted", async () => {
    // Given a mapping that has delivered a message.
    const { simAws, uuid, queueUrl, events } = await simAwsWithSqsEventSource();

    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    assertArrayLength(events, 1);

    // When the mapping is deleted and another message is sent.
    await simAws
      .lambda()
      .deleteEventSourceMapping(
        new DeleteEventSourceMappingCommand({ UUID: uuid }),
      );
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-2" }),
      );
    await simAws.backgroundTasksComplete();

    // Then the function was not given it.
    assertArrayLength(events, 1);
  });

  it("forgets a deleted mapping", async () => {
    // Given a deleted mapping.
    const { simAws, uuid } = await simAwsWithSqsEventSource();

    await simAws
      .lambda()
      .deleteEventSourceMapping(
        new DeleteEventSourceMappingCommand({ UUID: uuid }),
      );

    // When it is read back.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .lambda()
        .getEventSourceMapping(
          new GetEventSourceMappingCommand({ UUID: uuid }),
        );
    });

    // Then it is gone.
    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("authorizes reading a mapping against the function", async () => {
    // Given a caller allowed nothing on the function.
    const { simAws, uuid } = await simAwsWithSqsEventSource();

    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "OrderConsumerRole",
        PolicyName: "NoLambdaActions",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Deny",
            Action: "lambda:GetEventSourceMapping",
            Resource: "*",
          },
        }),
      }),
    );

    // When that caller reads the mapping.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .lambda()
        .getEventSourceMapping(
          new GetEventSourceMappingCommand({ UUID: uuid }),
          {
            caller: {
              kind: "arn",
              arn: `arn:aws:iam::${simAws.defaultAccountId}:role/OrderConsumerRole`,
            },
          },
        );
    });

    // Then simulated IAM refuses it.
    assertIdentical(error.name, "AccessDenied");
  });
});
