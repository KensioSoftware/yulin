import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

function localUrl(functionUrl: string, path = ""): string {
  return new SimAwsLocalUrl({ input: `${functionUrl}${path}` }).toString();
}

describe("Serving a sim Lambda Function URL", () => {
  it("invokes the function and returns its structured response", async () => {
    // Given a function served at a Function URL.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => ({
            statusCode: 201,
            headers: { "content-type": "text/plain", "x-greeting": "hello" },
            body: "Hello from a sim Lambda",
          })),
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
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => ({
            greeting: "hello",
          })),
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

    // When the Function URL is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(functionUrl),
    );

    // Then Lambda's 200 JSON inference applies.
    assertIdentical(response.status, 200);
    assertIdentical(response.headers.get("content-type"), "application/json");
    assertIdentical(await response.text(), '{"greeting":"hello"}');
  });

  it("decodes a base64 handler response body", async () => {
    // Given a function returning base64-encoded bytes.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => ({
            statusCode: 200,
            headers: { "content-type": "application/octet-stream" },
            body: Buffer.from([7, 8, 9]).toString("base64"),
            isBase64Encoded: true,
          })),
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
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => ({
            statusCode: 200,
            cookies: ["session=abc; Path=/", "theme=dark"],
            body: "ok",
          })),
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
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(() => ({
            statusCode: 204,
          })),
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
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "first account") },
      }),
    );

    // And a public Function URL for it.
    const { FunctionUrl: firstUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );
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
