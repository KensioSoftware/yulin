import {
  CreateTopicCommand,
  DeleteTopicCommand,
  GetTopicAttributesCommand,
} from "@aws-sdk/client-sns";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSnsInvalidParameterException,
  SimSnsNotFoundException,
  SimSnsUnsimulatedInputException,
} from "../../error/sim-sns.error.js";

describe("SNS topic validation", () => {
  it("refuses a FIFO topic name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a FIFO topic is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .createTopic(new CreateTopicCommand({ Name: "orders.fifo" }));
    });

    // Then it is refused rather than created as a standard topic.
    assertInstanceOf(error, SimSnsUnsimulatedInputException);
    assertStringIncludes(error.message, "FIFO");
  });

  it("refuses a topic name real SNS would refuse", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a name with a disallowed character is used.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .createTopic(new CreateTopicCommand({ Name: "orders topic" }));
    });

    // Then it is refused.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });

  it("refuses a create with no topic name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a topic is created with no name.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().createTopic({ input: {} });
    });

    // Then the missing input is reported.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });

  it("refuses topic tags rather than dropping them", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a topic is created with tags.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().createTopic(
        new CreateTopicCommand({
          Name: "orders",
          Tags: [{ Key: "Team", Value: "payments" }],
        }),
      );
    });

    // Then it is refused, since tags are not simulated.
    assertInstanceOf(error, SimSnsUnsimulatedInputException);
  });

  it("refuses a data protection policy rather than ignoring it", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a topic is created with one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().createTopic(
        new CreateTopicCommand({
          Name: "orders",
          DataProtectionPolicy: JSON.stringify({ Name: "redact" }),
        }),
      );
    });

    // Then it is refused, since nothing here would redact anything.
    assertInstanceOf(error, SimSnsUnsimulatedInputException);
  });

  it("refuses a request with no topic ARN", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a topic is asked about without naming one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().getTopicAttributes({ input: {} });
    });

    // Then the missing input is reported.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });

  it("refuses an ARN that is not a topic ARN", async () => {
    // Given a topic and a subscription ARN naming it.
    const simAws = new SimAws();
    await simAws.sns().createTopic(new CreateTopicCommand({ Name: "orders" }));

    // When the subscription ARN is used as a topic ARN.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().getTopicAttributes(
        new GetTopicAttributesCommand({
          TopicArn:
            "arn:aws:sns:us-east-1:888888888888:orders:5b6d8e1a-0b1f-4d3c-9d0e-2f8a7c6b5a4d",
        }),
      );
    });

    // Then it is refused rather than read as a topic named `orders`.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });

  it("refuses a queue ARN offered as a topic ARN", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When an ARN of another service is used.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().deleteTopic(
        new DeleteTopicCommand({
          TopicArn: "arn:aws:sqs:us-east-1:888888888888:orders",
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });

  it("refuses a topic ARN naming another Account", async () => {
    // Given a topic named `orders` in this Account.
    const simAws = new SimAws({ defaultAccountId: "111111111111" });
    await simAws.sns().createTopic(new CreateTopicCommand({ Name: "orders" }));

    // When another Account's topic of the same name is asked about.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().getTopicAttributes(
        new GetTopicAttributesCommand({
          TopicArn: "arn:aws:sns:us-east-1:222222222222:orders",
        }),
      );
    });

    // Then it reaches nothing, rather than being answered by the local topic.
    assertInstanceOf(error, SimSnsNotFoundException);
    assertStringIncludes(error.message, "222222222222");
  });

  it("refuses a topic ARN naming another Region", async () => {
    // Given a topic in one Region.
    const simAws = new SimAws();
    const created = await simAws
      .account("222222222222")
      .region("eu-west-2")
      .sns()
      .createTopic(new CreateTopicCommand({ Name: "orders" }));

    // When it is reached through another Region's simulated SNS.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .account("222222222222")
        .region("us-east-1")
        .sns()
        .getTopicAttributes(
          new GetTopicAttributesCommand({ TopicArn: created.TopicArn }),
        );
    });

    // Then it reaches nothing there either.
    assertInstanceOf(error, SimSnsNotFoundException);
  });
});
