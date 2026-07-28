import {
  CognitoIdentityProviderClient,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DeleteUserPoolClientCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
  ListUserPoolClientsCommand,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringStartsWith,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "../../aws/sim-aws-account.js";
import { makeLambdaCodeZip } from "../../lambda/function/code/make-lambda-code-zip.js";

const emptyBytes = new Uint8Array();

const describeClientCode = [
  'const { CognitoIdentityProviderClient, DescribeUserPoolClientCommand } = require("@aws-sdk/client-cognito-identity-provider");',
  "exports.handler = async (event) => {",
  "  const client = new CognitoIdentityProviderClient({});",
  "  const out = await client.send(new DescribeUserPoolClientCommand({",
  "    UserPoolId: event.userPoolId,",
  "    ClientId: event.clientId,",
  "  }));",
  "  return out.UserPoolClient.ClientName;",
  "};",
].join("\n");

interface SimAwsWithPoolAndRole {
  readonly simAws: SimAws;
  readonly userPoolId: string;
  readonly clientId: string;
}

async function simAwsWithPoolAndRole(
  accountId: SimAwsAccountId,
  policyStatement?: object,
): Promise<SimAwsWithPoolAndRole> {
  const simAws = new SimAws({ defaultAccountId: accountId });
  const cognito = simAws.cognitoIdentityProvider();

  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const appClient = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: pool.UserPool.Id,
      ClientName: "web",
    }),
  );

  assertNonNullable(appClient.UserPoolClient?.ClientId);

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "PoolReaderRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  if (policyStatement !== undefined) {
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "PoolReaderRole",
        PolicyName: "ReadAppClient",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: policyStatement,
        }),
      }),
    );
  }

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "client-reader",
      Role: role.Role.Arn,
      Handler: "index.handler",
      Code: { ZipFile: makeLambdaCodeZip({ "index.js": describeClientCode }) },
    }),
  );

  await simAws.backgroundTasksComplete();

  return {
    simAws,
    userPoolId: pool.UserPool.Id,
    clientId: appClient.UserPoolClient.ClientId,
  };
}

describe("Cognito SDK interception", () => {
  it("routes an intercepted CognitoIdentityProviderClient to simulated Cognito", async () => {
    // Given an intercepted Cognito SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });

    // When ordinary SDK code creates a pool and describes it.
    const created = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const described = await client.send(
      new DescribeUserPoolCommand({ UserPoolId: created.UserPool?.Id }),
    );

    // Then it works with nothing touching the network, and the pool id names
    // the Region the client was configured for.
    assertNonNullable(described.UserPool?.Id);
    assertStringStartsWith(described.UserPool.Id, "eu-west-2_");
    assertStringIncludes(
      String(described.UserPool.Arn),
      "arn:aws:cognito-idp:eu-west-2:",
    );
  });

  it("routes every supported Command through the intercepted client", async () => {
    // Given an intercepted Cognito SDK client with a pool and an app client.
    using simSdk = new SimSdk();
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;
    const appClient = await client.send(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );
    const clientId = appClient.UserPoolClient?.ClientId;

    // When each of the remaining operations is used.
    const describedClient = await client.send(
      new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
      }),
    );
    const listedPools = await client.send(
      new ListUserPoolsCommand({ MaxResults: 10 }),
    );
    const listedClients = await client.send(
      new ListUserPoolClientsCommand({ UserPoolId: userPoolId }),
    );

    await client.send(
      new DeleteUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
      }),
    );
    await client.send(new DeleteUserPoolCommand({ UserPoolId: userPoolId }));

    const listedAfterDelete = await client.send(
      new ListUserPoolsCommand({ MaxResults: 10 }),
    );

    // Then each one reached simulated Cognito.
    assertIdentical(describedClient.UserPoolClient?.ClientName, "web");
    assertArrayEquals(
      listedPools.UserPools?.map((listed) => listed.Name),
      ["myapp-users"],
    );
    assertArrayEquals(
      listedClients.UserPoolClients?.map((listed) => listed.ClientName),
      ["web"],
    );
    assertArrayEquals(listedAfterDelete.UserPools, []);
  });

  it("describes an app client inside a Lambda handler as the execution Role", async () => {
    // Given a function whose code reads an app client's configuration,
    // running as a Role allowed to read it.
    const accountId = makeSimAwsAccountId();
    const { simAws, userPoolId, clientId } = await simAwsWithPoolAndRole(
      accountId,
      {
        Effect: "Allow",
        Action: "cognito-idp:DescribeUserPoolClient",
        Resource: `arn:aws:cognito-idp:us-east-1:${accountId}:userpool/*`,
      },
    );

    // When the function is invoked.
    const invoked = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "client-reader",
        Payload: JSON.stringify({ userPoolId, clientId }),
      }),
    );

    // Then the handler's own SDK call reached simulated Cognito as the
    // execution Role, and that Role's policy allowed it.
    const payload = Buffer.from(invoked.Payload ?? emptyBytes);

    assertStringIncludes(payload.toString("utf8"), "web");
  });

  it("denies a Lambda handler whose Role may not read the app client", async () => {
    // Given the same function, running as a Role with no Cognito permissions.
    const { simAws, userPoolId, clientId } = await simAwsWithPoolAndRole(
      makeSimAwsAccountId(),
    );

    // When the function is invoked.
    const invoked = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "client-reader",
        Payload: JSON.stringify({ userPoolId, clientId }),
      }),
    );

    // Then the handler fails the way it would on real AWS, rather than
    // reading the configuration anyway.
    assertIdentical(invoked.FunctionError, "Unhandled");

    const payload = Buffer.from(invoked.Payload ?? emptyBytes);

    assertStringIncludes(payload.toString("utf8"), "not authorized");
  });
});
