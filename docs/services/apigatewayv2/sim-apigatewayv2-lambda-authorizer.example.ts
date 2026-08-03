/**
 * Protecting a simulated HTTP API route with a Lambda REQUEST authorizer.
 */

import {
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type {
  SimHttpApiAuthorizerEvent,
  SimPayload2Event,
} from "@kensio/yulin/apigatewayv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const lambda = simAws.lambda();

const { FunctionArn: AuthorizerFunctionArn } = await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "session-authorizer",
    Role: "arn:aws:iam::888888888888:role/AuthorizerRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimHttpApiAuthorizerEvent) => ({
        isAuthorized: event.identitySource[0] === "session=valid",
        context: { tenant: "acme" },
      })),
    },
  }),
);

const { FunctionArn } = await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "account",
    Role: "arn:aws:iam::888888888888:role/AccountRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload2Event) => ({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event.requestContext.authorizer?.lambda),
      })),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();

const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "account", ProtocolType: "HTTP" }),
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
    Name: "session-cookie",
    AuthorizerType: "REQUEST",
    AuthorizerUri: AuthorizerFunctionArn,
    AuthorizerPayloadFormatVersion: "2.0",
    EnableSimpleResponses: true,
    IdentitySource: ["$request.header.cookie"],
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /account",
    Target: `integrations/${IntegrationId}`,
    AuthorizationType: "CUSTOM",
    AuthorizerId,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "$default", AutoDeploy: true }),
);

// Each function needs its own grant: the integration is invoked under the ARN
// of the route, and the authorizer under an ARN naming the authorizer.
await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "account",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "session-authorizer",
    StatementId: "api-gateway-invoke-authorizer",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/authorizers/${AuthorizerId}`,
  }),
);

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${ApiEndpoint}/account`);

const refused = await fetch(url, { headers: { cookie: "session=expired" } });

console.log(refused.status); // 403

const admitted = await fetch(url, { headers: { cookie: "session=valid" } });

console.log(await admitted.text()); // '{"tenant":"acme"}'

srv.close();
