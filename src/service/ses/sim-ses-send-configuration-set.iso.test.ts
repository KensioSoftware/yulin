import {
  CreateConfigurationSetCommand,
  CreateEmailIdentityCommand,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayEmpty,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { SimSesSendingPausedException } from "./error/sim-ses.error.js";
import type { SimSesV2 } from "./sim-ses-v2.js";

/** The smallest send that SES would accept, naming no configuration set. */
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
 * A simulated SES with both ends of the welcome message verified, and a
 * configuration set for a send or an identity to name.
 */
async function sendingSes(): Promise<SimSesV2> {
  const ses = new SimAws().sesV2();

  ses.verifyIdentity("someone@example.org");

  await ses.createConfigurationSet(
    new CreateConfigurationSetCommand({
      ConfigurationSetName: "transactional",
    }),
  );

  return ses;
}

/**
 * Create the sending identity with a configuration set attached, then treat it
 * as verified the way a test standing in for the confirmation link does.
 */
async function attachedSender(
  ses: SimSesV2,
  emailIdentity: string,
  configurationSetName: string,
): Promise<void> {
  await ses.createEmailIdentity(
    new CreateEmailIdentityCommand({
      EmailIdentity: emailIdentity,
      ConfigurationSetName: configurationSetName,
    }),
  );

  ses.verifyIdentity(emailIdentity);
}

describe("SimSesV2 sending through a configuration set", () => {
  it("sends through the set the identity was created with", async () => {
    // Given a sending identity carrying a configuration set.
    const ses = await sendingSes();

    await attachedSender(ses, "hello@example.com", "transactional");

    // When a message names no set of its own.
    await ses.sendEmail(new SendEmailCommand(welcome));

    // Then the record carries the identity's set, so a test asserts the
    // message went through the right one without the send naming it.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.configurationSetName, "transactional");
  });

  it("prefers the set the send names over the identity's", async () => {
    // Given an identity attached to one set and a second set beside it.
    const ses = await sendingSes();

    await attachedSender(ses, "hello@example.com", "transactional");
    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({ ConfigurationSetName: "marketing" }),
    );

    // When a message names the second one.
    await ses.sendEmail(
      new SendEmailCommand({ ...welcome, ConfigurationSetName: "marketing" }),
    );

    // Then that is the set the message went through.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.configurationSetName, "marketing");
  });

  it("falls back to the set the sending domain carries", async () => {
    // Given a domain identity with a set, and an address at it that is no
    // identity of its own.
    const ses = await sendingSes();

    await attachedSender(ses, "example.com", "transactional");

    // When a message is sent from that address.
    await ses.sendEmail(new SendEmailCommand(welcome));

    // Then it went through the domain's set, as a message from any mailbox at
    // a domain identity does.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.configurationSetName, "transactional");
  });

  it("prefers the sending address's set over its domain's", async () => {
    // Given both the address and its domain as identities, each with its own
    // set.
    const ses = await sendingSes();

    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({ ConfigurationSetName: "marketing" }),
    );
    await attachedSender(ses, "example.com", "marketing");
    await attachedSender(ses, "hello@example.com", "transactional");

    // When a message is sent from the address.
    await ses.sendEmail(new SendEmailCommand(welcome));

    // Then the address's own set wins, which is the rule the more specific
    // identity wins under everywhere else.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.configurationSetName, "transactional");
  });

  it("records no set where neither the send nor the identity names one", async () => {
    // Given a sending identity with nothing attached.
    const ses = await sendingSes();

    ses.verifyIdentity("hello@example.com");

    // When a message names no set either.
    await ses.sendEmail(new SendEmailCommand(welcome));

    // Then the record says so, rather than naming a set nothing declared.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertUndefined(email.configurationSetName);
  });

  it("accepts a set name that was never created", async () => {
    // Given a sending identity attached to a set nobody made.
    const ses = await sendingSes();

    await attachedSender(ses, "hello@example.com", "never-created");

    // When a message is sent through it.
    await ses.sendEmail(new SendEmailCommand(welcome));

    // Then the send stands and the name is on the record. Real SES refuses
    // one, and refusing here would fail a test over a set the developer left
    // out of their local setup. A test wanting the strict reading asks the
    // simulator for the set instead.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.configurationSetName, "never-created");
    assertUndefined(ses.findConfigurationSet("never-created"));
  });

  it("refuses a send through a set with sending switched off", async () => {
    // Given a set that declares sending off.
    const ses = await sendingSes();

    ses.verifyIdentity("hello@example.com");

    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: "paused",
        SendingOptions: { SendingEnabled: false },
      }),
    );

    // When a message names it.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({ ...welcome, ConfigurationSetName: "paused" }),
      );
    });

    // Then SES turned the message down and recorded nothing, because the
    // switch is a declaration the caller wrote deliberately.
    assertInstanceOf(error, SimSesSendingPausedException);
    assertStringIncludes(error.message, "paused");
    assertArrayEmpty(ses.sentEmails());
  });

  it("refuses a send the identity's own set has switched off", async () => {
    // Given an identity attached to a set with sending off.
    const ses = await sendingSes();

    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: "paused",
        SendingOptions: { SendingEnabled: false },
      }),
    );
    await attachedSender(ses, "hello@example.com", "paused");

    // When a message names no set of its own.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(new SendEmailCommand(welcome));
    });

    // Then it is refused just the same, since it went through that set.
    assertInstanceOf(error, SimSesSendingPausedException);
    assertArrayEmpty(ses.sentEmails());
  });

  it("sends a service message through the identity's set", async () => {
    // Given the seam another simulated service sends through, and a sending
    // identity with a set attached.
    const ses = await sendingSes();

    await attachedSender(ses, "hello@example.com", "transactional");

    // When a service sends a message naming no set.
    const result = ses.acceptServiceEmail({
      fromEmailAddress: "hello@example.com",
      toAddress: "someone@example.org",
      replyToAddresses: [],
      subject: "Your code",
      body: "123456",
      configurationSetName: undefined,
    });

    // Then it went through the identity's set, as a message from an SDK caller
    // would have.
    const [email] = ses.sentEmails();

    assertNonNullable(result.messageId);
    assertNonNullable(email);
    assertIdentical(email.configurationSetName, "transactional");
  });

  it("turns a service message down where its set has sending off", async () => {
    // Given a service sending through a set that declares sending off.
    const ses = await sendingSes();

    ses.verifyIdentity("hello@example.com");

    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: "paused",
        SendingOptions: { SendingEnabled: false },
      }),
    );

    // When the message is offered.
    const result = ses.acceptServiceEmail({
      fromEmailAddress: "hello@example.com",
      toAddress: "someone@example.org",
      replyToAddresses: [],
      subject: "Your code",
      body: "123456",
      configurationSetName: "paused",
    });

    // Then the refusal comes back for the sending service to report in its own
    // vocabulary, and nothing is recorded.
    assertNonNullable(result.refusedBecause);
    assertStringIncludes(result.refusedBecause, "paused");
    assertArrayEmpty(ses.sentEmails());
  });
});
