import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload1Event } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

function localUrl(restApi: SimRestApi, path = "", stage = "prod"): string {
  return new SimAwsLocalUrl({
    input: `${restApi.invokeUrl(stage)}${path}`,
  }).toString();
}

/**
 * A handler echoing the event back, for tests about what the event carries.
 */
const echoHandler = (event: SimPayload1Event): unknown => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(event),
});

describe("Serving a request through a sim REST API", () => {
  it("routes a request to the integrated function", async () => {
    // Given an API proxying every request to a simulated Lambda function
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: (event) => ({
          statusCode: 200,
          headers: { "content-type": "text/plain" },
          body: `orders limit ${event.queryStringParameters?.["limit"] ?? "none"}`,
        }),
      },
      simAws,
    );

    // When the generated endpoint is requested under its stage
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders?limit=10"),
    );

    // Then the function's response is what the client gets back
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(response.headers.get("content-type"), "text/plain");
    assertIdentical(await response.text(), "orders limit 10");
  });

  it("sends the payload format 1.0 event a REST API sends", async () => {
    // Given an API with a parameterised resource
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { handler: echoHandler, resourcePaths: ["/orders/{orderId}"] },
      simAws,
    );

    // When one order is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders/6?fields=id&fields=total"),
    );
    const event = (await response.json()) as SimPayload1Event;

    // Then the event names the resource template, the path as sent and the
    // stage, and carries both forms of the query string
    assertIdentical(event.resource, "/orders/{orderId}");
    assertIdentical(event.path, "/prod/orders/6");
    assertIdentical(event.httpMethod, "GET");
    expect(event.pathParameters).toStrictEqual({ orderId: "6" });
    expect(event.queryStringParameters).toStrictEqual({ fields: "total" });
    expect(event.multiValueQueryStringParameters).toStrictEqual({
      fields: ["id", "total"],
    });
    assertIdentical(event.requestContext.stage, "prod");
    assertIdentical(event.requestContext.resourcePath, "/orders/{orderId}");
    assertIdentical(event.requestContext.apiId, restApi.apiId);
    assertIdentical(event.body, null);
    expect(event.multiValueHeaders?.["host"]).toStrictEqual([restApi.hostname]);
  });

  it("sends null for the maps a request left empty", async () => {
    // Given an API with a resource taking no parameters
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { handler: echoHandler, resourcePaths: ["/orders"] },
      simAws,
    );

    // When it is requested with no query string
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );
    const event = (await response.json()) as SimPayload1Event;

    // Then the empty maps are null rather than absent, which is what payload
    // format 1.0 sends and what a handler checking for null relies on
    assertIdentical(event.queryStringParameters, null);
    assertIdentical(event.multiValueQueryStringParameters, null);
    assertIdentical(event.pathParameters, null);
    assertIdentical(event.stageVariables, null);
  });

  it("carries the stage variables the stage was deployed with", async () => {
    // Given a stage with variables
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { handler: echoHandler, stageVariables: { catalogue: "v2" } },
      simAws,
    );

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );
    const event = (await response.json()) as SimPayload1Event;

    // Then the handler reads them
    expect(event.stageVariables).toStrictEqual({ catalogue: "v2" });
  });

  it("posts a request body to the function", async () => {
    // Given an API proxying to a handler that reads the body
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: (event) => ({
          statusCode: 201,
          body: `created ${String(event.body)} base64 ${String(event.isBase64Encoded)}`,
        }),
      },
      simAws,
    );

    // When a JSON body is posted
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"total":10}',
      },
    );

    // Then the handler read it as text, since JSON is a text content type
    assertResponseStatus(response, 201, await describeResponse(response));
    assertIdentical(await response.text(), 'created {"total":10} base64 false');
  });

  it("base64 encodes a body that is not text", async () => {
    // Given an API proxying to a handler reporting what it was sent
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: (event) => ({
          statusCode: 200,
          body: `${String(event.body)}/${String(event.isBase64Encoded)}`,
        }),
      },
      simAws,
    );

    // When binary content is posted
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: new Uint8Array([1, 2, 3]),
      },
    );

    // Then the handler is told it was base64 encoded, as AWS tells it
    assertIdentical(await response.text(), "AQID/true");
  });

  it("sends repeated response headers from multiValueHeaders", async () => {
    // Given a handler setting two cookies
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: () => ({
          statusCode: 200,
          multiValueHeaders: { "set-cookie": ["a=1", "b=2"] },
          body: "ok",
        }),
      },
      simAws,
    );

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );

    // Then both survive, which is what multiValueHeaders is for
    expect(response.headers.getSetCookie()).toStrictEqual(["a=1", "b=2"]);
  });

  it("gives a greedy resource the rest of the path", async () => {
    // Given a catch-all API
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { handler: echoHandler },
      simAws,
    );

    // When a deep path is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders/6/items"),
    );
    const event = (await response.json()) as SimPayload1Event;

    // Then the handler is told which template caught it, and what it caught
    assertIdentical(event.resource, "/{proxy+}");
    expect(event.pathParameters).toStrictEqual({ proxy: "orders/6/items" });
  });
});
