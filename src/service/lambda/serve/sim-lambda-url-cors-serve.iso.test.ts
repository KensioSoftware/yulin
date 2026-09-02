import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import type { SimLambdaFunctionUrlCorsParts } from "../function/url/sim-lambda-function-url-cors.factory.js";
import { simLambdaFunctionUrlCorsFactory } from "../function/url/sim-lambda-function-url-cors.factory.js";

describe("Serving a sim Lambda Function URL configured for CORS", () => {
  interface ServedFunctionUrl {
    readonly simAws: SimAws;
    readonly url: string;
  }

  interface GreeterProperties {
    readonly cors?: Partial<SimLambdaFunctionUrlCorsParts> | undefined;
    readonly authType?: "NONE" | "AWS_IAM" | undefined;
    readonly zipFile?: Uint8Array | undefined;
  }

  async function greeterUrl(
    properties: GreeterProperties = {},
  ): Promise<ServedFunctionUrl> {
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile:
            properties.zipFile ??
            makeLambdaZipFileInput(() => ({
              statusCode: 200,
              headers: { "content-type": "text/plain" },
              body: "Hello from a sim Lambda",
            })),
        },
      }),
    );

    const { FunctionUrl } = await simAws.lambda().createFunctionUrlConfig(
      new CreateFunctionUrlConfigCommand({
        FunctionName: "greeter",
        AuthType: properties.authType ?? "NONE",
        ...(properties.cors !== undefined && { Cors: properties.cors }),
      }),
    );
    assertNonNullable(FunctionUrl);

    return {
      simAws,
      url: new SimAwsLocalUrl({ input: FunctionUrl }).toString(),
    };
  }

  function preflight(origin: string, method = "POST"): RequestInit {
    return {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": method,
      },
    };
  }

  it("answers a preflight without invoking the handler", async () => {
    // Given a Function URL whose handler fails whenever it runs at all.
    const { simAws, url } = await greeterUrl({
      cors: simLambdaFunctionUrlCorsFactory.make({
        AllowOrigins: ["https://shop.example.com"],
        AllowMethods: ["GET", "POST"],
        AllowHeaders: ["content-type", "x-api-key"],
        MaxAge: 600,
      }),
      zipFile: makeLambdaZipFileInput(() => {
        throw new Error("the preflight reached the handler");
      }),
    });

    // When a browser sends the preflight for a cross-origin POST.
    const response = await new SimAwsHttp({ simAws }).fetch(
      url,
      preflight("https://shop.example.com"),
    );

    // Then it is answered from the configuration alone. A handler that threw
    // would have produced the bad gateway a Function URL answers with.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "");
    assertIdentical(
      response.headers.get("access-control-allow-origin"),
      "https://shop.example.com",
    );
    assertIdentical(
      response.headers.get("access-control-allow-methods"),
      "GET,POST",
    );
    assertIdentical(
      response.headers.get("access-control-allow-headers"),
      "content-type,x-api-key",
    );
    assertIdentical(response.headers.get("access-control-max-age"), "600");
  });

  it("allows every origin when the configuration names the wildcard", async () => {
    // Given a Function URL open to any Origin.
    const { simAws, url } = await greeterUrl({
      cors: simLambdaFunctionUrlCorsFactory.make({ AllowOrigins: ["*"] }),
    });

    // When a preflight arrives from an Origin the configuration never names.
    const response = await new SimAwsHttp({ simAws }).fetch(
      url,
      preflight("https://anywhere.example.org"),
    );

    // Then the wildcard is what comes back, and not the Origin that asked.
    assertIdentical(response.headers.get("access-control-allow-origin"), "*");
  });

  it("tells an origin outside the list nothing about being allowed", async () => {
    // Given a Function URL allowing one Origin.
    const { simAws, url } = await greeterUrl({
      cors: simLambdaFunctionUrlCorsFactory.make({
        AllowOrigins: ["https://shop.example.com"],
      }),
    });

    // When a preflight arrives from a different Origin.
    const response = await new SimAwsHttp({ simAws }).fetch(
      url,
      preflight("https://attacker.example.org"),
    );

    // Then no Origin is allowed, which is what stops the browser making the
    // call it was asking about.
    assertIdentical(response.headers.get("access-control-allow-origin"), null);
  });

  it("adds the configured headers to a response the handler produced", async () => {
    // Given a Function URL exposing a header and allowing credentials.
    const { simAws, url } = await greeterUrl({
      cors: simLambdaFunctionUrlCorsFactory.make({
        AllowCredentials: true,
        AllowOrigins: ["https://shop.example.com"],
        ExposeHeaders: ["x-request-id", "x-page-count"],
      }),
    });

    // When the function is called from that Origin.
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { origin: "https://shop.example.com" },
    });

    // Then the handler's own response carries the configured CORS headers.
    assertIdentical(await response.text(), "Hello from a sim Lambda");
    assertIdentical(
      response.headers.get("access-control-allow-origin"),
      "https://shop.example.com",
    );
    assertIdentical(
      response.headers.get("access-control-allow-credentials"),
      "true",
    );
    assertIdentical(
      response.headers.get("access-control-expose-headers"),
      "x-request-id,x-page-count",
    );
  });

  it("keeps a CORS header the handler sent as well as the configured one", async () => {
    // Given a Function URL whose handler answers with a CORS header of its own.
    const { simAws, url } = await greeterUrl({
      cors: simLambdaFunctionUrlCorsFactory.make({ AllowOrigins: ["*"] }),
      zipFile: makeLambdaZipFileInput(() => ({
        statusCode: 200,
        headers: { "access-control-allow-origin": "https://shop.example.com" },
        body: "Hello from a sim Lambda",
      })),
    });

    // When the function is called.
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { origin: "https://shop.example.com" },
    });

    // Then both values are there. That is the duplicate a browser complains
    // about on AWS, and the simulator leaves it in place.
    assertStringIncludes(
      response.headers.get("access-control-allow-origin"),
      "https://shop.example.com",
    );
    assertStringIncludes(
      response.headers.get("access-control-allow-origin"),
      "*",
    );
  });

  it("sends only the headers the configuration states", async () => {
    // Given a Function URL whose CORS block names one exposed header and
    // nothing else.
    const { simAws, url } = await greeterUrl({
      cors: { ExposeHeaders: ["x-request-id"] },
    });

    // When the function is called from an Origin.
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      headers: { origin: "https://shop.example.com" },
    });

    // Then that is the only CORS header on the response. A block naming no
    // Origins allows none, rather than allowing the one that asked.
    assertIdentical(
      response.headers.get("access-control-expose-headers"),
      "x-request-id",
    );
    assertIdentical(response.headers.get("access-control-allow-origin"), null);
    assertIdentical(response.headers.get("access-control-allow-methods"), null);
    assertIdentical(response.headers.get("access-control-max-age"), null);
    assertIdentical(
      response.headers.get("access-control-allow-credentials"),
      null,
    );
  });

  it("leaves off a header whose configured list is empty", async () => {
    // Given a Function URL open to any Origin with an empty method list.
    const { simAws, url } = await greeterUrl({
      cors: { AllowOrigins: ["*"], AllowMethods: [] },
    });

    // When a preflight arrives.
    const response = await new SimAwsHttp({ simAws }).fetch(
      url,
      preflight("https://shop.example.com"),
    );

    // Then no method is allowed. An empty header value would say something
    // else to a browser.
    assertIdentical(response.headers.get("access-control-allow-origin"), "*");
    assertIdentical(response.headers.get("access-control-allow-methods"), null);
  });

  it("leaves a URL without CORS answering OPTIONS from the handler", async () => {
    // Given a Function URL with no CORS configuration.
    const { simAws, url } = await greeterUrl({
      zipFile: makeLambdaZipFileInput(() => ({
        statusCode: 204,
        headers: { allow: "GET, POST" },
        body: "",
      })),
    });

    // When a preflight arrives.
    const response = await new SimAwsHttp({ simAws }).fetch(
      url,
      preflight("https://shop.example.com"),
    );

    // Then the handler answered it, and nothing added CORS headers.
    assertResponseStatus(response, 204, await describeResponse(response));
    assertIdentical(response.headers.get("allow"), "GET, POST");
    assertIdentical(response.headers.get("access-control-allow-origin"), null);
  });

  it("refuses an unsigned preflight to an IAM-authenticated URL", async () => {
    // Given an AWS_IAM Function URL configured for CORS.
    const { simAws, url } = await greeterUrl({
      authType: "AWS_IAM",
      cors: simLambdaFunctionUrlCorsFactory.make({ AllowOrigins: ["*"] }),
    });

    // When a browser sends the preflight it cannot sign.
    const response = await new SimAwsHttp({ simAws }).fetch(
      url,
      preflight("https://shop.example.com"),
    );

    // Then the URL refuses it, as it refuses any unsigned request.
    assertResponseStatus(response, 403, await describeResponse(response));
    assertIdentical(response.headers.get("access-control-allow-origin"), null);
  });

  it("leaves an OPTIONS request that is not a preflight to the handler", async () => {
    // Given a Function URL configured for CORS.
    const { simAws, url } = await greeterUrl({
      cors: simLambdaFunctionUrlCorsFactory.make({ AllowOrigins: ["*"] }),
      zipFile: makeLambdaZipFileInput(() => ({
        statusCode: 200,
        headers: { allow: "GET, POST" },
        body: "options from the handler",
      })),
    });

    // When an OPTIONS request arrives naming no method to be preflighted.
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      method: "OPTIONS",
      headers: { origin: "https://shop.example.com" },
    });

    // Then the handler answered it, with the configured headers added the way
    // they are on any other response.
    assertIdentical(await response.text(), "options from the handler");
    assertIdentical(response.headers.get("allow"), "GET, POST");
    assertIdentical(response.headers.get("access-control-allow-origin"), "*");
  });
});
