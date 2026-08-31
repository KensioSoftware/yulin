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
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";

function localUrl(apiEndpoint: string, path = "/"): string {
  return new SimAwsLocalUrl({ input: `${apiEndpoint}${path}` }).toString();
}

describe("Serving a request through a sim HTTP API", () => {
  it("routes a request to the integrated function", async () => {
    // Given an API routing every request to a simulated Lambda function
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (event) => ({
          statusCode: 200,
          headers: { "content-type": "text/plain" },
          body: `orders limit ${event.queryStringParameters?.["limit"] ?? "none"}`,
        }),
      },
      simAws,
    );

    // When the generated endpoint is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/orders?limit=10"),
    );

    // Then the function's response is what the client gets back
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(response.headers.get("content-type"), "text/plain");
    assertIdentical(await response.text(), "orders limit 10");
  });

  it("infers a 200 JSON response from a result with no status code", async () => {
    // Given a handler returning a plain object rather than an HTTP response
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: () => ({ body: "hi" }) },
      simAws,
    );

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint),
    );

    // Then the whole object is the response body, because without a status
    // code there is no structured response for API Gateway to read
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(response.headers.get("content-type"), "application/json");
    assertIdentical(await response.text(), '{"body":"hi"}');
  });

  it("posts a request body to the function", async () => {
    // Given a handler echoing the body it was sent
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: (event) => ({ statusCode: 201, body: event.body ?? "" }) },
      simAws,
    );

    // When JSON is posted to the API
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/orders"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"sku":"YL-1"}',
      },
    );

    // Then the handler received it as text and its response comes back
    assertResponseStatus(response, 201, await describeResponse(response));
    assertIdentical(await response.text(), '{"sku":"YL-1"}');
  });

  it("sets cookies a handler returned", async () => {
    // Given a handler returning cookies in the field payload format 2.0 has
    // for them, rather than as set-cookie headers
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: () => ({
          statusCode: 204,
          cookies: ["session=abc; Path=/", "theme=dark"],
        }),
      },
      simAws,
    );

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint),
    );

    // Then each one is a set-cookie header on the response, and a 204 carries
    // no body
    assertResponseStatus(response, 204, await describeResponse(response));
    assertIdentical(
      response.headers.getSetCookie().join(" | "),
      "session=abc; Path=/ | theme=dark",
    );
  });

  it("serves an API from the Account and Region that created it", async () => {
    // Given a function and an API in an Account and Region that are not the
    // defaults
    const simAws = new SimAws();
    const scoped = simAws.account("222222222222").region("us-east-1");
    const { FunctionArn: functionArn } = await scoped.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::222222222222:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "east") },
      }),
    );
    const { ApiId: apiId, ApiEndpoint: apiEndpoint } = await scoped
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // And an integration, route and stage joining the two
    const { IntegrationId: integrationId } = await scoped
      .apiGatewayV2()
      .createIntegration(
        new CreateIntegrationCommand({
          ApiId: apiId,
          IntegrationType: "AWS_PROXY",
          IntegrationUri: functionArn,
          PayloadFormatVersion: "2.0",
        }),
      );
    await scoped.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "$default",
        Target: `integrations/${integrationId}`,
      }),
    );
    await scoped.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );

    // And the function granting that API permission to invoke it
    await scoped.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        StatementId: "api-gateway-invoke",
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceArn: `arn:aws:execute-api:us-east-1:222222222222:${apiId}/*/*`,
      }),
    );

    // When the generated endpoint is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(apiEndpoint),
    );

    // Then the hostname alone was enough to find the owning scope, which is
    // all a request to a real endpoint carries
    assertStringIncludes(apiEndpoint, ".execute-api.us-east-1.");
    assertIdentical(await response.text(), '"east"');
  });
});
