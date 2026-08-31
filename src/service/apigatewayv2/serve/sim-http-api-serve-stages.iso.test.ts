import {
  assertIdentical,
  assertResponseStatus,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";

function localUrl(apiEndpoint: string, path: string): string {
  return new SimAwsLocalUrl({ input: `${apiEndpoint}${path}` }).toString();
}

/** A handler echoing its invocation event back, so a test can assert on it. */
const echoEvent = (event: SimPayload2Event): SimPayload2Event => event;

describe("Serving a sim HTTP API from a named stage", () => {
  it("serves a named stage under its own path segment", async () => {
    // Given an API with a named stage and a parameterised route
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: echoEvent,
        routeKeys: ["GET /pets/{petId}"],
        stageNames: ["dev"],
      },
      simAws,
    );

    // When a request arrives under the stage name
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/dev/pets/6"),
    );

    // Then the stage segment is not part of what the route matched, but it is
    // part of the path the event reports. The stage prefix in rawPath is
    // corroborated by the documented $context.path access log variable, "the
    // request path, for example /{stage}/root/child", rather than by the
    // payload format page.
    const event = (await response.json()) as SimPayload2Event;
    assertIdentical(event.rawPath, "/dev/pets/6");
    assertIdentical(event.requestContext.http.path, "/dev/pets/6");
    assertIdentical(event.requestContext.stage, "dev");
    assertIdentical(event.routeKey, "GET /pets/{petId}");
    expect(event.pathParameters).toStrictEqual({ petId: "6" });
  });

  it("selects the stage before it selects the route", async () => {
    // Given an API whose stage name is also the first segment of one of its
    // routes
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: echoEvent,
        routeKeys: ["GET /dog", "GET /pets/dog"],
        stageNames: ["$default", "pets"],
      },
      simAws,
    );

    // When a request could be read either way
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/pets/dog"),
    );

    // Then the stage takes the first segment and the routes only see what is
    // left, so an explicit stage match beats any route match
    const event = (await response.json()) as SimPayload2Event;
    assertIdentical(event.requestContext.stage, "pets");
    assertIdentical(event.routeKey, "GET /dog");
  });

  it("serves the default stage at the root of the endpoint", async () => {
    // Given an API with both a default stage and a named one
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: echoEvent,
        routeKeys: ["GET /pets"],
        stageNames: ["$default", "dev"],
      },
      simAws,
    );
    const http = new SimAwsHttp({ simAws });

    // When the same route is requested with and without the stage name
    const root = await http.fetch(localUrl(api.apiEndpoint, "/pets"));
    const named = await http.fetch(localUrl(api.apiEndpoint, "/dev/pets"));

    // Then both reach the route, from the stage their path named
    const rootEvent = (await root.json()) as SimPayload2Event;
    const namedEvent = (await named.json()) as SimPayload2Event;
    assertIdentical(rootEvent.requestContext.stage, "$default");
    assertIdentical(namedEvent.requestContext.stage, "dev");
    assertIdentical(namedEvent.rawPath, "/dev/pets");
  });

  it("answers 404 when no stage serves the request", async () => {
    // Given an API with only a named stage
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: echoEvent,
        routeKeys: ["$default"],
        stageNames: ["dev"],
      },
      simAws,
    );

    // When a request arrives outside that stage, with no default stage to
    // catch it
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/pets"),
    );

    // Then there is nothing to serve it, even though the API has a catch-all
    // route
    assertResponseStatus(response, 404, await describeResponse(response));
    expect(await response.json()).toStrictEqual({ message: "Not Found" });
  });

  it("gives the handler the variables of the stage that served it", async () => {
    // Given an API with a named stage carrying stage variables
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: echoEvent,
        routeKeys: ["$default"],
        stageNames: ["dev"],
        stageVariables: { catalogue: "v2" },
      },
      simAws,
    );

    // When it serves a request
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/dev/pets"),
    );

    // Then the variables reach the handler
    const event = (await response.json()) as SimPayload2Event;
    expect(event.stageVariables).toStrictEqual({ catalogue: "v2" });
  });

  it("leaves stage variables out of the event for a stage with none", async () => {
    // Given an API whose stage carries no variables
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, stageNames: ["dev"] },
      simAws,
    );

    // When it serves a request
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/dev"),
    );

    // Then the field is absent rather than empty
    const event = (await response.json()) as SimPayload2Event;
    assertUndefined(event.stageVariables);
  });
});
