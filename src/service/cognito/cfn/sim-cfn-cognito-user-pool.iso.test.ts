import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminListGroupsForUserCommand,
  AdminSetUserPasswordCommand,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertStringStartsWith,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnStack } from "../../cloudformation/stack/sim-cfn-stack.js";

const accountIdOneOnes = "111111111111";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

const userPoolTemplate = {
  Resources: {
    AppPool: {
      Type: "AWS::Cognito::UserPool",
      Properties: {
        UserPoolName: "myapp-users",
        Policies: { PasswordPolicy: { MinimumLength: 12 } },
      },
    },
    AppClient: {
      Type: "AWS::Cognito::UserPoolClient",
      Properties: {
        UserPoolId: { Ref: "AppPool" },
        ClientName: "web",
        ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
      },
    },
    AdminsGroup: {
      Type: "AWS::Cognito::UserPoolGroup",
      Properties: {
        UserPoolId: { Ref: "AppPool" },
        GroupName: "admins",
        Precedence: 0,
      },
    },
  },
  Outputs: {
    PoolId: { Value: { Ref: "AppPool" } },
    PoolArn: { Value: { "Fn::GetAtt": ["AppPool", "Arn"] } },
    ProviderName: { Value: { "Fn::GetAtt": ["AppPool", "ProviderName"] } },
    ProviderUrl: { Value: { "Fn::GetAtt": ["AppPool", "ProviderURL"] } },
    ClientId: { Value: { Ref: "AppClient" } },
    ClientIdAttribute: { Value: { "Fn::GetAtt": ["AppClient", "ClientId"] } },
    PoolIdAttribute: { Value: { "Fn::GetAtt": ["AppPool", "UserPoolId"] } },
    GroupName: { Value: { Ref: "AdminsGroup" } },
  },
};

async function deployUserPoolStack(simAws: SimAws): Promise<SimCfnStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "app-stack",
    template: userPoolTemplate,
  });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * A resolved Stack Output, which every Output in this template is a string.
 */
function output(stack: SimCfnStack, outputKey: string): string {
  const value = stack.outputs.get(outputKey)?.value;
  assertTypeString(value);

  return value;
}

describe("Cognito CloudFormation user pool deployment", () => {
  it("creates a pool, an app client and a group from a template", async () => {
    // Given a template declaring a pool, a client naming it by Ref, and a
    // group in it.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await deployUserPoolStack(simAws);
    const userPoolId = output(stack, "PoolId");

    // Then the pool is the one an SDK caller would have created, with the
    // password policy the template asked for.
    const cognito = simAws.cognitoIdentityProvider();
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );

    assertNonNullable(described.UserPool);
    assertIdentical(described.UserPool.Name, "myapp-users");
    assertIdentical(
      described.UserPool.Policies?.PasswordPolicy?.MinimumLength,
      12,
    );

    // And the app client belongs to that pool, with the name the template
    // gave it.
    const client = await cognito.describeUserPoolClient(
      new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: output(stack, "ClientId"),
      }),
    );

    assertNonNullable(client.UserPoolClient);
    assertIdentical(client.UserPoolClient.ClientName, "web");
    assertIdentical(client.UserPoolClient.UserPoolId, userPoolId);

    // And the group was created in the pool its Ref named.
    const group = cognito.userPool(userPoolId).findGroup("admins");
    assertNonNullable(group);
    assertIdentical(group.precedence, 0);
  });

  it("answers Ref and Fn::GetAtt as real CloudFormation does", async () => {
    // Given the same template, whose Outputs read every supported value.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await deployUserPoolStack(simAws);

    // Then a pool Ref is the pool id, as its own attribute also is, and its
    // other attributes are the ARN and the two forms of the provider name.
    const userPoolId = output(stack, "PoolId");
    assertStringStartsWith(userPoolId, "eu-west-2_");
    assertIdentical(output(stack, "PoolIdAttribute"), userPoolId);
    assertIdentical(
      output(stack, "PoolArn"),
      `arn:aws:cognito-idp:eu-west-2:${accountIdOneOnes}:userpool/${userPoolId}`,
    );
    assertIdentical(
      output(stack, "ProviderName"),
      `cognito-idp.eu-west-2.amazonaws.com/${userPoolId}`,
    );
    assertIdentical(
      output(stack, "ProviderUrl"),
      `https://cognito-idp.eu-west-2.amazonaws.com/${userPoolId}`,
    );

    // And a client Ref is the client id, which is also its one attribute.
    const clientId = output(stack, "ClientId");
    assertIdentical(
      clientId,
      simAws.cognitoIdentityProvider().userPool(userPoolId).clients[0]?.id,
    );
    assertIdentical(output(stack, "ClientIdAttribute"), clientId);

    // And a group Ref is the group name, which is what names a group.
    assertIdentical(output(stack, "GroupName"), "admins");
  });

  it("signs a user in through the deployed pool and client", async () => {
    // Given the deployed stack.
    const simAws = simAwsInEuWest2();
    const stack = await deployUserPoolStack(simAws);
    const userPoolId = output(stack, "PoolId");

    // And a user of the pool who is in the deployed group.
    const cognito = simAws.cognitoIdentityProvider();
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
    await cognito.adminAddUserToGroup(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        GroupName: "admins",
      }),
    );

    // When they sign in through the client the template declared.
    const { AuthenticationResult: result } = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: output(stack, "ClientId"),
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: "alice",
          PASSWORD: "Sup3rSecretPassw0rd!",
        },
      }),
    );

    // Then the flow the template opened admitted them, and the deployed group
    // is theirs.
    assertNonNullable(result?.AccessToken);

    const groups = await cognito.adminListGroupsForUser(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );
    assertIdentical(groups.Groups?.[0]?.GroupName, "admins");
  });
});
