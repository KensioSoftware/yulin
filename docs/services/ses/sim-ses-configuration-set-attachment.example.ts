/**
 * Attaching a configuration set to an identity, and sending through it.
 */

import {
  CreateConfigurationSetCommand,
  CreateEmailIdentityCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

await ses.createConfigurationSet(
  new CreateConfigurationSetCommand({ ConfigurationSetName: "transactional" }),
);

await ses.createEmailIdentity(
  new CreateEmailIdentityCommand({
    EmailIdentity: "example.com",
    ConfigurationSetName: "transactional",
  }),
);

// Standing in for the DNS records a real domain identity waits on.
ses.verifyIdentity("example.com");
ses.verifyIdentity("someone@example.org");

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

// "transactional", off the identity, with the send naming nothing.
console.log(ses.sentEmails()[0]?.configurationSetName);
