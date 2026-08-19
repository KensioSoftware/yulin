import { CreateEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  type SimLambdaAliasedFunction,
  simLambdaAliasedFunction,
} from "../../../../../test/lambda/alias-fixture.js";
import {
  makePollingRole,
  makeSourceQueue,
} from "../../../../../test/lambda/event-source-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";

interface SimLambdaQualifiedMapping {
  readonly simAws: SimAws;
  readonly queueUrl: string;
  readonly consumer: SimLambdaAliasedFunction;
}

/**
 * A queue and a function with an alias, ready to be mapped to one another.
 *
 * The role is made before the function, because a mapping only polls as a role
 * that may read the queue.
 */
async function queueAndAliasedConsumer(): Promise<SimLambdaQualifiedMapping> {
  const simAws = new SimAws();
  const queue = await makeSourceQueue(simAws);
  const roleArn = await makePollingRole(simAws, queue.queueArn);
  const consumer = await simLambdaAliasedFunction(simAws, "order-consumer", {
    roleArn,
  });

  return { simAws, queueUrl: queue.queueUrl, consumer };
}

describe("An event source mapping onto a Lambda alias", () => {
  it("delivers to the version the alias points at", async () => {
    // Given a queue and a function with an alias.
    const { simAws, queueUrl, consumer } = await queueAndAliasedConsumer();

    // When a mapping names the alias and a message arrives.
    const mapping = await simAws.lambda().createEventSourceMapping(
      new CreateEventSourceMappingCommand({
        EventSourceArn: simAws.sqs().findQueue("orders")?.arn.value,
        FunctionName: `${consumer.functionArn}:live`,
      }),
    );

    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // Then the version behind the alias ran, and the mapping reports the alias
    // it was pointed at rather than the version behind it.
    assertArrayEquals(consumer.ranAs, [consumer.version]);
    assertIdentical(mapping.FunctionArn, consumer.aliasArn);
  });

  it("refuses a qualifier naming no version or alias", async () => {
    // Given a queue and a function with an alias.
    const { simAws, consumer } = await queueAndAliasedConsumer();

    // When a mapping names an alias the function does not have.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.lambda().createEventSourceMapping(
          new CreateEventSourceMappingCommand({
            EventSourceArn: simAws.sqs().findQueue("orders")?.arn.value,
            FunctionName: `${consumer.functionArn}:old`,
          }),
        ),
    );

    // Then the mapping is refused where it is created, the same way one onto a
    // function that is not there is.
    assertIdentical(error.name, "ResourceNotFoundException");
    assertStringIncludes(error.message, "Function not found");
  });
});
