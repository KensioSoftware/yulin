import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringMatches,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";

function localUrl(apiEndpoint: string, path = "/"): string {
  return new SimAwsLocalUrl({ input: `${apiEndpoint}${path}` }).toString();
}

/** A handler echoing its invocation event back, so a test can assert on it. */
const echoEvent = (event: SimPayload2Event): SimPayload2Event => event;

describe("The event a served sim HTTP API builds", () => {
  it("passes a payload format 2.0 event to the integrated function", async () => {
    // Given an API proxying to a function that echoes its invocation event
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent },
      simAws,
    );

    // When the API is requested with a query and a cookie
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/orders?status=open&status=paid"),
      { headers: { cookie: "session=abc; theme=dark", "X-Test": "yes" } },
    );

    // Then the event carries the payload format 2.0 request details
    const event = (await response.json()) as SimPayload2Event;
    assertIdentical(event.version, "2.0");
    assertIdentical(event.rawPath, "/orders");
    assertIdentical(event.rawQueryString, "status=open&status=paid");
    assertIdentical(event.queryStringParameters?.["status"], "open,paid");
    assertIdentical(event.headers["x-test"], "yes");
    assertIdentical(event.requestContext.http.method, "GET");
    assertIdentical(event.requestContext.http.path, "/orders");

    // And the cookies travel in their own field rather than as a header
    assertNonNullable(event.cookies);
    assertArrayEquals(event.cookies, ["session=abc", "theme=dark"]);
    assertUndefined(event.headers["cookie"]);
  });

  it("names the API, route and stage in the event request context", async () => {
    // Given an API proxying to a function that echoes its invocation event
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent },
      simAws,
    );

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint),
    );

    // Then the request context describes the AWS-shaped endpoint the request
    // reached, and the route and stage that served it
    const { requestContext } = (await response.json()) as SimPayload2Event;
    assertIdentical(requestContext.apiId, api.apiId);
    assertIdentical(requestContext.domainName, api.hostname);
    assertIdentical(requestContext.domainPrefix, api.apiId);
    assertIdentical(requestContext.routeKey, "$default");
    assertIdentical(requestContext.stage, "$default");
    assertStringMatches(
      requestContext.time,
      /^\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000$/,
    );

    // And no caller, because a NONE route authenticates nobody
    assertUndefined(requestContext.authorizer);
    assertIdentical(requestContext.accountId, "anonymous");
  });

  it("replaces the proxy headers real API Gateway sets itself", async () => {
    // Given an API proxying to a function that echoes its invocation event
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent },
      simAws,
    );

    // When the API is requested with forwarding headers of its own
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint),
      { headers: { "x-forwarded-proto": "http", "x-forwarded-port": "8080" } },
    );

    // Then the handler sees the API's own hostname and the HTTPS endpoint AWS
    // describes, not the localhost request that actually arrived or the
    // headers the client sent
    const { headers } = (await response.json()) as SimPayload2Event;
    assertIdentical(headers["host"], api.hostname);
    assertIdentical(headers["x-forwarded-proto"], "https");
    assertIdentical(headers["x-forwarded-port"], "443");
    assertIdentical(headers["x-forwarded-for"], "127.0.0.1");
    assertStringMatches(
      headers["x-amzn-trace-id"],
      /^Root=1-[0-9a-f]{8}-[0-9a-f]{24}$/,
    );
  });

  it("gives the handler the stage's variables", async () => {
    // Given an API whose $default stage carries stage variables
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, stageVariables: { catalogue: "v2" } },
      simAws,
    );

    // When the API is requested
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint),
    );

    // Then the handler reads them off the event
    const event = (await response.json()) as SimPayload2Event;
    assertIdentical(event.stageVariables?.["catalogue"], "v2");
  });
});
