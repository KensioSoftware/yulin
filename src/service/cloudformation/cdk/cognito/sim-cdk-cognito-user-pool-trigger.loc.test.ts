import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { text } from "node:stream/consumers";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the template
 * for `userPool.addTrigger(...)`, which CDK writes as a `LambdaConfig` on the
 * pool plus the `AWS::Lambda::Permission` that lets Cognito invoke the
 * function.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const cdkAccountId = "111111111111";
const cdkRegionName = "eu-west-2";
const password = "Sup3rSecretPassw0rd!";

/**
 * A trigger handler that records the sign-in it saw into a Bucket, and turns
 * away anyone whose email is not on the domain the pool is for.
 *
 * Writing the record is what shows the deployed function really ran, and
 * throwing is what shows its answer reached the sign-in.
 */
const preAuthHandlerSource = `
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = new S3Client({});
exports.handler = async (event) => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: "cdk-cognito-trigger-audit",
      Key: event.userName,
      Body: event.triggerSource,
    }),
  );

  const email = event.request.userAttributes.email ?? "";
  if (!email.endsWith("@example.com")) {
    throw new Error("Only example.com may sign in");
  }

  return event;
};
`;

describe("Sim CDK Cognito user pool trigger local integration", () => {
  it("deploys a CDK addTrigger and runs it on a sign-in", async () => {
    // Given a CDK stack whose user pool has a PreAuthentication trigger, added
    // the way a CDK app adds one, with no hand-written LambdaConfig or
    // permission anywhere.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "${cdkAccountId}", region: "${cdkRegionName}" },
});

const auditBucket = new s3.Bucket(stack, "AuditBucket", {
  bucketName: "cdk-cognito-trigger-audit",
});

const preAuth = new lambda.Function(stack, "PreAuth", {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(preAuthHandlerSource)}),
});

auditBucket.grantPut(preAuth);

const pool = new cognito.UserPool(stack, "Pool");
pool.addTrigger(cognito.UserPoolOperation.PRE_AUTHENTICATION, preAuth);

const client = pool.addClient("Client", {
  disableOAuth: true,
  authFlows: { adminUserPassword: true },
});

new cdk.CfnOutput(stack, "PoolId", { value: pool.userPoolId });
new cdk.CfnOutput(stack, "ClientId", { value: client.userPoolClientId });

app.synth();
      `,
    );

    const cdkOutDirectory = await cdkProject.synth();

    // When the synthesized template is deployed.
    const simAws = new SimAws();
    const scoped = simAws.account(cdkAccountId).region(cdkRegionName);
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await stack.waitForDeployComplete();

    const userPoolId = stack.outputs.get("PoolId")?.value;
    const clientId = stack.outputs.get("ClientId")?.value;
    assertTypeString(userPoolId);
    assertTypeString(clientId);

    // And a user on the domain the trigger admits signs in.
    const cognito = scoped.cognitoIdentityProvider();
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      }),
    );
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        Password: password,
        Permanent: true,
      }),
    );

    const signedIn = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: password },
      }),
    );

    // Then the sign-in succeeded, and the deployed function ran as part of it,
    // reaching the Bucket the same stack granted it.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);

    const audited = await scoped.s3().getObject(
      new GetObjectCommand({
        Bucket: "cdk-cognito-trigger-audit",
        Key: "alice",
      }),
    );
    assertNonNullable(audited.Body);
    assertIdentical(
      await text(audited.Body as NodeJS.ReadableStream),
      "PreAuthentication_Authentication",
    );

    // And a user the trigger turns away is refused, with the words its handler
    // threw, so the deployed function decides the sign-in rather than only
    // watching it.
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: "mallory",
        UserAttributes: [{ Name: "email", Value: "mallory@elsewhere.test" }],
      }),
    );
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "mallory",
        Password: password,
        Permanent: true,
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      cognito.adminInitiateAuth(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "mallory", PASSWORD: password },
        }),
      ),
    );

    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(
      error.message,
      "PreAuthentication failed with error Only example.com may sign in.",
    );

    await simAws.backgroundTasksComplete();
  });
});
