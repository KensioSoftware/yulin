import { afterAll, beforeAll, describe, it } from "vitest";
import http, { type Server } from "node:http";
import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { SimAws } from "../../service/aws/sim-aws.js";
import { serveSimAws } from "./sim-aws-local-server.js";

describe("Simulated AWS local HTTP server", () => {
  let server: Server | undefined;
  let port = "";

  beforeAll(async () => {
    server = serveSimAws(new SimAws());
    await new Promise<void>((resolve) => {
      server?.once("listening", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected local HTTP server to listen on a TCP port");
    }
    port = String(address.port);
  });

  afterAll(() => {
    server?.close();
  });

  it("responds HTTP 400 for missing Host header", async () => {
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/",
          method: "GET",
          setHost: false,
        },
        resolve,
      );
      request.on("error", reject);
      request.end();
    });

    assertIdentical(res.statusCode, 400);
  });

  it("responds HTTP 501 for unknown host", async () => {
    const res = await fetch(`http://foobar.localhost:${port}/`);

    assertIdentical(res.status, 501);
    const resBody = await res.text();
    assertStringIncludes(
      resBody,
      "Unknown simulated AWS host foobar.localhost",
    );
  });

  it("routes S3 website request to simulated S3 controller", async () => {
    const res = await fetch(
      `http://my-site.s3-website.eu-west-2.localhost:${port}/foobar-object.html`,
    );

    assertIdentical(res.status, 404);
    const resBody = await res.text();
    assertStringIncludes(resBody, "S3 bucket named my-site not found");
  });
});
