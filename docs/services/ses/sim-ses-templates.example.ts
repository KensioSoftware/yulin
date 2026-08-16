/**
 * Sending from a stored template and asserting on the substitutions.
 */

import {
  CreateEmailTemplateCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

ses.verifyIdentity("hello@example.com");
ses.verifyIdentity("someone@example.org");

await ses.createEmailTemplate(
  new CreateEmailTemplateCommand({
    TemplateName: "welcome",
    TemplateContent: {
      Subject: "Welcome, {{name}}",
      Text: "Hi {{name}}, thanks for signing up.",
      Html: "<p>Hi {{name}}, thanks for signing up.</p>",
    },
  }),
);

await ses.sendEmail(
  new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.org"] },
    Content: {
      Template: { TemplateName: "welcome", TemplateData: '{"name":"Ada"}' },
    },
  }),
);

const [email] = ses.sentEmails();

// "welcome" { name: "Ada" } "Welcome, Ada"
console.log(email?.templateName, email?.templateData, email?.subject);
