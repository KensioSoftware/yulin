import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  ConfirmSignUpCommand,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringStartsWith,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file to pass to sim CloudFormation, so the template under test is
 * one CDK actually produced rather than one written by hand.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const accountIdOneOnes = "111111111111";

const verificationMessage =
  "The verification code to your new account is {####}";

describe("Sim CDK Cognito user pool deployment local integration", () => {
  it("deploys a CDK user pool and app client a user signs in against", async () => {
    // Given a CDK stack with a user pool and an app client asking for nothing
    // but the admin password flow, so neither is named and both carry only
    // the properties CDK emits by default.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as cognito from "aws-cdk-lib/aws-cognito";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const pool = new cognito.UserPool(stack, "Pool");
const client = pool.addClient("Client", {
  disableOAuth: true,
  authFlows: { adminUserPassword: true },
});

new cdk.CfnOutput(stack, "PoolId", { value: pool.userPoolId });
new cdk.CfnOutput(stack, "ClientId", { value: client.userPoolClientId });
new cdk.CfnOutput(stack, "ProviderUrl", { value: pool.userPoolProviderUrl });

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into the account and region the
    // CDK app declares, with no hand-editing of the Cognito Resources CDK
    // emits.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await stack.waitForDeployComplete();

    // Then the pool id CDK output carries is the deployed pool.
    const userPoolId = stack.outputs.get("PoolId")?.value;
    const clientId = stack.outputs.get("ClientId")?.value;
    assertTypeString(userPoolId);
    assertTypeString(clientId);

    const cognito = scoped.cognitoIdentityProvider();
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );
    assertIdentical(described.UserPool?.Id, userPoolId);
    assertIdentical(
      stack.outputs.get("ProviderUrl")?.value,
      `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}`,
    );

    // And it is named after the stack and the logical ID, because the CDK
    // construct emits no UserPoolName and CreateUserPool needs one.
    assertNonNullable(described.UserPool.Name);
    assertStringStartsWith(described.UserPool.Name, "TestStack-Pool");

    // And the properties CDK emits for a pool nobody configured were kept as
    // the template set them, rather than failing the stack or being dropped.
    assertObjectEquals(described.UserPool.AdminCreateUserConfig, {
      AllowAdminCreateUserOnly: true,
    });
    assertObjectEquals(described.UserPool.AccountRecoverySetting, {
      RecoveryMechanisms: [
        { Name: "verified_phone_number", Priority: 1 },
        { Name: "verified_email", Priority: 2 },
      ],
    });
    assertIdentical(
      described.UserPool.EmailVerificationMessage,
      verificationMessage,
    );

    // And the app client deployed with the two settings a disableOAuth client
    // emits, which say it wants the pool's own users and no hosted UI.
    const describedClient = await cognito.describeUserPoolClient(
      new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
      }),
    );
    assertNonNullable(describedClient.UserPoolClient);
    assertFalse(describedClient.UserPoolClient.AllowedOAuthFlowsUserPoolClient);
    assertArrayEquals(
      describedClient.UserPoolClient.SupportedIdentityProviders,
      ["COGNITO"],
    );

    // And a user created in the deployed pool signs in through the deployed
    // client, which is what deploying the template rather than restating it
    // is for.
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        Password: "Sup3rSecretPassw0rd!",
        Permanent: true,
      }),
    );

    const signedIn = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: "alice",
          PASSWORD: "Sup3rSecretPassw0rd!",
        },
      }),
    );

    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);

    await simAws.backgroundTasksComplete();
  });

  it("deploys a CDK user pool a user signs itself up in", async () => {
    // Given a CDK stack with a user pool that lets users sign themselves up
    // and verifies the email address they sign up with.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as cognito from "aws-cdk-lib/aws-cognito";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const pool = new cognito.UserPool(stack, "Pool", {
  selfSignUpEnabled: true,
  autoVerify: { email: true },
});
const client = pool.addClient("Client", {
  disableOAuth: true,
  authFlows: { userPassword: true },
});

new cdk.CfnOutput(stack, "PoolId", { value: pool.userPoolId });
new cdk.CfnOutput(stack, "ClientId", { value: client.userPoolClientId });

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy it, and someone signs themselves up through the deployed
    // app client.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
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

    const cognito = scoped.cognitoIdentityProvider();

    await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "alice",
        Password: "Sup3rSecretPassw0rd!",
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      }),
    );
    await cognito.confirmSignUp(
      new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: "alice",
        ConfirmationCode: cognito
          .userPool(userPoolId)
          .confirmationCode("alice"),
      }),
    );

    // Then the user signs in against the deployed pool, and the email address
    // it signed up with is verified, because the template asked for that.
    const signedIn = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: "alice",
          PASSWORD: "Sup3rSecretPassw0rd!",
        },
      }),
    );

    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);

    const described = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(described.UserStatus, "CONFIRMED");
    assertTrue(
      (described.UserAttributes ?? []).some(
        (attribute) =>
          attribute.Name === "email_verified" && attribute.Value === "true",
      ),
    );

    await simAws.backgroundTasksComplete();
  });
});
