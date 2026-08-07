import {
  CreateTopicCommand,
  DeleteTopicCommand,
  GetTopicAttributesCommand,
  ListTopicsCommand,
  PublishBatchCommand,
  PublishCommand,
  SetTopicAttributesCommand,
  SNSClient,
} from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

describe("SNS SDK interception", () => {
  it("routes an intercepted SNSClient to simulated SNS", async () => {
    // Given an intercepted SNS SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(SNSClient);

    const client = new SNSClient({ region: "eu-west-2" });

    // When ordinary SDK code creates a topic and publishes to it.
    const created = await client.send(
      new CreateTopicCommand({ Name: "orders" }),
    );
    const published = await client.send(
      new PublishCommand({ TopicArn: created.TopicArn, Message: "order-1" }),
    );

    // Then it works with nothing touching the network, and the ARN names the
    // Region the client was configured for.
    assertStringIncludes(String(created.TopicArn), "arn:aws:sns:eu-west-2:");
    assertNonNullable(published.MessageId);
  });

  it("routes every supported Command through the intercepted client", async () => {
    // Given an intercepted SNS SDK client with a topic.
    using simSdk = new SimSdk();
    simSdk.intercept(SNSClient);

    const client = new SNSClient({ region: "us-east-1" });
    const created = await client.send(
      new CreateTopicCommand({ Name: "orders" }),
    );
    const topicArn = created.TopicArn;

    // When each of the remaining operations is used.
    await client.send(
      new SetTopicAttributesCommand({
        TopicArn: topicArn,
        AttributeName: "DisplayName",
        AttributeValue: "Orders",
      }),
    );

    const read = await client.send(
      new GetTopicAttributesCommand({ TopicArn: topicArn }),
    );
    const listed = await client.send(new ListTopicsCommand({}));
    const batched = await client.send(
      new PublishBatchCommand({
        TopicArn: topicArn,
        PublishBatchRequestEntries: [{ Id: "one", Message: "order-1" }],
      }),
    );

    await client.send(new DeleteTopicCommand({ TopicArn: topicArn }));

    // Then each reached the simulated SNS this SimSdk owns.
    assertIdentical(read.Attributes?.["DisplayName"], "Orders");
    assertArrayLength(listed.Topics, 1);
    assertArrayLength(batched.Successful, 1);
    assertUndefined(simSdk.simAws.sns().findTopic("orders"));
  });
});
