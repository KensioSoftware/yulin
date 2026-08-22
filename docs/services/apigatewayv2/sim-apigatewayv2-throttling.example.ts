/**
 * Throttling a simulated HTTP API stage and one of its routes.
 */

import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

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

for (const RouteKey of ["POST /user/password-reset", "GET /user/profile"]) {
  await apiGateway.createRoute(
    new CreateRouteCommand({
      ApiId,
      RouteKey,
      Target: `integrations/${IntegrationId}`,
    }),
  );
}

await apiGateway.createStage(
  new CreateStageCommand({
    ApiId,
    StageName: "$default",
    AutoDeploy: true,
    DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 5 },
    RouteSettings: {
      "POST /user/password-reset": {
        ThrottlingRateLimit: 1,
        ThrottlingBurstLimit: 2,
      },
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

// Stop simulated time. A bucket now refills only when this example moves it.
simAws.clock().freeze();

const passwordReset = async (): Promise<Response> =>
  await fetch(srv.localUrl(`${ApiEndpoint}/user/password-reset`), {
    method: "POST",
  });

const first = await passwordReset();
const second = await passwordReset();
const third = await passwordReset();

console.log(first.status, second.status, third.status);
console.log(await third.text());

// Another route, drawing on the stage default and a bucket of its own.
const profile = await fetch(srv.localUrl(`${ApiEndpoint}/user/profile`));
console.log(profile.status);

// One second at a rate limit of one is one token back.
await simAws.clock().advanceBy({ seconds: 1 });
const afterASecond = await passwordReset();
console.log(afterASecond.status);

await srv.close();
