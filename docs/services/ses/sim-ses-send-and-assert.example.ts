/**
 * Sending a welcome email through simulated SES and asserting on it.
 */

import { SendEmailCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ses = simAws.sesV2();

// Both ends have to be verified in the sandbox, which is where an account
// starts.
ses.verifyIdentity("hello@example.com");
ses.verifyIdentity("someone@example.org");

await ses.sendEmail(
  new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.org"] },
    Content: {
      Simple: {
        Subject: { Data: "Welcome" },
        Body: { Text: { Data: "Hi there, thanks for signing up." } },
      },
    },
  }),
);

const [email] = ses.sentEmails();

// "Welcome" someone@example.org
console.log(email?.subject, email?.destination.toAddresses[0]);
