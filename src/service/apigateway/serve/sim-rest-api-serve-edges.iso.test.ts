import { PutMethodCommand } from "@aws-sdk/client-api-gateway";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimPayload1EventBuilder } from "../../../serve/payload-1/sim-payload-1-event-builder.js";
import { SimPayload1ResponseBuilder } from "../../../serve/payload-1/sim-payload-1-response-builder.js";
import type { SimPayload1Event } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import { SimApiGatewayServiceController } from "./sim-api-gateway-controller.js";
import { SimApiGatewayRouter } from "./sim-api-gateway-router.js";

function localUrl(restApi: SimRestApi, path = "", stage = "prod"): string {
  return new SimAwsLocalUrl({
    input: `${restApi.invokeUrl(stage)}${path}`,
  }).toString();
}

describe("The edges of serving a sim REST API", () => {
  it("serves the handler the factory defaults to", async () => {
    // Given an API asked for with nothing specified
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make({}, simAws);

    // When it is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );

    // Then the default handler answers
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "hello");
  });

  it("matches the stage root with no path after it", async () => {
    // Given a method on the API's root resource
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { resourcePaths: ["/"] },
      simAws,
    );

    // When the stage is requested with nothing after it
    const response = await new SimAwsHttp({ simAws }).fetch(localUrl(restApi));

    // Then the root resource answers
    assertIdentical(response.status, 200);
  });

  it("answers a request naming no stage at all with Forbidden", async () => {
    // Given a deployed API
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make({}, simAws);

    // When the bare hostname is requested, which names no stage
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({ input: `https://${restApi.hostname}/` }).toString(),
    );

    // Then there is no stage to serve it, so it is refused
    assertIdentical(response.status, 403);
    expect(await response.json()).toStrictEqual({ message: "Forbidden" });
  });

  it("leaves a path segment it cannot decode as it was sent", async () => {
    // Given a parameterised resource
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders/{orderId}"],
        handler: (event) => ({
          statusCode: 200,
          body: String(event.pathParameters?.["orderId"]),
        }),
      },
      simAws,
    );

    // When the segment carries a percent sign that decodes to nothing
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders/%ZZ"),
    );

    // Then it reaches the handler as it was sent, rather than failing the
    // request
    assertIdentical(await response.text(), "%ZZ");
  });

  it("answers 502 for a method with no integration behind it", async () => {
    // Given a method declared with nothing behind it
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { resourcePaths: ["/orders"], httpMethod: "GET" },
      simAws,
    );
    await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId: restApi.apiId,
        resourceId: restApi.resources.findByPath("/orders")?.resourceId,
        httpMethod: "POST",
        authorizationType: "NONE",
      }),
    );

    // When that method is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      { method: "POST" },
    );

    // Then it is the same 502 an unreachable integration gets, which is what
    // real API Gateway answers for a method it cannot integrate
    assertIdentical(response.status, 502);
  });

  it("routes to nothing for an API id it never allocated", () => {
    // Given a router over a simulation with no REST APIs
    const router = new SimApiGatewayRouter({ simAws: new SimAws() });

    // When an id nothing allocated is routed
    const found = router.route({
      service: "executeApi",
      resourceName: "nosuchapi1",
    });

    // Then nothing answers for it
    assertUndefined(found);
  });

  it("answers Forbidden for an API the router cannot reach", async () => {
    // Given the controller over a simulation with no REST APIs, which is what
    // a caller constructing it directly gets
    const controller = new SimApiGatewayServiceController({
      simAws: new SimAws(),
    });

    // When a request naming an API is handled
    const response = await controller.handleRequest(
      new SimAwsServiceRequest({
        target: { service: "executeApi", resourceName: "nosuchapi1" },
        request: new Request(
          "https://nosuchapi1.execute-api.us-east-1.amazonaws.com/prod",
        ),
      }),
    );

    // Then there is nothing to serve it
    assertIdentical(response.status, 403);
  });

  it("builds a router over its own simulation where none is supplied", () => {
    // Given a router asked for with nothing
    const router = new SimApiGatewayRouter();

    // Then it has a simulation of its own to route within
    assertNonNullable(router.simAws);
  });

  it("answers 502 where the integration names a function that is not there", async () => {
    // Given an API whose integration points at a function nothing created
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make({}, simAws);
    await simAws.lambda().deleteFunction({ input: { FunctionName: "orders" } });

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );

    // Then API Gateway discovers it only when it tries to invoke, as it does
    // on AWS
    assertIdentical(response.status, 502);
  });

  it("stamps the event from the real clock where no clock is supplied", async () => {
    // Given an event builder with no clock of its own
    const builder = new SimPayload1EventBuilder();

    // When an event is built
    const event: SimPayload1Event = await builder.build(
      new Request(
        "https://abc1234567.execute-api.us-east-1.amazonaws.com/prod/orders",
      ),
      {
        apiId: "abc1234567",
        accountId: "111111111111",
        domainName: "abc1234567.execute-api.us-east-1.amazonaws.com",
        stage: "prod",
        resourceId: "res1234",
        resourcePath: "/orders",
        httpMethod: "GET",
      },
    );

    // Then it carries a time, taken from the host clock
    assertNonNullable(event.requestContext.requestTime);
    expect(event.requestContext.requestTimeEpoch).toBeGreaterThan(0);
  });

  it("sends an empty handler body as no body at all", () => {
    // Given a handler answering 204 with nothing
    const builder = new SimPayload1ResponseBuilder();

    // When the response is built
    const response = builder.build({ statusCode: 204 });

    // Then the status stays valid, which it would not with an empty body
    assertIdentical(response.status, 204);
    assertIdentical(response.body, null);
  });

  it("decodes a base64 handler body", async () => {
    // Given a handler answering with base64 content
    const builder = new SimPayload1ResponseBuilder();

    // When the response is built
    const response = builder.build({
      statusCode: 200,
      body: "AQID",
      isBase64Encoded: true,
    });

    // Then the client gets the bytes back
    expect(new Uint8Array(await response.arrayBuffer())).toStrictEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
});
