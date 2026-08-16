/**
 * Application code sending through an intercepted SES client.
 */

import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
simSdk.intercept(SESv2Client);

const scoped = simSdk.simAws.accountRegionScope(
  simSdk.simAws.defaultAccountId,
  "eu-west-2",
);

scoped.sesV2().verifyIdentity("example.com");
scoped.sesV2().verifyIdentity("example.org");

// Ordinary application code, unaware it is not talking to AWS.
const client = new SESv2Client({ region: "eu-west-2" });

await client.send(
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

// "Welcome"
console.log(scoped.sesV2().sentEmails()[0]?.subject);
