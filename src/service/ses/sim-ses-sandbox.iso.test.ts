import {
  PutAccountDetailsCommand,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayLength,
  assertFalse,
  assertInstanceOf,
  assertTrue,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { SimSesMessageRejected } from "./error/sim-ses.error.js";
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

/** Take a simulated SES out of the sandbox. */
async function leaveTheSandbox(ses: SimSesV2): Promise<void> {
  await ses.putAccountDetails(
    new PutAccountDetailsCommand({
      MailType: "TRANSACTIONAL",
      WebsiteURL: "https://example.com",
      ProductionAccessEnabled: true,
    }),
  );
}

describe("SimSesV2 verified identities and the sandbox", () => {
  it("starts an account in the sandbox", () => {
    // Given a simulated SES nobody has configured.
    const ses = new SimAws().sesV2();

    // Then it is in the sandbox, which is where every real account starts.
    assertTrue(ses.isInSandbox());
  });

  it("refuses a send from an unverified sender", async () => {
    // Given a simulated SES where nothing is verified.
    const ses = new SimAws().sesV2();

    // When a message is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(new SendEmailCommand(welcome));
    });

    // Then SES rejects it, naming the identity that failed the check the way
    // real SES names it.
    assertInstanceOf(error, SimSesMessageRejected);
    assertStringIncludes(error.message, "Email address is not verified");
    assertStringIncludes(error.message, "hello@example.com");
    assertArrayLength(ses.sentEmails(), 0);
  });

  it("names the region in the way SES writes it", async () => {
    // Given a simulated SES in one region with nothing verified.
    const simAws = new SimAws();
    const ses = simAws
      .accountRegionScope(simAws.defaultAccountId, "us-east-1")
      .sesV2();

    // When a send is refused.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(new SendEmailCommand(welcome));
    });

    // Then the region is upper case in the message, as SES writes it.
    assertStringIncludes(error.message, "in region US-EAST-1");
  });

  it("refuses a send from an unverified sender out of the sandbox too", async () => {
    // Given a simulated SES with production access and nothing verified.
    const ses = new SimAws().sesV2();

    await leaveTheSandbox(ses);

    // When a message is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(new SendEmailCommand(welcome));
    });

    // Then it is still refused. Leaving the sandbox stops the recipients being
    // checked; the sender is checked either way.
    assertInstanceOf(error, SimSesMessageRejected);
    assertStringIncludes(error.message, "hello@example.com");
  });

  it("refuses a send to an unverified recipient in the sandbox", async () => {
    // Given a sandbox account with the sender verified and the recipient not.
    const ses = new SimAws().sesV2();

    ses.verifyIdentity("hello@example.com");

    // When a message is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(new SendEmailCommand(welcome));
    });

    // Then the recipient is what failed the check, which is the rule the
    // sandbox exists for.
    assertInstanceOf(error, SimSesMessageRejected);
    assertStringIncludes(error.message, "someone@example.org");
  });

  it("accepts a send to an unverified recipient once production access is on", async () => {
    // Given the same account with the sender verified.
    const ses = new SimAws().sesV2();

    ses.verifyIdentity("hello@example.com");

    // When it leaves the sandbox and sends the same message.
    await leaveTheSandbox(ses);
    await ses.sendEmail(new SendEmailCommand(welcome));

    // Then the message is accepted: outside the sandbox only the sender is
    // checked.
    assertArrayLength(ses.sentEmails(), 1);
    assertFalse(ses.isInSandbox());
  });

  it("accepts a send in the sandbox when both ends are verified", async () => {
    // Given a sandbox account with sender and recipient both verified.
    const ses = new SimAws().sesV2();

    ses.verifyIdentity("hello@example.com");
    ses.verifyIdentity("someone@example.org");

    // When a message is sent.
    await ses.sendEmail(new SendEmailCommand(welcome));

    // Then it is accepted.
    assertArrayLength(ses.sentEmails(), 1);
  });

  it("covers every address at a verified domain", async () => {
    // Given a verified domain rather than verified addresses.
    const ses = new SimAws().sesV2();

    ses.verifyIdentity("example.com");
    ses.verifyIdentity("example.org");

    // When a message goes from one address at it to another domain's.
    await ses.sendEmail(
      new SendEmailCommand({
        ...welcome,
        FromEmailAddress: "anything@example.com",
        Destination: { ToAddresses: ["whoever@example.org"] },
      }),
    );

    // Then both passed the check without an address identity of their own,
    // which is what domain identities are for.
    assertArrayLength(ses.sentEmails(), 1);
  });

  it("does not cover a subdomain with its parent domain", async () => {
    // Given a verified parent domain.
    const ses = new SimAws().sesV2();

    ses.verifyIdentity("example.com");

    // When a message is sent from an address at a subdomain of it.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          ...welcome,
          FromEmailAddress: "orders@mail.example.com",
        }),
      );
    });

    // Then it is refused, as it is on real SES: a subdomain is its own
    // identity.
    assertInstanceOf(error, SimSesMessageRejected);
    assertStringIncludes(error.message, "orders@mail.example.com");
  });

  it("matches a verified domain without regard to case", async () => {
    // Given a domain verified in lower case.
    const ses = new SimAws().sesV2();

    ses.verifyIdentity("example.com");

    // When a message is sent from an address spelling it differently.
    await ses.sendEmail(
      new SendEmailCommand({
        ...welcome,
        FromEmailAddress: "hello@EXAMPLE.com",
        Destination: { ToAddresses: ["someone@Example.COM"] },
      }),
    );

    // Then both passed: a domain is case insensitive.
    assertArrayLength(ses.sentEmails(), 1);
  });

  it("names every identity that failed the check at once", async () => {
    // Given a sandbox account with nothing verified and two recipients.
    const ses = new SimAws().sesV2();

    // When a message is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          ...welcome,
          Destination: {
            ToAddresses: ["someone@example.org"],
            CcAddresses: ["copied@example.org"],
          },
        }),
      );
    });

    // Then the message names all three, so a caller finds out everything it
    // has to verify from one failure rather than three.
    assertStringIncludes(error.message, "hello@example.com");
    assertStringIncludes(error.message, "someone@example.org");
    assertStringIncludes(error.message, "copied@example.org");
  });

  it("refuses a send once a verified identity stops holding", async () => {
    // Given an account that has sent successfully.
    const ses = new SimAws().sesV2();
    const sender = ses.verifyIdentity("hello@example.com");

    ses.verifyIdentity("someone@example.org");
    await ses.sendEmail(new SendEmailCommand(welcome));

    // When the sender's verification stops holding.
    sender.unverify();

    // Then the next send is refused, as it would be when the records proving
    // an identity stop resolving.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(new SendEmailCommand(welcome));
    });

    assertInstanceOf(error, SimSesMessageRejected);
    assertArrayLength(ses.sentEmails(), 1);
  });
});
