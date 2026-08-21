/**
 * Suppressing an address, and what a send to it records.
 */

import {
  PutSuppressedDestinationCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

ses.verifyIdentity("hello@example.com");
ses.verifyIdentity("someone@example.org");

await ses.putSuppressedDestination(
  new PutSuppressedDestinationCommand({
    EmailAddress: "someone@example.org",
    Reason: "BOUNCE",
  }),
);

// SES accepts this and holds it back from the recipient.
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
  }),
);

const [email] = ses.sentEmails();

// "someone@example.org" "BOUNCE" true
console.log(
  email?.suppressedRecipients[0]?.emailAddress,
  email?.suppressedRecipients[0]?.reason,
  email?.isFullySuppressed,
);
