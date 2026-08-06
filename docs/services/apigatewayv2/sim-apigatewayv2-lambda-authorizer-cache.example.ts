/**
 * Caching a simulated HTTP API Lambda authorizer's decision.
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
import type { SimPayload2Event } from "@kensio/yulin/apigatewayv2";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const lambda = simAws.lambda();

// An authorizer counting its own invocations, so the caller can see which
// decision served each request.
const counter = { invocations: 0 };

const { FunctionArn: AuthorizerFunctionArn } = await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "session-authorizer",
    Role: "arn:aws:iam::888888888888:role/AuthorizerRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        counter.invocations += 1;

        return { isAuthorized: true, context: { ...counter } };
      }),
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
    AuthorizerResultTtlInSeconds: 300,
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

for (const [FunctionName, SourceArn] of [
  ["account", `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`],
  [
    "session-authorizer",
    `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/authorizers/${AuthorizerId}`,
  ],
]) {
  await lambda.addPermission(
    new AddPermissionCommand({
      FunctionName,
      StatementId: "api-gateway-invoke",
      Action: "lambda:InvokeFunction",
      Principal: "apigateway.amazonaws.com",
      SourceArn,
    }),
  );
}

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${ApiEndpoint}/account`);
const call = async (): Promise<unknown> => {
  const response = await fetch(url, { headers: { cookie: "session=valid" } });

  return await response.json();
};

console.log(await call()); // { invocations: 1 }
console.log(await call()); // { invocations: 1 }, held rather than asked again

// Simulated time passing the TTL drops the decision.
await simAws.clock().advanceBy({ minutes: 6 });

console.log(await call()); // { invocations: 2 }

await srv.close();
