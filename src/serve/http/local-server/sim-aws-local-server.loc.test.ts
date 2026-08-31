import { afterAll, beforeAll, describe, it } from "vitest";
import http from "node:http";
import {
  assertIdentical,
  assertInstanceOf,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsError,
  describeResponse,
} from "@kensio/smartass";
import { serveSimAws, SimAwsLocalServer } from "./sim-aws-local-server.js";

describe("Simulated AWS local HTTP server", () => {
  const srv: SimAwsLocalServer = new SimAwsLocalServer();

  beforeAll(async () => {
    await srv.listen();
  });

  afterAll(async () => {
    await srv.close();
  });

  it("responds HTTP 400 for missing Host header", async () => {
    const response = await new Promise<http.IncomingMessage>(
      (resolve, reject) => {
        const request = http.request(
          {
            hostname: srv.hostname,
            port: srv.port,
            path: "/",
            method: "GET",
            setHost: false,
          },
          resolve,
        );
        request.on("error", reject);
        request.end();
      },
    );

    assertIdentical(response.statusCode, 400);
  });

  it("responds HTTP 501 for unknown host", async () => {
    const response = await fetch(
      `http://foobar.sim-aws.localhost:${srv.port}/`,
    );

    assertResponseStatus(response, 501, await describeResponse(response));
    const responseBody = await response.text();
    assertStringIncludes(
      responseBody,
      "Unknown simulated AWS host foobar.sim-aws.localhost",
    );
  });

  it("routes S3 website request to simulated S3 controller", async () => {
    const response = await fetch(
      `http://my-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/foobar-object.html`,
    );

    assertResponseStatus(response, 404, await describeResponse(response));
    const responseBody = await response.text();
    assertStringIncludes(responseBody, "S3 bucket named my-site not found");
  });

  it("handles node request string and array headers", async () => {
    const response = await new Promise<http.IncomingMessage>(
      (resolve, reject) => {
        const request = http.request(
          {
            hostname: srv.hostname,
            port: srv.port,
            path: "/foobar-object.html",
            method: "GET",
            headers: {
              host: "my-site.s3-website.eu-west-2.sim-aws.localhost",
              "x-string-header": "baz",
              "set-cookie": ["foo=1", "bar=2"],
            },
          },
          resolve,
        );
        request.on("error", reject);
        request.end();
      },
    );

    assertIdentical(response.statusCode, 404);
  });

  it("serves via serveSimAws util function", async () => {
    const server = await serveSimAws();

    const response = await fetch(
      `http://my-site.s3-website.eu-west-2.sim-aws.localhost:${server.port}/foobar-object.html`,
    );

    assertResponseStatus(response, 404, await describeResponse(response));
    const responseBody = await response.text();
    assertStringIncludes(responseBody, "S3 bucket named my-site not found");

    await server.close();
  });

  it("throws on trying to get port before listening", () => {
    const server = new SimAwsLocalServer();

    const error = assertThrowsError(() => server.port);

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "Server is not yet listening, cannot get port number",
    );
  });

  it("adapts a simulated AWS URL for this local server", () => {
    const url = srv.localUrl(
      "https://my-site.s3-website.eu-west-2.sim-aws.localhost/foo/",
    );

    assertIdentical(
      url.toString(),
      `http://my-site.s3-website.eu-west-2.sim-aws.localhost:${srv.port}/foo/`,
    );
  });
});
