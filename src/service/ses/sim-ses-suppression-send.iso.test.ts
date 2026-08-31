import {
  GetAccountCommand,
  GetSuppressedDestinationCommand,
  PutAccountSuppressionAttributesCommand,
  PutSuppressedDestinationCommand,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimSesBadRequestException,
  SimSesNotFoundException,
} from "./error/sim-ses.error.js";
import type { SimSesV2 } from "./sim-ses-v2.js";

const welcome = {
  FromEmailAddress: "hello@example.com",
  Destination: { ToAddresses: ["someone@example.org"] },
  Content: {
    Simple: {
      Subject: { Data: "Welcome" },
      Body: { Text: { Data: "Hi there" } },
    },
  },
} satisfies SendEmailCommandInput;

/**
 * A simulated SES with both ends of the welcome message verified.
 */
function sendingSes(): SimSesV2 {
  const ses = new SimAws().sesV2();

  ses.verifyIdentity("hello@example.com");
  ses.verifyIdentity("someone@example.org");

  return ses;
}

describe("SimSesV2 sending to a suppressed address", () => {
  it("accepts the message and records who was held back", async () => {
    // Given a recipient on the suppression list.
    const ses = sendingSes();

    await suppress(ses, "someone@example.org", "BOUNCE");

    // When a message is sent to that recipient.
    const sent = await ses.sendEmail(new SendEmailCommand(welcome));

    // Then SES accepted it, the way a real account does, and the record says
    // it reached nobody.
    assertNonNullable(sent.MessageId);

    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertArrayEquals(
      email.suppressedRecipients.map((recipient) => recipient.emailAddress),
      ["someone@example.org"],
    );
    assertIdentical(email.suppressedRecipients[0]?.reason, "BOUNCE");
    assertTrue(email.isFullySuppressed);
  });

  it("holds back one recipient and delivers to the rest", async () => {
    // Given two recipients, one of them suppressed.
    const ses = sendingSes();

    ses.verifyIdentity("other@example.org");
    await suppress(ses, "someone@example.org", "BOUNCE");

    // When a message goes to both.
    await ses.sendEmail(
      new SendEmailCommand({
        ...welcome,
        Destination: {
          ToAddresses: ["other@example.org"],
          CcAddresses: ["someone@example.org"],
        },
      }),
    );

    // Then only the suppressed one is held back, and the message was not
    // fully suppressed.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertArrayEquals(
      email.suppressedRecipients.map((recipient) => recipient.emailAddress),
      ["someone@example.org"],
    );
    assertFalse(email.isFullySuppressed);
  });

  it("delivers to an address listed for a reason the account is not suppressing", async () => {
    // Given an account suppressing bounces only, and an address listed for a
    // complaint.
    const ses = sendingSes();

    await ses.putAccountSuppressionAttributes(
      new PutAccountSuppressionAttributesCommand({
        SuppressedReasons: ["BOUNCE"],
      }),
    );
    await suppress(ses, "someone@example.org", "COMPLAINT");

    // When a message goes to it.
    await ses.sendEmail(new SendEmailCommand(welcome));

    // Then nothing is held back. The reasons have to match, which is the part
    // of the suppression rules most easily got wrong.
    assertArrayEmpty(ses.sentEmails()[0]?.suppressedRecipients);
  });

  it("delivers to a listed address once the account stops suppressing", async () => {
    // Given a suppressed address on an account with its list turned off.
    const ses = sendingSes();

    await suppress(ses, "someone@example.org", "BOUNCE");
    await ses.putAccountSuppressionAttributes(
      new PutAccountSuppressionAttributesCommand({ SuppressedReasons: [] }),
    );

    // When a message goes to it.
    await ses.sendEmail(new SendEmailCommand(welcome));

    // Then the address stays on the list and the message is held back from
    // nobody.
    assertArrayLength(ses.suppressedDestinations(), 1);
    assertArrayEmpty(ses.sentEmails()[0]?.suppressedRecipients);
  });

  it("matches a recipient against the list without regard to case", async () => {
    // Given an address suppressed in lower case, at a verified domain so that
    // the identity check is not what decides this.
    const ses = sendingSes();

    ses.verifyIdentity("example.org");
    await suppress(ses, "someone@example.org", "BOUNCE");

    // When a message goes to the same address written differently, with a
    // display name around it.
    await ses.sendEmail(
      new SendEmailCommand({
        ...welcome,
        Destination: { ToAddresses: ["Someone <SOMEONE@example.org>"] },
      }),
    );

    // Then it is held back, and the record keeps the address as the message
    // wrote it.
    assertArrayEquals(
      ses
        .sentEmails()[0]
        ?.suppressedRecipients.map((recipient) => recipient.emailAddress),
      ["Someone <SOMEONE@example.org>"],
    );
  });

  it("manages the list by the exact address it was given", async () => {
    // Given an address suppressed in mixed case.
    const ses = new SimAws().sesV2();

    await suppress(ses, "Someone@example.org", "BOUNCE");

    // When it is read back in lower case.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.getSuppressedDestination(
        new GetSuppressedDestinationCommand({
          EmailAddress: "someone@example.org",
        }),
      );
    });

    // Then it is not found. Managing the list is case sensitive on real SES
    // where sending is not.
    assertInstanceOf(error, SimSesNotFoundException);
  });

  it("records nothing suppressed on an ordinary send", async () => {
    // Given nothing on the suppression list.
    const ses = sendingSes();

    // When a message is sent.
    await ses.sendEmail(new SendEmailCommand(welcome));

    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertArrayEmpty(email.suppressedRecipients);
    assertFalse(email.isFullySuppressed);
  });
});

describe("SimSesV2 account suppression attributes", () => {
  it("suppresses both reasons to begin with", async () => {
    // Given a simulated SES nobody has configured.
    const ses = new SimAws().sesV2();

    // When the account is read.
    const account = await ses.getAccount(new GetAccountCommand({}));

    // Then it suppresses for both reasons, where every account opened after
    // November 2019 starts.
    assertArrayEquals(account.SuppressionAttributes?.SuppressedReasons, [
      "BOUNCE",
      "COMPLAINT",
    ]);
  });

  it("sets the reasons the account suppresses for", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When the account is set to suppress complaints only.
    await ses.putAccountSuppressionAttributes(
      new PutAccountSuppressionAttributesCommand({
        SuppressedReasons: ["COMPLAINT"],
      }),
    );
    const account = await ses.getAccount(new GetAccountCommand({}));

    assertArrayEquals(account.SuppressionAttributes?.SuppressedReasons, [
      "COMPLAINT",
    ]);
  });

  it("turns the suppression list off with no reasons at all", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When the attributes are put with nothing in them, which is what the
    // console's Enabled box does.
    await ses.putAccountSuppressionAttributes();
    const account = await ses.getAccount(new GetAccountCommand({}));

    assertArrayEmpty(account.SuppressionAttributes?.SuppressedReasons);
  });

  it("refuses a reason real SES has no name for", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When the account is asked to suppress for something else.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.putAccountSuppressionAttributes(
        new PutAccountSuppressionAttributesCommand({
          SuppressedReasons: ["UNSUBSCRIBE" as "BOUNCE"],
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });
});

/**
 * Put an address on the list through the command, since that is the path an
 * application takes.
 */
async function suppress(
  ses: SimSesV2,
  emailAddress: string,
  reason: "BOUNCE" | "COMPLAINT",
): Promise<void> {
  await ses.putSuppressedDestination(
    new PutSuppressedDestinationCommand({
      EmailAddress: emailAddress,
      Reason: reason,
    }),
  );
}
