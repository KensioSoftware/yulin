import { OptInPhoneNumberCommand, PublishCommand } from "@aws-sdk/client-sns";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";

const sentAt = new Date("2026-08-17T09:00:00.000Z");

/** The number every test here texts. */
const phoneNumber = "+15550100";

describe("SNS publish to a phone number", () => {
  it("records the SMS it would have sent", async () => {
    // Given a simulated SNS with a fixed clock.
    const simAws = new SimAws({ clock: new SimFixedClock(sentAt) });

    // When a message is published straight to a phone number.
    const published = await simAws
      .sns()
      .publish(
        new PublishCommand({ PhoneNumber: phoneNumber, Message: "code 12345" }),
      );

    // Then SNS answered with a message id, and kept what it would have texted.
    const [sms] = simAws.sns().sentSmsMessages();

    assertNonNullable(sms);
    assertIdentical(sms.messageId, published.MessageId);
    assertIdentical(sms.phoneNumber, phoneNumber);
    assertIdentical(sms.message, "code 12345");
    assertIdentical(sms.sentDate.getTime(), sentAt.getTime());
    assertFalse(sms.suppressed);
  });

  it("records the sender id and the message type", async () => {
    // Given a simulated SNS.
    const simAws = new SimAws();

    // When a message carries the SMS attributes real SNS reads.
    await simAws.sns().publish(
      new PublishCommand({
        PhoneNumber: phoneNumber,
        Message: "code 12345",
        MessageAttributes: {
          "AWS.SNS.SMS.SenderID": { DataType: "String", StringValue: "Orders" },
          "AWS.SNS.SMS.SMSType": {
            DataType: "String",
            StringValue: "Transactional",
          },
        },
      }),
    );

    // Then both are on the record, along with the attributes they came from.
    const [sms] = simAws.sns().sentSmsMessages();

    assertNonNullable(sms);
    assertIdentical(sms.senderId, "Orders");
    assertIdentical(sms.smsType, "Transactional");
    assertArrayLength(sms.attributes.all, 2);
  });

  it("reports neither where the publish set neither", async () => {
    // Given a simulated SNS.
    const simAws = new SimAws();

    // When a message carries no attributes.
    await simAws
      .sns()
      .publish(
        new PublishCommand({ PhoneNumber: phoneNumber, Message: "code 12345" }),
      );

    // Then the record reports nothing for either, so a test asserting on a
    // sender id finds the absence rather than an empty string.
    const [sms] = simAws.sns().sentSmsMessages();

    assertNonNullable(sms);
    assertUndefined(sms.senderId);
    assertUndefined(sms.smsType);
  });

  it("keeps the messages in the order they were published", async () => {
    // Given a simulated SNS.
    const simAws = new SimAws();

    // When two messages go to the same number.
    await simAws
      .sns()
      .publish(
        new PublishCommand({ PhoneNumber: phoneNumber, Message: "one" }),
      );
    await simAws
      .sns()
      .publish(
        new PublishCommand({ PhoneNumber: phoneNumber, Message: "two" }),
      );

    // Then the first message of the flow is the first one recorded.
    const [first, second] = simAws.sns().sentSmsMessages();

    assertIdentical(first?.message, "one");
    assertIdentical(second?.message, "two");
  });

  it("accepts a publish to an opted-out number and suppresses it", async () => {
    // Given a number that has replied STOP.
    const simAws = new SimAws();

    simAws.sns().optOutPhoneNumber(phoneNumber);

    // When a message is published to it.
    const published = await simAws
      .sns()
      .publish(
        new PublishCommand({ PhoneNumber: phoneNumber, Message: "code 12345" }),
      );

    // Then the publish succeeded the way real SNS succeeds, and the record
    // says the opt-out list stopped the message.
    assertNonNullable(published.MessageId);

    const [sms] = simAws.sns().sentSmsMessages();

    assertNonNullable(sms);
    assertTrue(sms.suppressed);
    assertIdentical(sms.messageId, published.MessageId);
  });

  it("sends again once the number is opted back in", async () => {
    // Given a number that was opted out and then opted back in.
    const simAws = new SimAws();

    simAws.sns().optOutPhoneNumber(phoneNumber);
    await simAws
      .sns()
      .optInPhoneNumber(new OptInPhoneNumberCommand({ phoneNumber }));

    // When a message is published to it.
    await simAws
      .sns()
      .publish(
        new PublishCommand({ PhoneNumber: phoneNumber, Message: "code 12345" }),
      );

    // Then the message would have arrived.
    const [sms] = simAws.sns().sentSmsMessages();

    assertFalse(sms?.suppressed);
  });

  it("keeps the messages of one Region out of another", async () => {
    // Given two Regions of one Account.
    const simAws = new SimAws();
    const london = simAws.region("eu-west-2").account().sns();

    // When a message is published in one of them.
    await london.publish(
      new PublishCommand({ PhoneNumber: phoneNumber, Message: "code 12345" }),
    );

    // Then the other Region has no record of it.
    assertArrayLength(london.sentSmsMessages(), 1);
    assertArrayEmpty(simAws.sns().sentSmsMessages());
  });
});
