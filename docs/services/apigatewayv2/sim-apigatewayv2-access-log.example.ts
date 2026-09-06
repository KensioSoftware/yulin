/**
 * Recording a simulated HTTP API stage's access log, including a request the
 * stage's throttle refused.
 */

import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  CreateLogGroupCommand,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const logGroupName = "/aws/vendedlogs/user-api";

await simAws.logs().createLogGroup(new CreateLogGroupCommand({ logGroupName }));

const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "users",
    Role: "arn:aws:iam::111111111111:role/UsersRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: "ok",
      })),
    },
  }),
);

const apiGateway = simAws.apiGatewayV2();
const { ApiId, ApiEndpoint } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "users", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: FunctionArn,
    PayloadFormatVersion: "2.0",
  }),
);

await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /user/profile",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({
    ApiId,
    StageName: "$default",
    AutoDeploy: true,
    DefaultRouteSettings: { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 1 },
    AccessLogSettings: {
      DestinationArn: `arn:aws:logs:us-east-1:888888888888:log-group:${logGroupName}:*`,
      Format:
        "$context.httpMethod $context.path $context.status " +
        "$context.error.message",
    },
  }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "users",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${ApiId}/*/*`,
  }),
);

const srv = await serveSimAws({ simAws });
simAws.clock().freeze();

const profile = srv.localUrl(`${ApiEndpoint}/user/profile`);
await fetch(profile);
await fetch(profile);

const { events } = await simAws
  .logs()
  .filterLogEvents(new FilterLogEventsCommand({ logGroupName }));

const lines = events ?? [];

for (const event of lines) {
  console.log(event.message);
}

await srv.close();
