import {
  CreateTopicCommand,
  DeleteTopicCommand,
  GetTopicAttributesCommand,
  ListTopicsCommand,
  SetTopicAttributesCommand,
} from "@aws-sdk/client-sns";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSnsInvalidParameterException,
  SimSnsNotFoundException,
} from "../../error/sim-sns.error.js";

describe("SNS topic commands", () => {
  it("creates a topic with an ARN naming its Account and Region", async () => {
    // Given a simulated AWS in one Account and Region.
    const simAws = new SimAws({
      defaultAccountId: "111111111111",
      defaultRegionName: "eu-west-2",
    });

    // When a topic is created.
    const created = await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "orders" }));

    // Then the ARN carries the name with no resource type in front of it.
    assertIdentical(
      created.TopicArn,
      "arn:aws:sns:eu-west-2:111111111111:orders",
    );

    // And the topic is there under that name.
    assertNonNullable(simAws.sns().findTopic("orders"));
  });

  it("reports the topic in a listing and in its attributes", async () => {
    // Given a created topic.
    const simAws = new SimAws();
    const created = await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "orders" }));

    // When the topics are listed and the topic's attributes are read.
    const listed = await simAws.sns().listTopics(new ListTopicsCommand({}));
    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: created.TopicArn }),
      );

    // Then the listing names it by ARN.
    assertArrayEquals(
      listed.Topics?.map((topic) => topic.TopicArn),
      ["arn:aws:sns:us-east-1:888888888888:orders"],
    );
    assertUndefined(listed.NextToken);

    // And its attributes name it, its owner, and an empty display name.
    assertNonNullable(read.Attributes);
    assertIdentical(read.Attributes["TopicArn"], created.TopicArn);
    assertIdentical(read.Attributes["Owner"], "888888888888");
    assertIdentical(read.Attributes["DisplayName"], "");
  });

  it("answers a repeated create with the same ARN, leaving attributes alone", async () => {
    // Given a topic with a display name.
    const simAws = new SimAws();
    const created = await simAws.sns().createTopic(
      new CreateTopicCommand({
        Name: "orders",
        Attributes: { DisplayName: "Orders" },
      }),
    );

    // When it is created again with a different display name.
    const again = await simAws.sns().createTopic(
      new CreateTopicCommand({
        Name: "orders",
        Attributes: { DisplayName: "Something else" },
      }),
    );

    // Then the existing topic's ARN comes back, and it is unchanged.
    assertIdentical(again.TopicArn, created.TopicArn);

    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: created.TopicArn }),
      );

    assertIdentical(read.Attributes?.["DisplayName"], "Orders");
  });

  it("lists topics a page at a time", async () => {
    // Given more topics than one listing page holds.
    const simAws = new SimAws();
    for (let index = 0; index < 101; index += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await simAws
        .sns()
        .createTopic(
          new CreateTopicCommand({ Name: `orders-${String(index)}` }),
        );
    }

    // When they are listed, following the token to the second page.
    const first = await simAws.sns().listTopics(new ListTopicsCommand({}));
    const second = await simAws
      .sns()
      .listTopics(new ListTopicsCommand({ NextToken: first.NextToken }));

    // Then the first page holds the hundred topics real SNS pages at.
    assertIdentical(first.Topics?.length, 100);
    assertIdentical(first.NextToken, "100");

    // And the second holds the rest, with nothing after it.
    assertIdentical(second.Topics?.length, 1);
    assertUndefined(second.NextToken);
  });

  it("refuses a continuation token it did not issue", async () => {
    // Given a topic to list.
    const simAws = new SimAws();
    await simAws.sns().createTopic(new CreateTopicCommand({ Name: "orders" }));

    // When a made-up token is passed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .listTopics(new ListTopicsCommand({ NextToken: "not-a-token" }));
    });

    // Then it is refused rather than answered from the beginning.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });

  it("deletes a topic and frees its name straight away", async () => {
    // Given a topic with a display name set on it.
    const simAws = new SimAws();
    const created = await simAws.sns().createTopic(
      new CreateTopicCommand({
        Name: "orders",
        Attributes: { DisplayName: "Orders" },
      }),
    );

    // When it is deleted and created again.
    await simAws
      .sns()
      .deleteTopic(new DeleteTopicCommand({ TopicArn: created.TopicArn }));

    const recreated = await simAws
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "orders" }));

    // Then the name was free at once, unlike an SQS queue name.
    assertIdentical(recreated.TopicArn, created.TopicArn);

    // And the topic that came back is a new one, with nothing set on it.
    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: created.TopicArn }),
      );

    assertIdentical(read.Attributes?.["DisplayName"], "");
  });

  it("takes a delete of a topic that is not there", async () => {
    // Given a simulated AWS with no topics.
    const simAws = new SimAws();

    // When a topic that never existed is deleted.
    await simAws.sns().deleteTopic(
      new DeleteTopicCommand({
        TopicArn: "arn:aws:sns:us-east-1:888888888888:orders",
      }),
    );

    // Then nothing is thrown, as real SNS treats DeleteTopic as idempotent.
    assertUndefined(simAws.sns().findTopic("orders"));
  });

  it("refuses to reach a topic that does not exist", async () => {
    // Given a simulated AWS with no topics.
    const simAws = new SimAws();

    // When one is asked about by ARN.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().setTopicAttributes(
        new SetTopicAttributesCommand({
          TopicArn: "arn:aws:sns:us-east-1:888888888888:orders",
          AttributeName: "DisplayName",
          AttributeValue: "Orders",
        }),
      );
    });

    // Then it is reported the way real SNS reports it.
    assertInstanceOf(error, SimSnsNotFoundException);
  });
});
