import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  deployFailure,
  deploySuccess,
  simAwsInEuWest2,
} from "../../../../test/cognito/cfn-deploy.js";

const password = "Sup3rSecretPassw0rd!";

const triggerRole: SimCfnTemplateValueRecord = {
  Type: "AWS::IAM::Role",
  Properties: {
    RoleName: "trigger-role",
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
  },
};

/**
 * A trigger handler that turns the sign-in down, so a test can see that the
 * deployed pool really invoked it rather than signing the user in regardless.
 */
const trigger: SimCfnTemplateValueRecord = {
  Type: "AWS::Lambda::Function",
  Properties: {
    FunctionName: "pre-auth",
    Role: { "Fn::GetAtt": ["TriggerRole", "Arn"] },
    Code: {
      ZipFile:
        "exports.handler = async () => { throw new Error('Not today'); };",
    },
    Handler: "index.handler",
    Runtime: "nodejs20.x",
  },
};

/**
 * The permission CDK emits alongside a `UserPool.addTrigger`, naming the pool
 * as the source so no other pool may invoke the function.
 */
const triggerPermission: SimCfnTemplateValueRecord = {
  Type: "AWS::Lambda::Permission",
  Properties: {
    Action: "lambda:InvokeFunction",
    FunctionName: { "Fn::GetAtt": ["Trigger", "Arn"] },
    Principal: "cognito-idp.amazonaws.com",
    SourceArn: { "Fn::GetAtt": ["AppPool", "Arn"] },
  },
};

function poolWithTrigger(
  lambdaConfig: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  return {
    TriggerRole: triggerRole,
    Trigger: trigger,
    AppPool: {
      Type: "AWS::Cognito::UserPool",
      Properties: { UserPoolName: "myapp-users", LambdaConfig: lambdaConfig },
    },
    TriggerPermission: triggerPermission,
    AppClient: {
      Type: "AWS::Cognito::UserPoolClient",
      Properties: {
        UserPoolId: { Ref: "AppPool" },
        ClientName: "web",
        ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
      },
    },
  };
}

/**
 * Add a user that can sign in straight away against the deployed pool.
 */
async function addConfirmedUser(
  simAws: SimAws,
  userPoolId: string,
): Promise<void> {
  const cognito = simAws.cognitoIdentityProvider();

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
  );
  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      Password: password,
      Permanent: true,
    }),
  );
}

describe("Sim CloudFormation Cognito user pool Lambda triggers", () => {
  it("deploys a pool whose trigger fires on a sign-in", async () => {
    // Given a template with a function, a pool naming it as its
    // PreAuthentication trigger, and the permission letting Cognito invoke it.
    const simAws = simAwsInEuWest2();

    // When the stack is deployed.
    const stack = await deploySuccess(
      simAws,
      poolWithTrigger({
        PreAuthentication: { "Fn::GetAtt": ["Trigger", "Arn"] },
      }),
      {
        PoolId: { Value: { Ref: "AppPool" } },
        ClientId: { Value: { Ref: "AppClient" } },
      },
    );

    const userPoolId = stack.outputs.get("PoolId")?.value;
    const clientId = stack.outputs.get("ClientId")?.value;
    assertTypeString(userPoolId);
    assertTypeString(clientId);

    // Then the deployed pool carries the trigger, rather than having dropped
    // it on the way to CreateUserPool.
    const described = await simAws
      .cognitoIdentityProvider()
      .describeUserPool(
        new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
      );
    assertNonNullable(described.UserPool?.LambdaConfig?.PreAuthentication);
    assertStringIncludes(
      described.UserPool.LambdaConfig.PreAuthentication,
      ":function:pre-auth",
    );

    // And a sign-in against the deployed pool runs it: the handler the template
    // deployed refuses, and the sign-in is refused with its words.
    await addConfirmedUser(simAws, userPoolId);

    const error = await assertThrowsErrorAsync(async () =>
      simAws.cognitoIdentityProvider().adminInitiateAuth(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice", PASSWORD: password },
        }),
      ),
    );

    assertIdentical(error.name, "UserLambdaValidationException");
    assertStringIncludes(
      error.message,
      "PreAuthentication failed with error Not today.",
    );
  });

  it("fails a stack asking for a trigger this simulation does not run", async () => {
    // Given a template naming a user migration trigger.
    const simAws = simAwsInEuWest2();

    // When the stack is deployed.
    const error = await deployFailure(
      simAws,
      poolWithTrigger({
        UserMigration: { "Fn::GetAtt": ["Trigger", "Arn"] },
      }),
    );

    // Then the stack fails rather than deploying a pool that would never call
    // the function the template named.
    assertStringIncludes(
      error.message,
      "CreateUserPool LambdaConfig UserMigration is not simulated",
    );
  });
});
