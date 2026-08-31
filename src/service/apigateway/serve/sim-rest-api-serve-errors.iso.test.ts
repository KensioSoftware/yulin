import {
  CreateApiCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

function localUrl(restApi: SimRestApi, path = "", stage = "prod"): string {
  return new SimAwsLocalUrl({
    input: `${restApi.invokeUrl(stage)}${path}`,
  }).toString();
}

describe("What a sim REST API answers when nothing serves the request", () => {
  it("answers a stage it does not serve with Forbidden", async () => {
    // Given an API deployed to prod
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make({}, simAws);

    // When another stage is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders", "dev"),
    );

    // Then it is a plain Forbidden, which is what real API Gateway answers for
    // a stage that is not there
    assertResponseStatus(response, 403, await describeResponse(response));
    expect(await response.json()).toStrictEqual({ message: "Forbidden" });
  });

  it("answers a path it has no method for with Missing Authentication Token", async () => {
    // Given an API declaring one path
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { resourcePaths: ["/orders"] },
      simAws,
    );

    // When another path is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/invoices"),
    );

    // Then it is the message real API Gateway is well known for, misleading
    // wording and all
    assertResponseStatus(response, 403, await describeResponse(response));
    expect(await response.json()).toStrictEqual({
      message: "Missing Authentication Token",
    });
  });

  it("answers a method the resource does not declare the same way", async () => {
    // Given a resource declaring only GET
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { resourcePaths: ["/orders"], httpMethod: "GET" },
      simAws,
    );

    // When it is posted to
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      { method: "POST" },
    );

    // Then nothing matched, so the same answer comes back
    assertResponseStatus(response, 403, await describeResponse(response));
    expect(await response.json()).toStrictEqual({
      message: "Missing Authentication Token",
    });
  });

  it("answers an API with its generated endpoint switched off with Forbidden", async () => {
    // Given an API reachable only through a custom domain
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { disableExecuteApiEndpoint: true },
      simAws,
    );

    // When the generated endpoint is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );

    // Then it is refused
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("answers 502 where the API may not invoke the function", async () => {
    // Given an integration the function granted nothing
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { invokePermission: false },
      simAws,
    );

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );

    // Then it is the 502 real API Gateway answers, with the reason left in its
    // own logs
    assertResponseStatus(response, 502, await describeResponse(response));
    expect(await response.json()).toStrictEqual({
      message: "Internal server error",
    });
  });

  it("answers 502 where the handler returns no status code", async () => {
    // Given a handler returning a plain object
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { handler: () => ({ body: "hi" }) },
      simAws,
    );

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );

    // Then it is a 502, because a REST API proxy integration takes one shape
    // only. Payload format 2.0 is the lenient one, and a handler relying on
    // that behaves differently here for the same reason it does on AWS
    assertResponseStatus(response, 502, await describeResponse(response));
  });

  it("answers 502 where the handler throws", async () => {
    // Given a handler that fails
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: () => {
          throw new Error("no items");
        },
      },
      simAws,
    );

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );

    // Then the error stays in the function's logs and the client gets a 502
    assertResponseStatus(response, 502, await describeResponse(response));
  });

  it("answers an API id nothing allocated with the HTTP API's own answer", async () => {
    // Given a simulation with no APIs at all
    const simAws = new SimAws();

    // When an invented endpoint is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({
        input: "https://nosuchapi1.execute-api.us-east-1.amazonaws.com/prod",
      }).toString(),
    );

    // Then the HTTP API controller answers, since neither service allocated
    // the id and that is what the endpoint answered before REST APIs existed
    assertResponseStatus(response, 404, await describeResponse(response));
  });

  it("keeps a REST API and an HTTP API apart on one simulation", async () => {
    // Given both kinds of API in one simulated AWS
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { handler: () => ({ statusCode: 200, body: "rest" }) },
      simAws,
    );
    const { ApiId: httpApiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );
    await simAws.apiGatewayV2().createStage(
      new CreateStageCommand({
        ApiId: httpApiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );

    // When each endpoint is requested
    const restResponse = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );
    const httpResponse = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({
        input: `https://${httpApiId}.execute-api.us-east-1.amazonaws.com/orders`,
      }).toString(),
    );

    // Then each reaches its own service, though both endpoints share the
    // execute-api hostname shape
    assertResponseStatus(
      restResponse,
      200,
      await describeResponse(restResponse),
    );
    assertIdentical(await restResponse.text(), "rest");
    // The HTTP API has no route for the path, which is its own 404 rather than
    // anything the REST API would have said
    assertResponseStatus(
      httpResponse,
      404,
      await describeResponse(httpResponse),
    );
  });
});
