import { DescribeUserPoolClientCommand } from "@aws-sdk/client-cognito-identity-provider";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimLambdaHandler } from "../../lambda/function/sim-lambda-handler.type.js";

// The ids a CDK app pins as literal strings, the stack that creates the pool
// being a different one from the stack that reads it.
const pinnedUserPoolId = "eu-west-2_aBcDeFgHi";
const pinnedClientId = "examplewebclient0000000000";

const accountId = "888888888888";
const regionName = "eu-west-2";

/**
 * The pool ARN a synthesized template carries, which is the pinned pool id
 * after `userpool/`.
 */
function pinnedUserPoolArn(userPoolId: string): string {
  return `arn:aws:cognito-idp:${regionName}:${accountId}:userpool/${userPoolId}`;
}

/**
 * The stack that reads the pool, as `cdk synth` writes it.
 *
 * Both ids reach the template as literals, and the pool ARN in the execution
 * role's policy carries the pool id a second time. Nothing here declares the
 * pool: it belongs to another stack.
 */
function userReadingStack(policyUserPoolId: string): CfnTemplateBodyRecord {
  return {
    Resources: {
      UserFunctionRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "UserFunctionRole",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "ReadUserPool",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "cognito-idp:DescribeUserPoolClient",
                    Resource: pinnedUserPoolArn(policyUserPoolId),
                  },
                ],
              },
            },
          ],
        },
      },
      UserFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "user",
          Role: { "Fn::GetAtt": ["UserFunctionRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Code: { ZipFile: "exports.handler = async () => 'user';" },
          Environment: {
            Variables: {
              USER_POOL_ID: pinnedUserPoolId,
              USER_POOL_CLIENT_ID: pinnedClientId,
            },
          },
        },
      },
    },
  };
}

/**
 * A handler reading the app client it is configured with, as one working out
 * where to send a browser for sign-in does.
 */
const clientReadingHandler: SimLambdaHandler = async (): Promise<unknown> => {
  const cognito = new CognitoIdentityProviderClient({});
  const described = await cognito.send(
    new DescribeUserPoolClientCommand({
      UserPoolId: process.env["USER_POOL_ID"],
      ClientId: process.env["USER_POOL_CLIENT_ID"],
    }),
  );

  return { clientName: described.UserPoolClient?.ClientName };
};

/**
 * A simulated AWS holding the pool and app client the stack names, registered
 * under the ids the template was synthesized with.
 */
function simAwsWithRegisteredPool(): SimAws {
  const simAws = new SimAws({
    defaultAccountId: accountId,
    defaultRegionName: regionName,
  });
  const cognito = simAws.cognitoIdentityProvider();

  cognito.registerUserPool({ id: pinnedUserPoolId, name: "myapp-users" });
  cognito.registerUserPoolClient({
    userPoolId: pinnedUserPoolId,
    id: pinnedClientId,
    name: "web",
  });

  return simAws;
}

/**
 * Deploy the stack with the handler bound to its function.
 */
async function deployUserStack(
  simAws: SimAws,
  policyUserPoolId: string,
): Promise<void> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "user-stack",
    template: userReadingStack(policyUserPoolId),
    bindings: [{ functionName: "user", handler: clientReadingHandler }],
  });

  await stack.waitForDeployComplete();
}

/**
 * Invoke the deployed function.
 */
async function invokeUserFunction(simAws: SimAws): Promise<{
  readonly error: string | undefined;
  readonly payload: unknown;
}> {
  const output = await simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: "user" }));

  assertNonNullable(output.Payload, "Invocation payload");

  return {
    error: output.FunctionError,
    payload: JSON.parse(Buffer.from(output.Payload).toString()) as unknown,
  };
}

describe("A template naming a registered simulated Cognito user pool", () => {
  it("deploys and authorizes its handler against the registered pool", async () => {
    // Given a simulation holding the pool and app client the template names.
    const simAws = simAwsWithRegisteredPool();

    // When the stack deploys with no rewriting, and its function runs.
    await deployUserStack(simAws, pinnedUserPoolId);

    const invoked = await invokeUserFunction(simAws);

    // Then the handler read the app client its environment names, authorized by
    // an execution role whose policy names the same pool ARN.
    assertUndefined(invoked.error);
    assertIdentical(
      (invoked.payload as { clientName?: string }).clientName,
      "web",
    );
  });

  it("refuses the handler where the role's policy names another pool", async () => {
    // Given the same simulation, and a template whose policy names a pool the
    // registered ids have nothing to do with.
    const simAws = simAwsWithRegisteredPool();

    simAws
      .cognitoIdentityProvider()
      .registerUserPool({ id: "eu-west-2_jKlMnOpQr", name: "other-users" });

    // When the function runs against a policy scoped to that other pool.
    await deployUserStack(simAws, "eu-west-2_jKlMnOpQr");

    const invoked = await invokeUserFunction(simAws);

    // Then the call is denied, which is what makes the ARN in the policy worth
    // getting right: a pool id moving without the ARN it is the tail of gives
    // the handler an AccessDenied naming a pool it plainly has a statement for.
    assertIdentical(invoked.error, "Unhandled");
    assertStringIncludes(
      JSON.stringify(invoked.payload),
      "cognito-idp:DescribeUserPoolClient",
    );
  });
});
