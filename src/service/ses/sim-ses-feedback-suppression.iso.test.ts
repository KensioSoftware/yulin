import {
  CreateConfigurationSetCommand,
  PutAccountSuppressionAttributesCommand,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { SimAws } from "../aws/sim-aws.js";
import {
  SimSesBadRequestException,
  SimSesFeedbackError,
} from "./error/sim-ses.error.js";
import type { SimSesSentEmail } from "./email/sim-ses-sent-email.js";
import type { SimSesV2 } from "./sim-ses-v2.js";

describe("SimSesV2 recording delivery feedback", () => {
  const startedAt = new Date("2026-08-31T09:00:00.000Z");

  function sendingSes(): { readonly simAws: SimAws; readonly ses: SimSesV2 } {
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    const ses = simAws.sesV2();

    ses.verifyIdentity("hello@example.com");
    ses.verifyIdentity("example.org");

    return { simAws, ses };
  }

  async function acceptedEmail(
    ses: SimSesV2,
    input: Partial<SendEmailCommandInput> = {},
  ): Promise<SimSesSentEmail> {
    await ses.sendEmail(
      new SendEmailCommand({
        FromEmailAddress: "hello@example.com",
        Destination: { ToAddresses: ["someone@example.org"] },
        Content: {
          Simple: {
            Subject: { Data: "Welcome" },
            Body: { Text: { Data: "Hi there" } },
          },
        },
        ...input,
      }),
    );

    const email = ses.sentEmails().at(-1);
    assertNonNullable(email);
    return email;
  }

  it("records a hard bounce at simulated time and withholds a later send", async () => {
    // Given an accepted message on an account suppressing hard bounces.
    const { ses } = sendingSes();
    const email = await acceptedEmail(ses);

    // When its recipient reports a hard bounce.
    const feedback = ses.recordFeedback({
      messageId: email.messageId,
      emailAddress: "someone@example.org",
      reason: "BOUNCE",
    });

    // Then the account list records it at simulated time, and a later send is
    // accepted but held back from that recipient.
    assertNonNullable(feedback);
    assertIdentical(feedback.emailAddress, "someone@example.org");
    assertIdentical(feedback.reason, "BOUNCE");
    assertIdentical(
      feedback.lastUpdateTime.toISOString(),
      startedAt.toISOString(),
    );

    const later = await acceptedEmail(ses);
    assertArrayLength(later.suppressedRecipients, 1);
    assertIdentical(
      later.suppressedRecipients[0].emailAddress,
      "someone@example.org",
    );
  });

  it("updates an existing entry with complaint feedback and the newer time", async () => {
    // Given two accepted messages to the same recipient.
    const { simAws, ses } = sendingSes();
    const bounced = await acceptedEmail(ses);
    const complained = await acceptedEmail(ses);

    ses.recordFeedback({
      messageId: bounced.messageId,
      emailAddress: "someone@example.org",
      reason: "BOUNCE",
    });
    await simAws.clock().advanceBy({ hours: 2 });

    // When the newer message receives complaint feedback.
    ses.recordFeedback({
      messageId: complained.messageId,
      emailAddress: "someone@example.org",
      reason: "COMPLAINT",
    });

    // Then the one account entry carries the new reason and time.
    const [suppressed] = ses.suppressedDestinations();
    assertArrayLength(ses.suppressedDestinations(), 1);
    assertNonNullable(suppressed);
    assertIdentical(suppressed.reason, "COMPLAINT");
    assertIdentical(
      suppressed.lastUpdateTime.toISOString(),
      "2026-08-31T11:00:00.000Z",
    );
  });

  it("leaves the list unchanged for an inactive account reason", async () => {
    // Given an account suppressing bounces only and an accepted message.
    const { ses } = sendingSes();
    await ses.putAccountSuppressionAttributes(
      new PutAccountSuppressionAttributesCommand({
        SuppressedReasons: ["BOUNCE"],
      }),
    );
    const email = await acceptedEmail(ses);

    // When that recipient complains.
    const feedback = ses.recordFeedback({
      messageId: email.messageId,
      emailAddress: "someone@example.org",
      reason: "COMPLAINT",
    });

    // Then complaint feedback is inactive and the list stays empty.
    assertUndefined(feedback);
    assertArrayEmpty(ses.suppressedDestinations());
  });

  it("uses an active configuration-set reason instead of the account reasons", async () => {
    // Given an account suppressing complaints and a set suppressing bounces.
    const { ses } = sendingSes();
    await ses.putAccountSuppressionAttributes(
      new PutAccountSuppressionAttributesCommand({
        SuppressedReasons: ["COMPLAINT"],
      }),
    );
    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: "bounce-feedback",
        SuppressionOptions: { SuppressedReasons: ["BOUNCE"] },
      }),
    );
    const email = await acceptedEmail(ses, {
      ConfigurationSetName: "bounce-feedback",
    });

    // When its recipient hard bounces.
    ses.recordFeedback({
      messageId: email.messageId,
      emailAddress: "someone@example.org",
      reason: "BOUNCE",
    });

    // Then the configuration-set override puts the recipient on the account
    // list despite the account reason being inactive.
    assertIdentical(ses.suppressedDestinations()[0]?.reason, "BOUNCE");
  });

  it("ignores a reason excluded by the configuration-set override", async () => {
    // Given an account suppressing complaints and a set suppressing bounces.
    const { ses } = sendingSes();
    await ses.putAccountSuppressionAttributes(
      new PutAccountSuppressionAttributesCommand({
        SuppressedReasons: ["COMPLAINT"],
      }),
    );
    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: "bounce-feedback",
        SuppressionOptions: { SuppressedReasons: ["BOUNCE"] },
      }),
    );
    const email = await acceptedEmail(ses, {
      ConfigurationSetName: "bounce-feedback",
    });

    // When its recipient complains.
    const feedback = ses.recordFeedback({
      messageId: email.messageId,
      emailAddress: "someone@example.org",
      reason: "COMPLAINT",
    });

    // Then the set overrides the active account reason and nothing is added.
    assertUndefined(feedback);
    assertArrayEmpty(ses.suppressedDestinations());
  });

  it("distinguishes an absent override from an explicit empty override", async () => {
    // Given one set falling back to active account reasons and one explicitly
    // disabling suppression.
    const { ses } = sendingSes();
    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: "account-defaults",
      }),
    );
    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: "suppression-disabled",
        SuppressionOptions: { SuppressedReasons: [] },
      }),
    );
    const fallback = await acceptedEmail(ses, {
      ConfigurationSetName: "account-defaults",
    });
    const disabled = await acceptedEmail(ses, {
      ConfigurationSetName: "suppression-disabled",
      Destination: { ToAddresses: ["other@example.org"] },
    });

    // When both recipients hard bounce.
    ses.recordFeedback({
      messageId: fallback.messageId,
      emailAddress: "someone@example.org",
      reason: "BOUNCE",
    });
    const ignored = ses.recordFeedback({
      messageId: disabled.messageId,
      emailAddress: "other@example.org",
      reason: "BOUNCE",
    });

    // Then only the send with no override falls back to the account reasons.
    assertUndefined(ignored);
    assertArrayLength(ses.suppressedDestinations(), 1);
    assertIdentical(
      ses.suppressedDestinations()[0]?.emailAddress,
      "someone@example.org",
    );
  });

  it("records feedback for one matching recipient of a multi-recipient send", async () => {
    // Given an accepted message addressed to two recipients.
    const { ses } = sendingSes();
    const email = await acceptedEmail(ses, {
      Destination: {
        ToAddresses: ["someone@example.org"],
        CcAddresses: ["Someone Else <SOMEONE.ELSE@example.org>"],
      },
    });

    // When feedback names the cc recipient without its display name and in a
    // different case.
    ses.recordFeedback({
      messageId: email.messageId,
      emailAddress: "someone.else@example.org",
      reason: "COMPLAINT",
    });

    // Then that recipient alone is added, using the address from the message.
    const [suppressed] = ses.suppressedDestinations();
    assertArrayLength(ses.suppressedDestinations(), 1);
    assertIdentical(suppressed?.emailAddress, "SOMEONE.ELSE@example.org");
  });

  it("refuses feedback for a message this scope did not accept", () => {
    // Given a simulated SES with no accepted message under the supplied id.
    const { ses } = sendingSes();

    // When feedback names that id.
    const error = assertThrowsError(() => {
      ses.recordFeedback({
        messageId: "missing-message",
        emailAddress: "someone@example.org",
        reason: "BOUNCE",
      });
    });

    // Then the invalid relationship is reported and the list stays empty.
    assertInstanceOf(error, SimSesFeedbackError);
    assertStringIncludes(error.message, "missing-message");
    assertArrayEmpty(ses.suppressedDestinations());
  });

  it("refuses feedback for an address outside the message", async () => {
    // Given an accepted message to someone else.
    const { ses } = sendingSes();
    const email = await acceptedEmail(ses);

    // When feedback names an address that was not a recipient.
    const error = assertThrowsError(() => {
      ses.recordFeedback({
        messageId: email.messageId,
        emailAddress: "other@example.org",
        reason: "BOUNCE",
      });
    });

    // Then the mismatch is refused without changing the list.
    assertInstanceOf(error, SimSesFeedbackError);
    assertStringIncludes(error.message, "other@example.org");
    assertArrayEmpty(ses.suppressedDestinations());
  });

  it("refuses a feedback recipient that is not an email address", async () => {
    // Given an accepted message.
    const { ses } = sendingSes();
    const email = await acceptedEmail(ses);

    // When feedback names a domain instead of an address.
    const error = assertThrowsError(() => {
      ses.recordFeedback({
        messageId: email.messageId,
        emailAddress: "example.org",
        reason: "BOUNCE",
      });
    });

    // Then the input is refused without changing the list.
    assertInstanceOf(error, SimSesBadRequestException);
    assertArrayEmpty(ses.suppressedDestinations());
  });

  it("refuses a feedback reason SES does not have", async () => {
    // Given an accepted message.
    const { ses } = sendingSes();
    const email = await acceptedEmail(ses);

    // When feedback names another reason at runtime.
    const error = assertThrowsError(() => {
      ses.recordFeedback({
        messageId: email.messageId,
        emailAddress: "someone@example.org",
        reason: "SOFT_BOUNCE" as "BOUNCE",
      });
    });

    // Then the input is refused without changing the list.
    assertInstanceOf(error, SimSesBadRequestException);
    assertArrayEmpty(ses.suppressedDestinations());
  });
});
