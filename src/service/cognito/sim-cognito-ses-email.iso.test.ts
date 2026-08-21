import { AdminCreateUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  applicant,
  leaveTheSandbox,
  poolSending,
  poolSendingThroughSes,
  sesIn,
  signUp,
  type SignUpPool,
} from "../../../test/cognito/ses-email-pool.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import { simIamPolicyDocumentFactory } from "../iam/policy/sim-iam-policy-document.factory.js";

/**
 * A Role in the pool's account whose only permission is the statement given.
 */
async function roleAllowedTo(
  pool: SignUpPool,
  policyStatement: object,
): Promise<SimAwsCaller> {
  const role = await pool.simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "WebRole",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: {
            AWS: `arn:aws:iam::${pool.simAws.defaultAccountId}:root`,
          },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await pool.simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "WebRole",
      PolicyName: "WebPolicy",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: policyStatement,
      }),
    }),
  );

  assertNonNullable(role.Role.Arn);

  return { kind: "arn", arn: role.Role.Arn };
}

describe("sim Cognito user pool email through simulated SES", () => {
  it("records a DEVELOPER pool's sign-up message on SES as well as the pool", async () => {
    // Given a pool sending through SES, with the sender's domain and the
    // applicant verified so the sandbox lets the message through.
    const pool = await poolSendingThroughSes("us-east-1", {
      ReplyToEmailAddress: "support@example.com",
      ConfigurationSet: "transactional",
    });
    const ses = sesIn(pool, "us-east-1");

    ses.verifyIdentity("example.com");
    ses.verifyIdentity(applicant);

    // When someone signs themselves up.
    await signUp(pool);

    // Then SES holds the message it would have sent, as the pool configured
    // it.
    const [email] = ses.sentEmails();
    assertNonNullable(email);
    assertIdentical(email.fromEmailAddress, "Example <no-reply@example.com>");
    assertArrayEquals(email.destination.toAddresses, [applicant]);
    assertArrayEquals(email.replyToAddresses, ["support@example.com"]);
    assertIdentical(email.configurationSetName, "transactional");
    assertIdentical(email.subject, "Your verification code");

    // And the pool holds it too, which is what the serve layer lists for a
    // developer reading the code out of a browser sign-up.
    const [message] = pool.cognito.userPool(pool.userPoolId).sentMessages();
    assertNonNullable(message);
    assertIdentical(message.recipient, applicant);
    assertIdentical(message.body, email.body.text);
  });

  it("sends through the SES of the region the SourceArn names", async () => {
    // Given a pool in us-east-1 whose SourceArn names eu-west-2, with the
    // identities verified there and nothing verified in the pool's own region.
    const pool = await poolSendingThroughSes("eu-west-2");
    const other = sesIn(pool, "eu-west-2");

    other.verifyIdentity("example.com");
    other.verifyIdentity(applicant);

    // When someone signs themselves up.
    await signUp(pool);

    // Then the message went through eu-west-2, and us-east-1 has none of it.
    assertArrayLength(other.sentEmails(), 1);
    assertArrayLength(sesIn(pool, "us-east-1").sentEmails(), 0);
  });

  it("sends to an unverified recipient once the account has left the sandbox", async () => {
    // Given a pool sending through SES with the sender verified, and an
    // account out of the sandbox.
    const pool = await poolSendingThroughSes();
    const ses = sesIn(pool, "us-east-1");

    ses.verifyIdentity("example.com");
    await leaveTheSandbox(ses);

    // When someone signs themselves up.
    await signUp(pool);

    // Then the message went, because out of the sandbox only the sender is
    // checked.
    assertArrayLength(ses.sentEmails(), 1);
  });

  it("sends from the SourceArn identity where the pool named no From", async () => {
    // Given a pool sending through SES that named no From address.
    const pool = await poolSending({
      EmailSendingAccount: "DEVELOPER",
      SourceArn:
        "arn:aws:ses:us-east-1:111122223333:identity/hello@example.com",
    });
    const ses = sesIn(pool, "us-east-1");

    ses.verifyIdentity("hello@example.com");
    await leaveTheSandbox(ses);

    // When someone signs themselves up.
    await signUp(pool);

    // Then the message came from the identity, as it does on real Cognito.
    const [email] = ses.sentEmails();
    assertNonNullable(email);
    assertIdentical(email.fromEmailAddress, "hello@example.com");
  });

  it("sends as the service, whatever the caller may do on SES", async () => {
    // Given a pool sending through SES, and a Role allowed to create users in
    // it and nothing at all on SES.
    const pool = await poolSendingThroughSes();
    const ses = sesIn(pool, "us-east-1");

    ses.verifyIdentity("example.com");
    await leaveTheSandbox(ses);

    const caller = await roleAllowedTo(pool, {
      Effect: "Allow",
      Action: "cognito-idp:AdminCreateUser",
      Resource: "*",
    });

    // When that Role creates a user, which invites them by email.
    await pool.cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
        UserAttributes: [{ Name: "email", Value: applicant }],
      }),
      { caller },
    );

    // Then the invitation went, because real Cognito sends through a
    // service-linked role rather than as whoever called the operation.
    assertArrayLength(ses.sentEmails(), 1);
  });

  it("leaves a text message off SES, which sends no text messages", async () => {
    // Given a pool sending through SES, and a user reachable only by phone.
    const pool = await poolSendingThroughSes();
    const ses = sesIn(pool, "us-east-1");

    ses.verifyIdentity("example.com");
    await leaveTheSandbox(ses);

    // When an administrator invites that user.
    await pool.cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: pool.userPoolId,
        Username: "bob",
        UserAttributes: [{ Name: "phone_number", Value: "+447700900000" }],
      }),
    );

    // Then the pool recorded the invitation as a text message, and SES saw
    // nothing: an EmailConfiguration says nothing about SMS.
    const [message] = pool.cognito.userPool(pool.userPoolId).sentMessages();
    assertNonNullable(message);
    assertIdentical(message.medium, "SMS");
    assertArrayLength(ses.sentEmails(), 0);
  });

  it("keeps a COGNITO_DEFAULT pool's messages off SES", async () => {
    // Given a pool carrying only a reply-to address, which is what a CDK
    // UserPoolEmail.withCognito({ replyTo }) emits.
    const pool = await poolSending({
      ReplyToEmailAddress: "support@example.com",
    });

    // When someone signs themselves up.
    await signUp(pool);

    // Then the pool recorded the message and SES saw nothing, because
    // Cognito's own sending reaches no other service.
    assertArrayLength(pool.cognito.userPool(pool.userPoolId).sentMessages(), 1);
    assertArrayLength(sesIn(pool, "us-east-1").sentEmails(), 0);
  });
});
