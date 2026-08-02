/**
 * Protecting a simulated HTTP API route with a Cognito user pool.
 */

import {
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimPayload2Event } from "@kensio/yulin/apigatewayv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const UserPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
  }),
);
const ClientId = appClient.UserPoolClient!.ClientId!;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId, Username: "ada" }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId,
    Username: "ada",
    Password: "Correct-horse-1",
    Permanent: true,
  }),
);

const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload2Event) => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `orders for ${
          event.requestContext.authorizer?.jwt?.claims["username"] ?? "nobody"
        }`,
      })),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: FunctionArn,
    PayloadFormatVersion: "2.0",
  }),
);

const { AuthorizerId } = await apiGateway.createAuthorizer(
  new CreateAuthorizerCommand({
    ApiId,
    Name: "pool-authorizer",
    AuthorizerType: "JWT",
    IdentitySource: ["$request.header.Authorization"],
    JwtConfiguration: {
      Issuer: `https://cognito-idp.us-east-1.amazonaws.com/${UserPoolId}`,
      Audience: [ClientId],
    },
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /orders",
    Target: `integrations/${IntegrationId}`,
    AuthorizationType: "JWT",
    AuthorizerId,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "orders",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

const signedIn = await cognito.adminInitiateAuth(
  new AdminInitiateAuthCommand({
    UserPoolId,
    ClientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "ada", PASSWORD: "Correct-horse-1" },
  }),
);
const accessToken = signedIn.AuthenticationResult!.AccessToken!;

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${ApiEndpoint}/orders`);

const anonymous = await fetch(url);

console.log(anonymous.status); // 401
console.log(anonymous.headers.get("www-authenticate")); // "Bearer"

const authorized = await fetch(url, {
  headers: { authorization: `Bearer ${accessToken}` },
});

console.log(await authorized.text()); // "orders for ada"

// Advancing the simulation's clock past the token's expiry closes the route
// to the same token, with nothing reissued.
await simAws.clock().advanceBy({ hours: 2 });

const expired = await fetch(url, {
  headers: { authorization: `Bearer ${accessToken}` },
});

console.log(expired.status); // 401

srv.close();
