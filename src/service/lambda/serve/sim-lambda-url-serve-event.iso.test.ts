import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import type { SimLambdaFunctionUrlEvent } from "./event/sim-lambda-url-event.type.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimLambdaServiceController } from "./sim-lambda-controller.js";
import { SimLambdaUrlRouter } from "./sim-lambda-url-router.js";

/**
 * Function code echoing the invocation event straight back, so a test can
 * assert on what the serving layer built.
 */
const echoEventCode = {
  ZipFile: makeLambdaZipFileInput((event: SimLambdaFunctionUrlEvent) => event),
};

function localUrl(functionUrl: string, path = ""): string {
  return new SimAwsLocalUrl({ input: `${functionUrl}${path}` }).toString();
}

describe("The event a served sim Lambda Function URL builds", () => {
  it("passes a payload format 2.0 event to the handler", async () => {
    // Given a function that echoes its invocation event.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: echoEventCode,
      }),
    );

    // And a public Function URL for it.
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );

    // When the Function URL is requested with a query and a cookie.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl, "hello/world?name=yulin&name=again"),
      { headers: { cookie: "session=abc; theme=dark", "X-Test": "yes" } },
    );

    // Then the event carries the payload format 2.0 request details.
    const event = (await response.json()) as SimLambdaFunctionUrlEvent;
    assertIdentical(event.version, "2.0");
    assertIdentical(event.rawPath, "/hello/world");
    assertIdentical(event.rawQueryString, "name=yulin&name=again");
    assertIdentical(event.queryStringParameters?.["name"], "yulin,again");
    assertIdentical(event.headers["x-test"], "yes");
    assertIdentical(event.requestContext.http.method, "GET");
    assertIdentical(event.requestContext.http.path, "/hello/world");
    assertFalse(event.isBase64Encoded);
  });

  it("delivers cookies in their own event field", async () => {
    // Given a function that echoes its invocation event.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: echoEventCode,
      }),
    );

    // And a public Function URL for it.
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );

    // When the Function URL is requested with cookies.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
      { headers: { cookie: "session=abc; theme=dark" } },
    );

    // Then the cookies are listed separately and not left in the headers.
    const event = (await response.json()) as SimLambdaFunctionUrlEvent;
    assertNonNullable(event.cookies);
    assertArrayEquals(event.cookies, ["session=abc", "theme=dark"]);
    assertUndefined(event.headers["cookie"]);
  });

  it("names the AWS endpoint in the event request context", async () => {
    // Given a function served at a Function URL.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: echoEventCode,
      }),
    );

    // And a public Function URL for it.
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );

    // When the Function URL is requested on localhost.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
    );

    // Then the request context describes the AWS-shaped endpoint.
    const event = (await response.json()) as SimLambdaFunctionUrlEvent;
    assertIdentical(`https://${event.requestContext.domainName}/`, functionUrl);
    assertIdentical(
      event.requestContext.apiId,
      event.requestContext.domainPrefix,
    );
    assertIdentical(event.requestContext.accountId, "anonymous");
    assertTrue(
      /^\d{2}\/[A-Z][a-z]{2}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000$/.test(
        event.requestContext.time,
      ),
      `Unexpected request context time ${event.requestContext.time}`,
    );
  });

  it("passes a text request body through as a string", async () => {
    // Given a function that echoes its invocation event.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: echoEventCode,
      }),
    );

    // And a public Function URL for it.
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );

    // When JSON is posted to the Function URL.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"name":"yulin"}',
      },
    );

    // Then the handler receives the body as text.
    const event = (await response.json()) as SimLambdaFunctionUrlEvent;
    assertIdentical(event.body, '{"name":"yulin"}');
    assertFalse(event.isBase64Encoded);
    assertIdentical(event.requestContext.http.method, "POST");
  });

  it("base64-encodes a binary request body", async () => {
    // Given a function that echoes its invocation event.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: echoEventCode,
      }),
    );

    // And a public Function URL for it.
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );

    // When binary content is posted to the Function URL.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
      {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: new Uint8Array([1, 2, 3]),
      },
    );

    // Then the handler receives base64, flagged as such.
    const event = (await response.json()) as SimLambdaFunctionUrlEvent;
    assertIdentical(event.body, Buffer.from([1, 2, 3]).toString("base64"));
    assertTrue(event.isBase64Encoded);
  });

  it("stamps the event from the clock of the router's simulation", async () => {
    // Given a controller built from a router alone, with no separate SimAws,
    // where that router's simulation has a stopped clock
    const instant = new Date("2026-07-26T09:30:00.000Z");
    const simAws = new SimAws({ clock: new SimFixedClock(instant) });
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(
            (event: SimLambdaFunctionUrlEvent) =>
              event.requestContext.timeEpoch,
          ),
        },
      }),
    );

    // And a public Function URL for it.
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );
    const controller = new SimLambdaServiceController({
      router: new SimLambdaUrlRouter({ simAws }),
    });

    // When the Function URL is invoked through it
    const url = new URL(localUrl(functionUrl));
    const response = await controller.handleRequest(
      new SimAwsServiceRequest({
        target: {
          service: "lambda",
          resourceName: url.hostname.split(".", 1)[0] ?? "",
          regionName: simAws.defaultRegionName,
        },
        request: new Request(url),
      }),
    );

    // Then the event carries the router's simulated time, not the real time
    assertIdentical(await response.text(), String(instant.getTime()));
  });
});
