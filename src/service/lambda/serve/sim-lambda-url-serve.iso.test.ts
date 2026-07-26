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
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../function/sim-lambda-handler.type.js";
import type { SimLambdaFunctionUrlEvent } from "./event/sim-lambda-url-event.type.js";

/**
 * Create a function backed by a real in-process handler and give it a public
 * Function URL, returning the local URL that reaches it.
 */
async function serveFunction(
  simAws: SimAws,
  handler: SimLambdaHandler,
  functionName = "greeter",
): Promise<string> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: "arn:aws:iam::111111111111:role/GreeterRole",
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );

  const created = await simAws.lambda().createFunctionUrlConfig(
    new CreateFunctionUrlConfigCommand({
      FunctionName: functionName,
      AuthType: "NONE",
    }),
  );

  return created.FunctionUrl;
}

function localUrl(functionUrl: string, path = ""): string {
  return new SimAwsLocalUrl({ input: `${functionUrl}${path}` }).toString();
}

describe("Serving a sim Lambda Function URL", () => {
  it("invokes the function and returns its structured response", async () => {
    // Given a function served at a Function URL.
    const simAws = new SimAws();
    const functionUrl = await serveFunction(simAws, () => ({
      statusCode: 201,
      headers: { "content-type": "text/plain", "x-greeting": "hello" },
      body: "Hello from a sim Lambda",
    }));

    // When the Function URL is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
    );

    // Then the handler's status, headers and body are what the client sees.
    assertIdentical(response.status, 201);
    assertIdentical(response.headers.get("content-type"), "text/plain");
    assertIdentical(response.headers.get("x-greeting"), "hello");
    assertIdentical(await response.text(), "Hello from a sim Lambda");
  });

  it("wraps a plain handler result in a JSON response", async () => {
    // Given a function returning a plain value.
    const simAws = new SimAws();
    const functionUrl = await serveFunction(simAws, () => ({
      greeting: "hello",
    }));

    // When the Function URL is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
    );

    // Then Lambda's 200 JSON inference applies.
    assertIdentical(response.status, 200);
    assertIdentical(response.headers.get("content-type"), "application/json");
    assertIdentical(await response.text(), '{"greeting":"hello"}');
  });

  it("passes a payload format 2.0 event to the handler", async () => {
    // Given a function that echoes its invocation event.
    const simAws = new SimAws();
    const functionUrl = await serveFunction(
      simAws,
      (event: SimLambdaFunctionUrlEvent) => event,
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
    const functionUrl = await serveFunction(
      simAws,
      (event: SimLambdaFunctionUrlEvent) => event,
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
    const functionUrl = await serveFunction(
      simAws,
      (event: SimLambdaFunctionUrlEvent) => event,
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
    const functionUrl = await serveFunction(
      simAws,
      (event: SimLambdaFunctionUrlEvent) => event,
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
    const functionUrl = await serveFunction(
      simAws,
      (event: SimLambdaFunctionUrlEvent) => event,
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

  it("decodes a base64 handler response body", async () => {
    // Given a function returning base64-encoded bytes.
    const simAws = new SimAws();
    const functionUrl = await serveFunction(simAws, () => ({
      statusCode: 200,
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from([7, 8, 9]).toString("base64"),
      isBase64Encoded: true,
    }));

    // When the Function URL is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
    );

    // Then the client receives the decoded bytes.
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertArrayEquals([...bytes], [7, 8, 9]);
  });

  it("sends handler cookies as set-cookie headers", async () => {
    // Given a function returning cookies.
    const simAws = new SimAws();
    const functionUrl = await serveFunction(simAws, () => ({
      statusCode: 200,
      cookies: ["session=abc; Path=/", "theme=dark"],
      body: "ok",
    }));

    // When the Function URL is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
    );

    // Then each cookie is its own set-cookie header.
    assertArrayEquals(response.headers.getSetCookie(), [
      "session=abc; Path=/",
      "theme=dark",
    ]);
  });

  it("returns a bodiless response when the handler sends no body", async () => {
    // Given a function returning no content.
    const simAws = new SimAws();
    const functionUrl = await serveFunction(simAws, () => ({
      statusCode: 204,
    }));

    // When the Function URL is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
    );

    // Then the status is passed through without a body.
    assertIdentical(response.status, 204);
    assertIdentical(await response.text(), "");
  });

  it("routes same-named functions in different accounts separately", async () => {
    // Given two accounts with a same-named function, each with a Function URL.
    const simAws = new SimAws();
    const firstUrl = await serveFunction(simAws, () => "first account");
    const secondLambda = simAws.account("222222222222").lambda();
    await secondLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::222222222222:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "second account") },
      }),
    );
    const secondCreated = await secondLambda.createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: "NONE",
      }),
    );
    const secondUrl = secondCreated.FunctionUrl;

    // When each Function URL is requested.
    const http = new SimAwsHttp({ simAws });
    const firstResponse = await http.fetch(localUrl(firstUrl));
    const secondResponse = await http.fetch(localUrl(secondUrl));

    // Then each reaches its own account's function.
    assertIdentical(await firstResponse.text(), '"first account"');
    assertIdentical(await secondResponse.text(), '"second account"');
  });
});
