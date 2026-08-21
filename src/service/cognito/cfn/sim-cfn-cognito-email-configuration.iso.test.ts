import {
  DescribeUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deploySuccess,
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/cognito/cfn-deploy.js";

const password = "Sup3rSecret!";
const applicant = "alice@example.org";

/**
 * The `AWS::Cognito::UserPool` properties a CDK `UserPool` emits for
 * `email: cognito.UserPoolEmail.withSES({ ... })`, alongside a client-side app
 * client.
 *
 * The Account in the `SourceArn` is the one the stack would really deploy to,
 * which no simulation runs under. A template written this way has to deploy a
 * pool that sends, rather than one that needs the id rewritten first.
 */
const sesPoolResources = {
  SiteUserPool: {
    Type: "AWS::Cognito::UserPool",
    Properties: {
      UserPoolName: "myapp-users",
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
      AutoVerifiedAttributes: ["email"],
      EmailConfiguration: {
        EmailSendingAccount: "DEVELOPER",
        From: "Example <no-reply@example.com>",
        SourceArn: "arn:aws:ses:eu-west-2:111122223333:identity/example.com",
      },
    },
  },
  SiteUserPoolClient: {
    Type: "AWS::Cognito::UserPoolClient",
    Properties: {
      UserPoolId: { Ref: "SiteUserPool" },
      ClientName: "web",
    },
  },
};

const sesPoolOutputs = {
  PoolId: { Value: { Ref: "SiteUserPool" } },
  ClientId: { Value: { Ref: "SiteUserPoolClient" } },
};

describe("sim CloudFormation AWS::Cognito::UserPool EmailConfiguration", () => {
  it("deploys a pool that sends its sign-up message through SES", async () => {
    // Given a simulated AWS with the sending domain and the applicant verified
    // in the region the SourceArn names.
    const simAws = simAwsInEuWest2();
    const ses = simAws.sesV2();

    ses.verifyIdentity("example.com");
    ses.verifyIdentity(applicant);

    // When the stack deploys and someone signs themselves up.
    const stack = await deploySuccess(simAws, sesPoolResources, sesPoolOutputs);
    const clientId = stack.output("ClientId");
    assertTypeString(clientId);

    await simAws.cognitoIdentityProvider().signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "alice",
        Password: password,
        UserAttributes: [{ Name: "email", Value: applicant }],
      }),
    );

    // Then the whole property deployed, and the verification message went
    // through SES rather than being recorded on the pool alone.
    assertArrayLength(ignoredReasons(stack), 0);

    const [email] = ses.sentEmails();
    assertNonNullable(email);
    assertIdentical(email.fromEmailAddress, "Example <no-reply@example.com>");
  });

  it("describes the deployed pool with the configuration the template wrote", async () => {
    // Given a deployed stack.
    const simAws = simAwsInEuWest2();
    const stack = await deploySuccess(simAws, sesPoolResources, sesPoolOutputs);
    const userPoolId = stack.output("PoolId");
    assertTypeString(userPoolId);

    // When the pool is described.
    const described = await simAws
      .cognitoIdentityProvider()
      .describeUserPool(
        new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
      );

    // Then it answers with the EmailConfiguration, where it used to answer
    // with nothing at all.
    const reported = described.UserPool?.EmailConfiguration;
    assertNonNullable(reported);
    assertIdentical(reported.EmailSendingAccount, "DEVELOPER");
    assertIdentical(
      reported.SourceArn,
      "arn:aws:ses:eu-west-2:111122223333:identity/example.com",
    );
  });
});
