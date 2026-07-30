import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertStringLength,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { DescribeUserPoolClientCommand } from "@aws-sdk/client-cognito-identity-provider";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

function simAwsInEuWest2(): SimAws {
  return new SimAws({ defaultRegionName: "eu-west-2" });
}

/**
 * Deploy a template that is expected to fail, and give back the error.
 */
async function deployFailure(
  simAws: SimAws,
  resources: SimCfnTemplateValueRecord,
  outputs?: SimCfnTemplateValueRecord,
): Promise<Error> {
  const error = await assertThrowsErrorAsync(async () => {
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        Resources: resources,
        ...(outputs !== undefined && { Outputs: outputs }),
      },
    });
    await stack.waitForDeployComplete();
  });

  assertInstanceOf(error, Error);

  return error;
}

describe("Cognito CloudFormation validation", () => {
  it("generates a client secret only when the template asks for one", async () => {
    // Given a template with one client asking for a secret and one not.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "secret-stack",
      template: {
        Resources: {
          AppPool: {
            Type: "AWS::Cognito::UserPool",
            Properties: { UserPoolName: "myapp-users" },
          },
          ServerClient: {
            Type: "AWS::Cognito::UserPoolClient",
            Properties: {
              UserPoolId: { Ref: "AppPool" },
              ClientName: "server",
              GenerateSecret: true,
            },
          },
          BrowserClient: {
            Type: "AWS::Cognito::UserPoolClient",
            Properties: {
              UserPoolId: { Ref: "AppPool" },
              ClientName: "browser",
            },
          },
        },
        Outputs: {
          PoolId: { Value: { Ref: "AppPool" } },
          ServerClientId: { Value: { Ref: "ServerClient" } },
          BrowserClientId: { Value: { Ref: "BrowserClient" } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the server client was given one, which DescribeUserPoolClient
    // reports as it does for a client the SDK created.
    const poolId = stack.outputs.get("PoolId")?.value;
    const serverClientId = stack.outputs.get("ServerClientId")?.value;
    const browserClientId = stack.outputs.get("BrowserClientId")?.value;
    assertTypeString(poolId);
    assertTypeString(serverClientId);
    assertTypeString(browserClientId);

    const cognito = simAws.cognitoIdentityProvider();
    const described = await cognito.describeUserPoolClient(
      new DescribeUserPoolClientCommand({
        UserPoolId: poolId,
        ClientId: serverClientId,
      }),
    );
    assertNonNullable(described.UserPoolClient?.ClientSecret);
    assertStringLength(described.UserPoolClient.ClientSecret, 52);

    // And the browser client has no secret at all, as none was asked for.
    const browserClient = cognito.userPool(poolId).findClient(browserClientId);
    assertNonNullable(browserClient);
    assertUndefined(browserClient.secret);
  });

  it("refuses a user pool property it does not simulate", async () => {
    // Given a template asking for a pool that signs users in by email.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
          UserPoolName: "myapp-users",
          UsernameAttributes: ["email"],
        },
      },
    });

    // Then the failure names the logical ID and the property, rather than the
    // pool being deployed without it.
    assertStringIncludes(error.message, "AppPool");
    assertStringIncludes(error.message, "UsernameAttributes is not simulated");
    assertStringIncludes(error.message, "The simulated properties are");
  });

  it("refuses an app client property it does not simulate", async () => {
    // Given a template asking for a client with the hosted UI OAuth flows.
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
          AllowedOAuthFlows: ["code"],
        },
      },
    });

    // Then the failure names that client and that property.
    assertStringIncludes(error.message, "AppClient");
    assertStringIncludes(error.message, "AllowedOAuthFlows is not simulated");
  });

  it("refuses a pool feature the Cognito API refuses", async () => {
    // Given a template asking for MFA, which CreateUserPool does not simulate.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
          UserPoolName: "myapp-users",
          MfaConfiguration: "ON",
        },
      },
    });

    // Then the refusal is the API's own, in the words that say why, with the
    // logical ID in front of it.
    assertStringIncludes(error.message, "AppPool");
    assertStringIncludes(
      error.message,
      "CreateUserPool MfaConfiguration 'ON' is not simulated",
    );
  });

  it("refuses a property value of the wrong shape", async () => {
    // Given a template whose GroupName is a number rather than a string.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const error = await deployFailure(simAws, {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: { UserPoolName: "myapp-users" },
      },
      AdminsGroup: {
        Type: "AWS::Cognito::UserPoolGroup",
        Properties: { UserPoolId: { Ref: "AppPool" }, GroupName: 7 },
      },
    });

    // Then the failure says what the property should have been.
    assertStringIncludes(
      error.message,
      "AWS::Cognito::UserPoolGroup AdminsGroup: GroupName must be a string",
    );
  });

  it("refuses an Fn::GetAtt attribute it does not publish", async () => {
    // Given a stack of all three Resource types, whose Output reads an
    // attribute the simulator does not answer.
    const attributeFailure = async (
      logicalId: string,
      attribute: string,
    ): Promise<Error> =>
      deployFailure(
        simAwsInEuWest2(),
        {
          AppPool: {
            Type: "AWS::Cognito::UserPool",
            Properties: { UserPoolName: "myapp-users" },
          },
          AppClient: {
            Type: "AWS::Cognito::UserPoolClient",
            Properties: { UserPoolId: { Ref: "AppPool" }, ClientName: "web" },
          },
          AdminsGroup: {
            Type: "AWS::Cognito::UserPoolGroup",
            Properties: {
              UserPoolId: { Ref: "AppPool" },
              GroupName: "admins",
            },
          },
        },
        { Attribute: { Value: { "Fn::GetAtt": [logicalId, attribute] } } },
      );

    // When one is deployed for each Resource type.
    const poolError = await attributeFailure("AppPool", "Name");
    const clientError = await attributeFailure("AppClient", "ClientSecret");
    const groupError = await attributeFailure("AdminsGroup", "Id");

    // Then each refusal names the Resource type and the attribute.
    assertStringIncludes(
      poolError.message,
      "Unsupported AWS::Cognito::UserPool attribute Name",
    );
    assertStringIncludes(
      clientError.message,
      "Unsupported AWS::Cognito::UserPoolClient attribute ClientSecret",
    );
    assertStringIncludes(
      groupError.message,
      "Unsupported AWS::Cognito::UserPoolGroup attribute Id",
    );
  });

  it("reports an unsimulated Cognito Resource type as unsupported", async () => {
    // Given a template declaring a user pool domain, which is the hosted UI
    // and is not simulated.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "domain-stack",
      template: {
        Resources: {
          AppPool: {
            Type: "AWS::Cognito::UserPool",
            Properties: { UserPoolName: "myapp-users" },
          },
          AppDomain: {
            Type: "AWS::Cognito::UserPoolDomain",
            Properties: { UserPoolId: { Ref: "AppPool" }, Domain: "myapp" },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the domain is skipped rather than deployed, and the pool beside it
    // is created as usual.
    assertArrayLength(stack.skippedResources, 1);
    assertIdentical(stack.skippedResources[0].logicalId, "AppDomain");
  });
});
