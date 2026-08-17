/**
 * Deploying an SES identity and template, then sending from them.
 */

import { SendEmailCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      SenderIdentity: {
        Type: "AWS::SES::EmailIdentity",
        Properties: { EmailIdentity: "example.com" },
      },
      WelcomeEmail: {
        Type: "AWS::SES::Template",
        Properties: {
          Template: {
            TemplateName: "welcome",
            SubjectPart: "Welcome, {{name}}",
            TextPart: "Hi {{name}}",
          },
        },
      },
    },
  },
});

const ses = simAws.sesV2();

// The stack leaves the identity unverified, as a real deploy does. Verifying
// finds the one the stack made rather than creating a second.
ses.verifyIdentity("example.com");
ses.verifyIdentity("example.org");

await ses.sendEmail(
  new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.org"] },
    Content: {
      Template: { TemplateName: "welcome", TemplateData: '{"name":"Ada"}' },
    },
  }),
);

// "Welcome, Ada"
console.log(ses.sentEmails()[0]?.subject);
