import {
  PutAccountDetailsCommand,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { SimAws } from "../aws/sim-aws.js";
import type { SimSesV2 } from "./sim-ses-v2.js";

const sentAt = new Date("2026-08-16T09:00:00.000Z");

/**
 * A simulated SES with the sender verified. Still in the sandbox, so a test
 * using it either verifies its recipients too or calls `leaveTheSandbox`.
 */
function sendingSes(clock?: SimFixedClock): SimSesV2 {
  const ses = new SimAws(clock === undefined ? {} : { clock }).sesV2();

  ses.verifyIdentity("hello@example.com");

  return ses;
}

/** The smallest send that SES would accept. */
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

describe("SimSesV2 SendEmail", () => {
  it("records a message rather than delivering it", async () => {
    // Given a simulated SES with a verified sender and a fixed clock.
    const ses = sendingSes(new SimFixedClock(sentAt));

    ses.verifyIdentity("someone@example.org");

    // When a message is sent.
    const sent = await ses.sendEmail(new SendEmailCommand(welcome));

    // Then SES answered with a message id, and kept what it would have sent.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.messageId, sent.MessageId);
    assertIdentical(email.fromEmailAddress, "hello@example.com");
    assertArrayEquals(email.destination.toAddresses, ["someone@example.org"]);
    assertIdentical(email.subject, "Welcome");
    assertIdentical(email.body.text, "Hi there");
    assertIdentical(email.sentDate.getTime(), sentAt.getTime());
  });

  it("keeps the to, cc and bcc lists apart", async () => {
    // Given a simulated SES out of the sandbox, where recipients need no
    // identity of their own.
    const ses = sendingSes();

    await leaveTheSandbox(ses);

    // When a message goes to all three kinds of recipient.
    await ses.sendEmail(
      new SendEmailCommand({
        ...welcome,
        Destination: {
          ToAddresses: ["someone@example.org"],
          CcAddresses: ["copied@example.org"],
          BccAddresses: ["hidden@example.org"],
        },
      }),
    );

    // Then the record keeps them apart, so a test asserting a bcc was a bcc
    // still can, and `recipients` gathers all three.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertArrayEquals(email.destination.ccAddresses, ["copied@example.org"]);
    assertArrayEquals(email.destination.bccAddresses, ["hidden@example.org"]);
    assertArrayLength(email.recipients, 3);
  });

  it("records an HTML body and reports no text for it", async () => {
    // Given a simulated SES out of the sandbox.
    const ses = sendingSes();

    await leaveTheSandbox(ses);

    // When a message is sent with only an HTML body.
    await ses.sendEmail(
      new SendEmailCommand({
        ...welcome,
        Content: {
          Simple: {
            Subject: { Data: "Welcome" },
            Body: { Html: { Data: "<p>Hi there</p>" } },
          },
        },
      }),
    );

    // Then a test asserting on the text finds nothing rather than the markup.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.body.html, "<p>Hi there</p>");
    assertUndefined(email.body.text);
  });

  it("records the reply-to addresses and the configuration set name", async () => {
    // Given a simulated SES out of the sandbox.
    const ses = sendingSes();

    await leaveTheSandbox(ses);

    // When a message names both.
    await ses.sendEmail(
      new SendEmailCommand({
        ...welcome,
        ReplyToAddresses: ["support@example.com"],
        ConfigurationSetName: "transactional",
      }),
    );

    // Then both are kept. A configuration set does nothing here, but the name
    // is worth keeping so a test can assert the right one was used.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertArrayEquals(email.replyToAddresses, ["support@example.com"]);
    assertIdentical(email.configurationSetName, "transactional");
  });

  it("sends from an address written with a display name", async () => {
    // Given a simulated SES out of the sandbox with the address verified.
    const ses = sendingSes();

    await leaveTheSandbox(ses);

    // When the From value carries a display name around the address.
    await ses.sendEmail(
      new SendEmailCommand({
        ...welcome,
        FromEmailAddress: "Orders <hello@example.com>",
      }),
    );

    // Then the identity check read the address out of it, and the record kept
    // the value as it was given.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.fromEmailAddress, "Orders <hello@example.com>");
  });

  it("keeps sends in the order they were made", async () => {
    // Given a simulated SES out of the sandbox.
    const ses = sendingSes();

    await leaveTheSandbox(ses);

    // When two messages are sent.
    await ses.sendEmail(new SendEmailCommand(welcome));
    await ses.sendEmail(
      new SendEmailCommand({
        ...welcome,
        Content: {
          Simple: {
            Subject: { Data: "Your order" },
            Body: { Text: { Data: "On its way" } },
          },
        },
      }),
    );

    // Then the first message of the flow is the first one read back, which is
    // the assertion a test usually wants.
    assertArrayEquals(
      ses.sentEmails().map((email) => email.subject),
      ["Welcome", "Your order"],
    );
  });

  it("gives each message its own id", async () => {
    // Given a simulated SES out of the sandbox.
    const ses = sendingSes();

    await leaveTheSandbox(ses);

    // When the same message is sent twice.
    const first = await ses.sendEmail(new SendEmailCommand(welcome));
    const second = await ses.sendEmail(new SendEmailCommand(welcome));

    // Then the two are told apart by their ids, as they would be on AWS.
    assertNonNullable(first.MessageId);
    assertFalse(first.MessageId === second.MessageId);
  });

  it("records nothing when a send is refused", async () => {
    // Given a simulated SES out of the sandbox.
    const ses = sendingSes();

    await leaveTheSandbox(ses);

    // When a send fails.
    await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({ ...welcome, Destination: {} }),
      );
    });

    // Then nothing was recorded, so a test asserting no message went out is
    // not fooled by one SES never accepted.
    assertArrayEmpty(ses.sentEmails());
  });
});

/**
 * Take a simulated SES out of the sandbox, so a send is checked against its
 * sender alone.
 */
async function leaveTheSandbox(ses: SimSesV2): Promise<void> {
  await ses.putAccountDetails(
    new PutAccountDetailsCommand({
      MailType: "TRANSACTIONAL",
      WebsiteURL: "https://example.com",
      ProductionAccessEnabled: true,
    }),
  );
}
