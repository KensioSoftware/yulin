import {
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployFailure,
  simAwsInEuWest2,
} from "../../../../test/cognito/cfn-deploy.js";

/**
 * The AWS::Cognito::UserPool and AWS::Cognito::UserPoolClient Resources
 * `aws-cdk-lib` 2.262.1 emits for `new cognito.UserPool(stack, "Pool")` and
 * `pool.addClient("Client", { disableOAuth: true })`.
 *
 * They are written out here rather than synthesized, so this suite stays an
 * isolated test. The CDK CLI runs the same template through in
 * `src/service/cloudformation/cdk/cognito/`.
 */
const verificationMessage =
  "The verification code to your new account is {####}";

const cdkPoolProperties = {
  AccountRecoverySetting: {
    RecoveryMechanisms: [
      { Name: "verified_phone_number", Priority: 1 },
      { Name: "verified_email", Priority: 2 },
    ],
  },
  AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
  EmailVerificationMessage: verificationMessage,
  EmailVerificationSubject: "Verify your new account",
  SmsVerificationMessage: verificationMessage,
  VerificationMessageTemplate: {
    DefaultEmailOption: "CONFIRM_WITH_CODE",
    EmailMessage: verificationMessage,
    EmailSubject: "Verify your new account",
    SmsMessage: verificationMessage,
  },
};

const cdkResources = {
  PoolD3F588B8: {
    Type: "AWS::Cognito::UserPool",
    Properties: cdkPoolProperties,
  },
  PoolClient8A3E5EB7: {
    Type: "AWS::Cognito::UserPoolClient",
    Properties: {
      AllowedOAuthFlowsUserPoolClient: false,
      SupportedIdentityProviders: ["COGNITO"],
      UserPoolId: { Ref: "PoolD3F588B8" },
    },
  },
};

const cdkOutputs = {
  PoolId: { Value: { Ref: "PoolD3F588B8" } },
  ClientId: { Value: { Ref: "PoolClient8A3E5EB7" } },
};

describe("Cognito CloudFormation defaults a CDK stack emits", () => {
  it("deploys a pool and a client asking for nothing in particular", async () => {
    // Given the template CDK synthesizes for a bare UserPool and a client
    // created with disableOAuth, which names neither of them.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: { Resources: cdkResources, Outputs: cdkOutputs },
    });
    await stack.waitForDeployComplete();

    // Then the pool deployed, rather than the six properties CDK emits
    // failing the stack.
    const userPoolId = stack.outputs.get("PoolId")?.value;
    const clientId = stack.outputs.get("ClientId")?.value;
    assertTypeString(userPoolId);
    assertTypeString(clientId);

    // And it is named after the stack and the logical ID, because the
    // template set no UserPoolName and CreateUserPool needs one.
    const cognito = simAws.cognitoIdentityProvider();
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );
    assertIdentical(described.UserPool?.Name, "app-stack-PoolD3F588B8");

    // And the properties the template declared are reported back, so what the
    // stack asked for stays visible even though nothing here reads any of it.
    assertObjectEquals(
      described.UserPool.AdminCreateUserConfig,
      cdkPoolProperties.AdminCreateUserConfig,
    );
    assertObjectEquals(
      described.UserPool.AccountRecoverySetting,
      cdkPoolProperties.AccountRecoverySetting,
    );
    assertObjectEquals(
      described.UserPool.VerificationMessageTemplate,
      cdkPoolProperties.VerificationMessageTemplate,
    );
    assertIdentical(
      described.UserPool.EmailVerificationSubject,
      cdkPoolProperties.EmailVerificationSubject,
    );

    // And the client deployed with the two settings that say it wants the
    // pool's own users and no hosted UI, under a name generated the same way
    // because the template named it no more than it named the pool.
    const describedClient = await cognito.describeUserPoolClient(
      new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
      }),
    );
    assertNonNullable(describedClient.UserPoolClient);
    assertIdentical(
      describedClient.UserPoolClient.ClientName,
      "app-stack-PoolClient8A3E5EB7",
    );
    assertFalse(describedClient.UserPoolClient.AllowedOAuthFlowsUserPoolClient);
    assertArrayEquals(
      describedClient.UserPoolClient.SupportedIdentityProviders,
      ["COGNITO"],
    );
  });

  it("refuses a pool property at a value other than the one it accepts", async () => {
    // Given a template writing its own account recovery, which nothing here
    // reaches whichever mechanisms are listed.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
          UserPoolName: "myapp-users",
          AccountRecoverySetting: {
            RecoveryMechanisms: [{ Name: "admin_only", Priority: 1 }],
          },
        },
      },
    });

    // Then the failure names the logical ID, the property, the value asked
    // for and the one that is simulated.
    assertStringIncludes(error.message, "AppPool");
    assertStringIncludes(
      error.message,
      "CreateUserPool AccountRecoverySetting",
    );
    assertStringIncludes(error.message, '"Name":"admin_only"');
    assertStringIncludes(error.message, "account recovery");
    assertStringIncludes(error.message, "Only");
  });

  it("deploys a pool a CDK stack asked for self-service sign-up on", async () => {
    // Given the AdminCreateUserConfig and AutoVerifiedAttributes CDK emits for
    // a UserPool with selfSignUpEnabled and autoVerify of the email address.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        Resources: {
          Pool: {
            Type: "AWS::Cognito::UserPool",
            Properties: {
              ...cdkPoolProperties,
              AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
              AutoVerifiedAttributes: ["email"],
            },
          },
        },
        Outputs: { PoolId: { Value: { Ref: "Pool" } } },
      },
    });
    await stack.waitForDeployComplete();

    // Then the pool deployed with both, so a user can sign itself up in it.
    const userPoolId = stack.outputs.get("PoolId")?.value;
    assertTypeString(userPoolId);

    const described = await simAws
      .cognitoIdentityProvider()
      .describeUserPool(
        new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
      );

    assertNonNullable(described.UserPool);
    assertObjectEquals(described.UserPool.AdminCreateUserConfig, {
      AllowAdminCreateUserOnly: false,
    });
    assertArrayEquals(described.UserPool.AutoVerifiedAttributes, ["email"]);
  });

  it("refuses a client asking for the hosted UI flows", async () => {
    // Given a template turning the managed login OAuth flows on, which the
    // two accepted settings exist to turn off.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: { UserPoolName: "myapp-users" },
      },
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          ClientName: "web",
          AllowedOAuthFlowsUserPoolClient: true,
        },
      },
    });

    // Then it is refused in the words CreateUserPoolClient already uses,
    // rather than deploying a client offering flows nothing here can run.
    assertStringIncludes(error.message, "AppClient");
    assertStringIncludes(
      error.message,
      "CreateUserPoolClient AllowedOAuthFlowsUserPoolClient 'true' is not " +
        "simulated",
    );
  });

  it("refuses a client federating to another identity provider", async () => {
    // Given a template naming a provider outside the pool.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: { UserPoolName: "myapp-users" },
      },
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          ClientName: "web",
          SupportedIdentityProviders: ["COGNITO", "Google"],
        },
      },
    });

    // Then it is refused, because federated sign-in happens at the provider
    // rather than anywhere this simulation could stand in for.
    assertStringIncludes(error.message, "AppClient");
    assertStringIncludes(
      error.message,
      "federated sign-in happens at the provider",
    );
  });
});
