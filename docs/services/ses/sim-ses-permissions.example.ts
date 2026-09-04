/**
 * A Role that may only send from one address at a verified domain.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const ses = simAws.sesV2();

ses.verifyIdentity("example.com");

await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "SignUpFunctionRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "SignUpFunctionRole",
    PolicyName: "SendWelcomeEmail",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "ses:SendEmail",
          Resource: "arn:aws:ses:us-east-1:111111111111:identity/example.com",
          Condition: {
            StringEquals: { "ses:FromAddress": "hello@example.com" },
          },
        },
      ],
    }),
  }),
);

await ses.sendEmail(
  new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.com"] },
    Content: {
      Simple: {
        Subject: { Data: "Welcome" },
        Body: { Text: { Data: "Hi there" } },
      },
    },
  }),
  {
    caller: {
      kind: "arn",
      arn: "arn:aws:iam::111111111111:role/SignUpFunctionRole",
    },
  },
);

// 1
console.log(ses.sentEmails().length);
