/**
 * Recording a hard bounce and observing the next send being suppressed.
 */

import { SendEmailCommand } from "@aws-sdk/client-sesv2";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-08-31T09:00:00.000Z")),
});
const ses = simAws.sesV2();

ses.verifyIdentity("hello@example.com");
ses.verifyIdentity("someone@example.org");

const message = new SendEmailCommand({
  FromEmailAddress: "hello@example.com",
  Destination: { ToAddresses: ["someone@example.org"] },
  Content: {
    Simple: {
      Subject: { Data: "Welcome" },
      Body: { Text: { Data: "Hi there" } },
    },
  },
});

const accepted = await ses.sendEmail(message);

ses.recordFeedback({
  messageId: accepted.MessageId!,
  emailAddress: "someone@example.org",
  reason: "BOUNCE",
});

await ses.sendEmail(message);

const suppressed = ses.suppressedDestinations()[0];
const later = ses.sentEmails()[1];

// "BOUNCE" "2026-08-31T09:00:00.000Z" true
console.log(
  suppressed?.reason,
  suppressed?.lastUpdateTime.toISOString(),
  later?.isFullySuppressed,
);
