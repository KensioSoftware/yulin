/**
 * Deploying the Resources a CDK UserPool construct emits by default.
 */

import { DescribeUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

const verificationMessage =
  "The verification code to your new account is {####}";

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "app-stack",
  template: {
    Resources: {
      // What `new cognito.UserPool(stack, "Pool")` synthesizes, with no
      // UserPoolName among it.
      Pool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
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
        },
      },
      // What `pool.addClient("Client", { disableOAuth: true })` synthesizes.
      PoolClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "Pool" },
          AllowedOAuthFlowsUserPoolClient: false,
          SupportedIdentityProviders: ["COGNITO"],
        },
      },
    },
    Outputs: { PoolId: { Value: { Ref: "Pool" } } },
  },
});
await stack.waitForDeployComplete();

const userPoolId = stack.outputs.get("PoolId")?.value as string;

// The pool is named after the stack and the logical id, as the template named
// neither it nor the client.
const described = await simAws
  .cognitoIdentityProvider()
  .describeUserPool(new DescribeUserPoolCommand({ UserPoolId: userPoolId }));

console.log(described.UserPool?.Name); // "app-stack-Pool"

// What the template declared is reported back. This one is acted on: it is
// what says only an admin creates users in this pool.
console.log(described.UserPool?.AdminCreateUserConfig);
// { AllowAdminCreateUserOnly: true }

// So is this one: it is what a verification message the pool records says.
console.log(described.UserPool?.EmailVerificationSubject);
// "Verify your new account"
