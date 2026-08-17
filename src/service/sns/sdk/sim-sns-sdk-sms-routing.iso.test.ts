import {
  CheckIfPhoneNumberIsOptedOutCommand,
  ListPhoneNumbersOptedOutCommand,
  OptInPhoneNumberCommand,
  PublishCommand,
  SNSClient,
} from "@aws-sdk/client-sns";
import {
  assertArrayEquals,
  assertFalse,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

const phoneNumber = "+15550100";

describe("SNS SDK SMS interception", () => {
  it("routes every SMS Command through the intercepted client", async () => {
    // Given an intercepted SNS SDK client, with one number opted out through
    // the simulator the way a recipient replying STOP would.
    const simAws = new SimAws();

    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(SNSClient);

    simAws.sns().optOutPhoneNumber(phoneNumber);

    const client = new SNSClient({ region: "us-east-1" });

    // When ordinary SDK code texts the number and reads the opt-out list.
    const published = await client.send(
      new PublishCommand({ PhoneNumber: phoneNumber, Message: "code 12345" }),
    );
    const checked = await client.send(
      new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber }),
    );
    const listed = await client.send(new ListPhoneNumbersOptedOutCommand({}));

    await client.send(new OptInPhoneNumberCommand({ phoneNumber }));

    const afterOptIn = await client.send(
      new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber }),
    );

    // Then each command reached the simulation with nothing touching the
    // network.
    assertNonNullable(published.MessageId);
    assertTrue(checked.isOptedOut);
    assertArrayEquals(listed.phoneNumbers ?? [], [phoneNumber]);
    assertFalse(afterOptIn.isOptedOut);
  });
});
