/**
 * A SAM HTTP API closed by the Cognito user pool its Auth block names.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-api-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Resources: {
      Users: {
        Type: "AWS::Cognito::UserPool",
        Properties: { UserPoolName: "orders-users" },
      },
      WebClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "Users" },
          ClientName: "web",
          ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
        },
      },
      Orders: {
        Type: "AWS::Serverless::HttpApi",
        Properties: {
          Auth: {
            DefaultAuthorizer: "PoolAuth",
            Authorizers: {
              PoolAuth: {
                JwtConfiguration: {
                  issuer: { "Fn::GetAtt": ["Users", "ProviderURL"] },
                  audience: [{ Ref: "WebClient" }],
                },
              },
            },
          },
        },
      },
      Handler: {
        Type: "AWS::Serverless::Function",
        Properties: {
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Events: {
            Get: {
              Type: "HttpApi",
              Properties: {
                ApiId: { Ref: "Orders" },
                Path: "/orders",
                Method: "GET",
              },
            },
          },
        },
      },
    },
    Outputs: {
      ApiEndpoint: { Value: { "Fn::GetAtt": ["Orders", "ApiEndpoint"] } },
      PoolId: { Value: { Ref: "Users" } },
      ClientId: { Value: { Ref: "WebClient" } },
    },
  },
  bindings: [
    {
      logicalId: "Handler",
      handler: (): { statusCode: number; body: string } => ({
        statusCode: 200,
        body: "orders",
      }),
    },
  ],
});

await stack.waitForDeployComplete();

const cognito = simAws.cognitoIdentityProvider();
const userPoolId = stack.output("PoolId");
const clientId = stack.output("ClientId");

await cognito.adminCreateUser({
  input: { UserPoolId: userPoolId, Username: "ada" },
});
await cognito.adminSetUserPassword({
  input: {
    UserPoolId: userPoolId,
    Username: "ada",
    Password: "Correct-horse-1",
    Permanent: true,
  },
});
const signedIn = await cognito.adminInitiateAuth({
  input: {
    UserPoolId: userPoolId,
    ClientId: clientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "ada", PASSWORD: "Correct-horse-1" },
  },
});

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${stack.output("ApiEndpoint")}/orders`);

const refused = await fetch(url);

console.log(refused.status);
// 401

const admitted = await fetch(url, {
  headers: {
    authorization: `Bearer ${signedIn.AuthenticationResult?.AccessToken}`,
  },
});

console.log(admitted.status);
// 200

await srv.close();
