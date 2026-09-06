import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it, vi } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";

const logGroupName = "/aws/vendedlogs/orders-access";

function destinationArn(simAws: SimAws): string {
  const { accountId, regionName } =
    simAws.accountRegionScope().accountRegionScope;

  return `arn:aws:logs:${regionName}:${accountId}:log-group:${logGroupName}:*`;
}

function localUrl(apiEndpoint: string, path = ""): string {
  return new SimAwsLocalUrl({ input: `${apiEndpoint}${path}` }).toString();
}

/** Every line the access log group holds, in the order it was written. */
async function accessLogLines(simAws: SimAws): Promise<readonly string[]> {
  const { events } = await simAws.logs().filterLogEvents({
    input: { logGroupName },
  });

  return (events ?? []).map((event) => event.message);
}

/**
 * Capture what reaches the host's standard output, which is the console a test
 * run prints to.
 */
function captureHostStdout(): string[] {
  const written: string[] = [];

  vi.spyOn(process.stdout, "write").mockImplementation((chunk): boolean => {
    written.push(String(chunk));
    return true;
  });

  return written;
}

describe("Writing a sim HTTP API stage's access log", () => {
  it("writes one line per served request, with the format substituted", async () => {
    // Given a stage that logs the request id, method, path and status
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (): string => "hello",
        accessLogSettings: {
          DestinationArn: destinationArn(simAws),
          Format:
            "$context.requestId $context.httpMethod $context.path $context.status",
        },
      },
      simAws,
    );

    // When a request is served
    await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/orders"),
    );

    // Then the line describes it, and the request id is the one the endpoint
    // assigned rather than a placeholder
    const [line] = await accessLogLines(simAws);
    assertDefined(line, "the access log line for the served request");
    const [requestId, method, path, status] = line.split(" ", 4);
    expect(requestId).toMatch(/^[\da-f-]{36}$/);
    assertIdentical(method, "GET");
    assertIdentical(path, "/orders");
    assertIdentical(status, "200");
  });

  it("names the same request in the access log and in the handler's event", async () => {
    // Given a stage logging the request id, behind a handler that reports the
    // one its own event carries
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (event: SimPayload2Event): string =>
          event.requestContext.requestId,
        accessLogSettings: {
          DestinationArn: destinationArn(simAws),
          Format: "$context.requestId",
        },
      },
      simAws,
    );

    // When the request is served
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint),
    );

    // Then both name one request. The handler returned a string, which the
    // proxy response builder answers as JSON.
    const [line] = await accessLogLines(simAws);
    assertIdentical(line, (await response.json()) as string);
  });

  it("writes a line for a request the stage's throttle refused", async () => {
    // Given a stage that admits one request and logs what it answers
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (): string => "hello",
        defaultRouteSettings: {
          ThrottlingRateLimit: 1,
          ThrottlingBurstLimit: 1,
        },
        accessLogSettings: {
          DestinationArn: destinationArn(simAws),
          Format: "$context.status $context.error.message",
        },
      },
      simAws,
    );
    const http = new SimAwsHttp({ simAws });

    // When one more request arrives than the throttle admits. The clock is
    // held still, so the bucket refills only when this test moves it.
    simAws.clock().freeze();
    await http.fetch(localUrl(api.apiEndpoint));
    const refused = await http.fetch(localUrl(api.apiEndpoint));

    // Then the refused request is logged, though no integration ran for it
    assertResponseStatus(refused, 429, await describeResponse(refused));
    expect(await accessLogLines(simAws)).toStrictEqual([
      "200 -",
      "429 Too Many Requests",
    ]);
  });

  it("writes a line for a request a Lambda authorizer refused", async () => {
    // Given a stage behind an authorizer that denies the request
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (): string => "hello",
        requestAuthorizer: {
          functionName: "origin-check",
          identitySource: ["$request.header.x-origin-secret"],
          handler: (): unknown => ({ isAuthorized: false }),
          enableSimpleResponses: true,
          resultTtlSeconds: 0,
          invokePermission: true,
        },
        accessLogSettings: {
          DestinationArn: destinationArn(simAws),
          Format: "$context.status $context.routeKey",
        },
      },
      simAws,
    );

    // When a request carrying the identity source is refused
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint),
      { headers: { "x-origin-secret": "wrong" } },
    );

    // Then the refusal is in the access log, which is the only record of it
    assertResponseStatus(response, 403, await describeResponse(response));
    expect(await accessLogLines(simAws)).toStrictEqual(["403 $default"]);
  });

  it("writes a line for a request with no identity source header", async () => {
    // Given the same authorizer, which never runs without its identity source
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (): string => "hello",
        requestAuthorizer: {
          functionName: "origin-check",
          identitySource: ["$request.header.x-origin-secret"],
          handler: (): unknown => ({ isAuthorized: true }),
          enableSimpleResponses: true,
          resultTtlSeconds: 0,
          invokePermission: true,
        },
        accessLogSettings: {
          DestinationArn: destinationArn(simAws),
          Format: "$context.status",
        },
      },
      simAws,
    );

    // When the header is absent
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint),
    );

    // Then the 401 is logged
    assertResponseStatus(response, 401, await describeResponse(response));
    expect(await accessLogLines(simAws)).toStrictEqual(["401"]);
  });

  it("keeps its lines out of the host console", async () => {
    // Given a stage logging every request, behind a handler that prints
    // nothing of its own
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (): string => "hello",
        accessLogSettings: {
          DestinationArn: destinationArn(simAws),
          Format: "$context.requestId $context.status",
        },
      },
      simAws,
    );
    const written = captureHostStdout();

    // When requests are served
    const http = new SimAwsHttp({ simAws });
    await http.fetch(localUrl(api.apiEndpoint));
    await http.fetch(localUrl(api.apiEndpoint));

    // Then the lines are in the log group and none of them reached the console
    expect(await accessLogLines(simAws)).toHaveLength(2);
    expect(written.join("")).toBe("");
  });

  it("keeps punctuation written around a context reference", async () => {
    // Given a format whose variables carry the punctuation of a sentence
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (): string => "hello",
        accessLogSettings: {
          DestinationArn: destinationArn(simAws),
          Format: "answered $context.status. path=$context.path, done",
        },
      },
      simAws,
    );

    // When a request is served
    await new SimAwsHttp({ simAws }).fetch(
      localUrl(api.apiEndpoint, "/orders"),
    );

    // Then the full stop and the comma are still there
    expect(await accessLogLines(simAws)).toStrictEqual([
      "answered 200. path=/orders, done",
    ]);
  });

  it("reports how long the integration took", async () => {
    // Given a stage logging the integration's latency, and a handler that
    // takes a second of simulated time
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      {
        handler: (): string => "hello",
        accessLogSettings: {
          DestinationArn: destinationArn(simAws),
          Format: "$context.integrationStatus $context.integrationLatency",
        },
      },
      simAws,
    );
    simAws.clock().freeze();

    // When a request is served
    await new SimAwsHttp({ simAws }).fetch(localUrl(api.apiEndpoint));

    // Then the latency is measured rather than left as a dash. The clock is
    // held still, so it is zero.
    expect(await accessLogLines(simAws)).toStrictEqual(["200 0"]);
  });

  it("writes nothing for a stage that was given no access log settings", async () => {
    // Given a stage with no access log
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: (): string => "hello" },
      simAws,
    );

    // When a request is served
    await new SimAwsHttp({ simAws }).fetch(localUrl(api.apiEndpoint));

    // Then no access log group was made. The function's own group is there,
    // since the handler ran.
    expect(
      simAws
        .logs()
        .allLogGroups()
        .map((group) => group.logGroupName),
    ).toStrictEqual(["/aws/lambda/orders"]);
  });
});
