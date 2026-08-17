import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  isSimAwsEndpointHostname,
  readSimLambdaVmHttpTarget,
} from "./sim-lambda-vm-http-target.js";

describe("sim Lambda vm HTTP request target", () => {
  it("recognises the hostnames AWS issues its endpoints under", () => {
    // Given the endpoint hostnames an SDK resolves for AWS services.
    // Then each is an AWS endpoint.
    assertTrue(isSimAwsEndpointHostname("dynamodb.eu-west-2.amazonaws.com"));
    assertTrue(isSimAwsEndpointHostname("DynamoDB.eu-west-2.amazonaws.com"));
    assertTrue(isSimAwsEndpointHostname("s3.cn-north-1.amazonaws.com.cn"));
    assertTrue(isSimAwsEndpointHostname("scheduler.eu-west-2.api.aws"));

    // And a hostname of the application's own is not.
    assertFalse(isSimAwsEndpointHostname("api.example.com"));
    assertFalse(isSimAwsEndpointHostname("notamazonaws.com"));
  });

  it("leaves the endpoints of one resource to the transport", () => {
    // Given the endpoints AWS issues for a single resource rather than for a
    // service API, which carry an HTTP request rather than a Command.
    // Then a Lambda Function URL is not a service API endpoint.
    assertFalse(
      isSimAwsEndpointHostname("abcdefg1234.lambda-url.eu-west-2.on.aws"),
    );

    // And neither is an API Gateway HTTP API endpoint.
    assertFalse(
      isSimAwsEndpointHostname("abc123.execute-api.eu-west-2.amazonaws.com"),
    );
  });

  it("reads a request made with an options object", () => {
    // Given the options an SDK's HTTP handler passes.
    // When the target is read.
    const target = readSimLambdaVmHttpTarget([
      {
        host: "dynamodb.eu-west-2.amazonaws.com",
        method: "POST",
        path: "/",
        headers: { "X-Amz-Target": "DynamoDB_20120810.GetItem" },
      },
      (): void => undefined,
    ]);

    // Then it names where the request is addressed, with header names in one
    // case whatever case they were given in.
    assertNonNullable(target);
    assertIdentical(target.hostname, "dynamodb.eu-west-2.amazonaws.com");
    assertIdentical(target.method, "POST");
    assertIdentical(target.path, "/");
    assertIdentical(
      target.headers["x-amz-target"],
      "DynamoDB_20120810.GetItem",
    );
  });

  it("reads a request made with a URL and options", () => {
    // Given a request made the other way `http.request` accepts.
    // When the target is read.
    const target = readSimLambdaVmHttpTarget([
      "https://sqs.eu-west-2.amazonaws.com/queue?limit=1",
      { method: "PUT", headers: { Accept: ["a", "b"], "x-count": 2 } },
    ]);

    // Then the URL supplies what the options do not, query string included.
    assertNonNullable(target);
    assertIdentical(target.hostname, "sqs.eu-west-2.amazonaws.com");
    assertIdentical(target.path, "/queue?limit=1");
    assertIdentical(target.method, "PUT");
    assertIdentical(target.headers["accept"], "a,b");
    assertIdentical(target.headers["x-count"], "2");
  });

  it("drops the port a host option carries", () => {
    // Given options naming a host with a port, as `host` may.
    // When the target is read.
    const target = readSimLambdaVmHttpTarget([
      { host: "localhost:4566", headers: undefined },
    ]);

    // Then the hostname is left without it, and the defaults stand in for
    // what was not said.
    assertNonNullable(target);
    assertIdentical(target.hostname, "localhost");
    assertIdentical(target.method, "GET");
    assertIdentical(target.path, "/");
  });

  it("reads a request made with a URL object", () => {
    // Given a request addressed with a URL instance.
    // When the target is read.
    const target = readSimLambdaVmHttpTarget([
      new URL("https://kms.eu-west-2.amazonaws.com/keys"),
    ]);

    // Then it is read from the URL alone.
    assertNonNullable(target);
    assertIdentical(target.hostname, "kms.eu-west-2.amazonaws.com");
    assertIdentical(target.path, "/keys");
  });

  it("reads nothing from arguments naming no host", () => {
    // Given arguments that name no host at all.
    // When the target is read.
    // Then there is nothing to route, and the host module can say so itself.
    assertUndefined(readSimLambdaVmHttpTarget(["not a url"]));
    assertUndefined(readSimLambdaVmHttpTarget([{ method: "GET" }]));
    assertUndefined(readSimLambdaVmHttpTarget([]));
  });
});
