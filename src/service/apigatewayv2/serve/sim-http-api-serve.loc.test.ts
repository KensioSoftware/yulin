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
import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { serveSimAws } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";

describe("Serving a sim HTTP API on localhost", () => {
  it("proxies a real localhost request to the integrated function", async () => {
    // Given a simulated Lambda function
    const simAws = new SimAws();
    const { FunctionArn: functionArn } = await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(
            (event: { queryStringParameters?: { limit?: string } }) => ({
              statusCode: 200,
              headers: { "content-type": "text/plain" },
              body: `orders limit ${event.queryStringParameters?.limit ?? "none"}`,
            }),
          ),
        },
      }),
    );

    // And an HTTP API proxying every request to it
    const { ApiId: apiId, ApiEndpoint: apiEndpoint } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );
    const { IntegrationId: integrationId } = await simAws
      .apiGatewayV2()
      .createIntegration(
        new CreateIntegrationCommand({
          ApiId: apiId,
          IntegrationType: "AWS_PROXY",
          IntegrationUri: functionArn,
          PayloadFormatVersion: "2.0",
        }),
      );
    await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "$default",
        Target: `integrations/${integrationId}`,
      }),
    );
    await simAws.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );

    // And the function allowing that API to invoke it
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        StatementId: "api-gateway-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${apiId}/*/*`,
      }),
    );

    // And the simulation served on localhost
    const srv = await serveSimAws({ simAws });

    try {
      // When the API endpoint is fetched over real localhost HTTP
      const response = await fetch(
        srv.localUrl(`${apiEndpoint}/orders?limit=10`),
      );

      // Then the function handled the real HTTP request
      assertResponseStatus(response, 200, await describeResponse(response));
      assertIdentical(response.headers.get("content-type"), "text/plain");
      assertIdentical(await response.text(), "orders limit 10");
    } finally {
      await srv.close();
    }
  });
});
