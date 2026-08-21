/**
 * A user pool sending its verification message through simulated SES.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
const cognito = simAws.cognitoIdentityProvider();
const ses = simAws.sesV2();

// The sending domain, and the applicant the sandbox would otherwise refuse.
ses.verifyIdentity("example.com");
ses.verifyIdentity("alice@example.org");

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    AutoVerifiedAttributes: ["email"],
    EmailConfiguration: {
      EmailSendingAccount: "DEVELOPER",
      From: "Acme <no-reply@example.com>",
      // The Account in the ARN is read past: the pool resolves the identity in
      // its own Account, so a synthesized template needs no rewriting.
      SourceArn: "arn:aws:ses:eu-west-2:111122223333:identity/example.com",
      ReplyToEmailAddress: "support@example.com",
    },
  }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
  }),
);

await cognito.signUp(
  new SignUpCommand({
    ClientId: appClient.UserPoolClient!.ClientId!,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [{ Name: "email", Value: "alice@example.org" }],
  }),
);

const [email] = ses.sentEmails();

console.log(email?.fromEmailAddress); // "Acme <no-reply@example.com>"
console.log(email?.destination.toAddresses); // ["alice@example.org"]
console.log(email?.replyToAddresses); // ["support@example.com"]

// The pool kept it too, which is what the messages endpoint lists.
console.log(cognito.userPool(userPoolId).sentMessages().length); // 1
