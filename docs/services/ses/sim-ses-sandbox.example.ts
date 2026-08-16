/**
 * The sandbox rules, and leaving the sandbox.
 */

import {
  PutAccountDetailsCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";
import { SimSesMessageRejected } from "@kensio/yulin/ses";

const ses = new SimAws().sesV2();

ses.verifyIdentity("hello@example.com");

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

try {
  await ses.sendEmail(message);
} catch (error) {
  // MessageRejected: the recipient is not verified and this account is still
  // in the sandbox.
  console.log(error instanceof SimSesMessageRejected, ses.isInSandbox());
}

await ses.putAccountDetails(
  new PutAccountDetailsCommand({
    MailType: "TRANSACTIONAL",
    WebsiteURL: "https://example.com",
    ProductionAccessEnabled: true,
  }),
);

await ses.sendEmail(message);

// 1
console.log(ses.sentEmails().length);
