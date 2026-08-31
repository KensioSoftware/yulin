/**
 * Sending a generated CSV and reading it from the simulated SES record.
 */

import { SendEmailCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ses = simAws.sesV2();

ses.verifyIdentity("hello@example.com");
ses.verifyIdentity("someone@example.org");

const csv = new TextEncoder().encode("word,meaning\n你好,hello\n");

await ses.sendEmail(
  new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.org"] },
    Content: {
      Simple: {
        Subject: { Data: "Your vocabulary backup" },
        Body: { Text: { Data: "Your backup is attached." } },
        Attachments: [
          {
            RawContent: csv,
            FileName: "vocabulary.csv",
            ContentType: "text/csv; charset=utf-8",
            ContentDisposition: "ATTACHMENT",
          },
        ],
      },
    },
  }),
);

const [email] = ses.sentEmails();
const [attachment] = email?.attachments ?? [];

// vocabulary.csv "word,meaning\n你好,hello\n"
console.log(
  attachment?.fileName,
  new TextDecoder().decode(attachment?.rawContent),
);
