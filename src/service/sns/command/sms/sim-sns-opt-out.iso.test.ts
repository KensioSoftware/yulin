import {
  CheckIfPhoneNumberIsOptedOutCommand,
  ListPhoneNumbersOptedOutCommand,
  OptInPhoneNumberCommand,
  PublishCommand,
} from "@aws-sdk/client-sns";
import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimSnsInvalidParameterException } from "../../error/sim-sns.error.js";

const phoneNumber = "+15550100";
const otherNumber = "+15550101";

describe("SNS phone number opt-out list", () => {
  it("reports a number the simulator opted out", async () => {
    // Given a number that has replied STOP.
    const sns = new SimAws().sns();

    sns.optOutPhoneNumber(phoneNumber);

    // When each number is checked.
    const optedOut = await sns.checkIfPhoneNumberIsOptedOut(
      new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber }),
    );
    const other = await sns.checkIfPhoneNumberIsOptedOut(
      new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber: otherNumber }),
    );

    // Then only the one that replied STOP is opted out.
    assertTrue(optedOut.isOptedOut);
    assertFalse(other.isOptedOut);
  });

  it("lists the numbers in the order they were opted out", async () => {
    // Given two numbers that have replied STOP.
    const sns = new SimAws().sns();

    sns.optOutPhoneNumber(otherNumber);
    sns.optOutPhoneNumber(phoneNumber);

    // When the list is read.
    const listed = await sns.listPhoneNumbersOptedOut(
      new ListPhoneNumbersOptedOutCommand({}),
    );

    // Then both are on it, oldest first, and one page holds them.
    assertArrayEquals(listed.phoneNumbers ?? [], [otherNumber, phoneNumber]);
    assertUndefined(listed.nextToken);
  });

  it("takes a number back off the list", async () => {
    // Given a number on the opt-out list.
    const sns = new SimAws().sns();

    sns.optOutPhoneNumber(phoneNumber);

    // When it is opted back in.
    await sns.optInPhoneNumber(new OptInPhoneNumberCommand({ phoneNumber }));

    // Then the list is empty again.
    const listed = await sns.listPhoneNumbersOptedOut(
      new ListPhoneNumbersOptedOutCommand({}),
    );

    assertArrayLength(listed.phoneNumbers ?? [], 0);
  });

  it("takes an opt-in for a number that was never opted out", async () => {
    // Given a simulated SNS with an empty opt-out list.
    const sns = new SimAws().sns();

    // When a number that was never on the list is opted in.
    await sns.optInPhoneNumber(new OptInPhoneNumberCommand({ phoneNumber }));

    // Then it succeeds and changes nothing, as it does on real SNS.
    const listed = await sns.listPhoneNumbersOptedOut(
      new ListPhoneNumbersOptedOutCommand({}),
    );

    assertArrayLength(listed.phoneNumbers ?? [], 0);
  });

  it("refuses a phone number that is not in E.164 form", async () => {
    // Given a simulated SNS.
    const sns = new SimAws().sns();

    // When a badly formatted number reaches either command that takes one.
    const errors = await Promise.all([
      assertThrowsErrorAsync(async () => {
        await sns.checkIfPhoneNumberIsOptedOut(
          new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber: "5550100" }),
        );
      }),
      assertThrowsErrorAsync(async () => {
        await sns.optInPhoneNumber(
          new OptInPhoneNumberCommand({ phoneNumber: "5550100" }),
        );
      }),
    ]);

    // Then both are refused.
    for (const error of errors) {
      assertInstanceOf(error, SimSnsInvalidParameterException);
    }
  });

  it("keeps one Region's opt-out list out of another", async () => {
    // Given a number opted out in one Region.
    const simAws = new SimAws();

    simAws.region("eu-west-2").account().sns().optOutPhoneNumber(phoneNumber);

    // When the other Region publishes to it.
    await simAws
      .sns()
      .publish(new PublishCommand({ PhoneNumber: phoneNumber, Message: "hi" }));

    // Then that Region delivered it, since the opt-out list is scoped the way
    // topics are.
    const [sms] = simAws.sns().sentSmsMessages();

    assertFalse(sms?.suppressed);
  });
});
