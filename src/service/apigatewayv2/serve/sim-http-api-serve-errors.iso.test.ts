import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
  DeleteApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import { CreateFunctionCommand } from "@aws-sdk/client-lambda";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";

function localUrl(apiEndpoint: string, path = "/"): string {
  return new SimAwsLocalUrl({ input: `${apiEndpoint}${path}` }).toString();
}

describe("What a served sim HTTP API answers when it cannot proxy", () => {
  it("answers 404 for an API id nothing serves", async () => {
    // Given a simulated AWS with no APIs in it
    const simAws = new SimAws();

    // When a plausible API endpoint is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl("https://abcdefghij.execute-api.eu-west-2.amazonaws.com"),
    );

    // Then the endpoint reports it the way real API Gateway does, with the
    // lower-case message field an HTTP API uses
    assertIdentical(response.status, 404);
    expect(await response.json()).toStrictEqual({ message: "Not Found" });
  });

  it("stops serving an API that was deleted", async () => {
    // Given an API that served requests
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make({}, simAws);
    const http = new SimAwsHttp({ simAws });
    const served = await http.fetch(localUrl(api.apiEndpoint));
    assertIdentical(served.status, 200);

    // When it is deleted
    await simAws
      .apiGatewayV2()
      .deleteApi(new DeleteApiCommand({ ApiId: api.apiId }));

    // Then its endpoint stops resolving, id and all
    const response = await http.fetch(localUrl(api.apiEndpoint));
    assertIdentical(response.status, 404);
  });

  it("answers 404 for an API with no route or stage yet", async () => {
    // Given an API with nothing behind its endpoint
    const simAws = new SimAws();
    const { ApiEndpoint: apiEndpoint } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // When the endpoint is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(apiEndpoint),
    );

    // Then there is nothing to route the request to
    assertIdentical(response.status, 404);
  });

  it("answers 403 when the generated endpoint is disabled", async () => {
    // Given an API that switched its generated endpoint off, as an API
    // reachable only through a custom domain does
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { disableExecuteApiEndpoint: true },
      simAws,
    );

    // When the generated endpoint is requested anyway
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint),
    );

    // Then it refuses the request rather than proxying it
    assertIdentical(response.status, 403);
    expect(await response.json()).toStrictEqual({ message: "Forbidden" });
  });

  it("answers 500 when the integrated function fails", async () => {
    // Given an API proxying to a function that throws
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (): never => {
          throw new Error("no database");
        },
      },
      simAws,
    );

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint),
    );

    // Then the failure is reported as the endpoint's own error, with nothing
    // of the handler's error in it
    assertIdentical(response.status, 500);
    expect(await response.json()).toStrictEqual({
      message: "Internal Server Error",
    });
  });

  it("answers 500 when the integrated function is not there", async () => {
    // Given an integration naming a function in an Account that has none
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "orders",
        Role: "arn:aws:iam::111111111111:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "hello") },
      }),
    );
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
          IntegrationUri:
            "arn:aws:lambda:eu-west-2:999999999999:function:orders",
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

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(apiEndpoint),
    );

    // Then the missing function surfaces where real API Gateway finds it too,
    // at the invocation rather than at the integration that named it
    assertIdentical(response.status, 500);
  });
});
