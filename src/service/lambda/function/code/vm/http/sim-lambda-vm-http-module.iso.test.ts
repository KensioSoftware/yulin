import type { IncomingMessage } from "node:http";
import type { Readable, Writable } from "node:stream";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type {
  SimSdkWireRequest,
  SimSdkWireResponse,
} from "../../../../../../sdk/wire/sim-sdk-wire.types.js";
import { makeSimLambdaVmHttpModule } from "./sim-lambda-vm-http-module.js";

/**
 * A host module stub, so what the wrapper passes through is observable without
 * anything reaching the network.
 */
function hostModuleStub(calls: unknown[][]): Record<string, unknown> {
  const record =
    (name: string) =>
    (...callArguments: unknown[]): string => {
      calls.push([name, ...callArguments]);
      return name;
    };

  return {
    request: record("request"),
    get: record("get"),
    STATUS_CODES: { 200: "OK" },
  };
}

function respondWith(
  requests: SimSdkWireRequest[],
  body = '{"answered":true}',
): (request: SimSdkWireRequest) => Promise<SimSdkWireResponse> {
  return (request): Promise<SimSdkWireResponse> => {
    requests.push(request);

    return Promise.resolve({
      statusCode: 200,
      headers: Object.fromEntries([["content-type", "application/json"]]),
      body: Buffer.from(body),
    });
  };
}

async function readResponse(message: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of message as unknown as Readable) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }

  return Buffer.concat(chunks).toString();
}

describe("sim Lambda vm HTTP module", () => {
  it("keeps everything the host module exports", () => {
    // Given a wrapped host module.
    const module = makeSimLambdaVmHttpModule(
      hostModuleStub([]),
      respondWith([]),
    );

    // Then what a client library reaches for besides the request functions is
    // the host module's own.
    assertIdentical(
      (module["STATUS_CODES"] as Record<string, string>)["200"],
      "OK",
    );
  });

  it("answers a request to an AWS endpoint from the simulation", async () => {
    // Given a wrapped module over a simulation that answers.
    const dispatched: SimSdkWireRequest[] = [];
    const calls: unknown[][] = [];
    const module = makeSimLambdaVmHttpModule(
      hostModuleStub(calls),
      respondWith(dispatched),
    );
    const request = module["request"] as (...a: unknown[]) => Writable;

    // When a request to an AWS endpoint is made and its body written.
    const response = await new Promise<IncomingMessage>((resolve) => {
      const outgoing = request(
        {
          host: "dynamodb.eu-west-2.amazonaws.com",
          method: "POST",
          path: "/",
          headers: Object.fromEntries([
            ["x-amz-target", "DynamoDB_20120810.GetItem"],
          ]),
        },
        resolve,
      );
      outgoing.end('{"TableName":"orders"}');
    });

    // Then the simulation received the request as it was written.
    assertArrayLength(dispatched, 1);
    const [dispatchedRequest] = dispatched;
    assertNonNullable(dispatchedRequest);
    assertIdentical(
      Buffer.from(dispatchedRequest.body).toString(),
      '{"TableName":"orders"}',
    );

    // And the answer reads back as an HTTP response.
    assertIdentical(response.statusCode, 200);
    assertIdentical(response.headers["content-type"], "application/json");
    assertIdentical(await readResponse(response), '{"answered":true}');

    // And nothing reached the host module.
    assertArrayLength(calls, 0);
  });

  it("fails the request when the simulation cannot route it", async () => {
    // Given a wrapped module over a simulation that refuses.
    const module = makeSimLambdaVmHttpModule(hostModuleStub([]), async () => {
      await Promise.resolve();
      throw new Error("Cannot route this");
    });
    const request = module["request"] as (...a: unknown[]) => Writable;

    // When a request to an AWS endpoint is made.
    const error = await new Promise<Error>((resolve) => {
      const outgoing = request({ host: "sqs.eu-west-2.amazonaws.com" });
      outgoing.on("error", resolve);
      outgoing.end();
    });

    // Then the refusal arrives as the error event a client listens for.
    assertStringIncludes(error.message, "Cannot route this");
  });

  it("accepts the socket controls a client sets on a request", () => {
    // Given a request the simulation will answer.
    const module = makeSimLambdaVmHttpModule(
      hostModuleStub([]),
      respondWith([]),
    );
    const outgoing = (module["request"] as (...a: unknown[]) => Writable)({
      host: "kms.eu-west-2.amazonaws.com",
    }) as Writable & {
      setTimeout: () => unknown;
      setNoDelay: () => unknown;
      setSocketKeepAlive: () => unknown;
    };

    // Then the socket settings an HTTP client library reaches for are there
    // and chainable, with no socket for them to act on.
    assertIdentical(outgoing.setTimeout(), outgoing);
    assertIdentical(outgoing.setNoDelay(), outgoing);
    assertIdentical(outgoing.setSocketKeepAlive(), outgoing);
    outgoing.destroy();
  });

  it("leaves requests to anywhere else to the host module", () => {
    // Given a wrapped module.
    const calls: unknown[][] = [];
    const module = makeSimLambdaVmHttpModule(
      hostModuleStub(calls),
      respondWith([]),
    );

    // When requests to a non-AWS host are made both ways.
    const requested = (module["request"] as (...a: unknown[]) => unknown)({
      host: "api.example.com",
    });
    const fetched = (module["get"] as (...a: unknown[]) => unknown)(
      "https://api.example.com/status",
    );

    // Then the host module made them, with the arguments it was given.
    assertIdentical(requested, "request");
    assertIdentical(fetched, "get");
    assertArrayLength(calls, 2);
    assertStringIncludes(JSON.stringify(calls[1]), "api.example.com/status");
  });

  it("ends the body of a simulated get, as the host module does", async () => {
    // Given a wrapped module over a simulation that answers.
    const dispatched: SimSdkWireRequest[] = [];
    const module = makeSimLambdaVmHttpModule(
      hostModuleStub([]),
      respondWith(dispatched),
    );

    // When a get to an AWS endpoint is made with nothing written to it.
    await new Promise<IncomingMessage>((resolve) => {
      (module["get"] as (...a: unknown[]) => unknown)(
        "https://logs.eu-west-2.amazonaws.com/",
        Object.fromEntries([
          [
            "headers",
            Object.fromEntries([
              ["x-amz-target", "Logs_20140328.PutLogEvents"],
            ]),
          ],
        ]),
        resolve,
      );
    });

    // Then it was answered without the caller ending it.
    assertArrayLength(dispatched, 1);
    const [dispatchedRequest] = dispatched;
    assertNonNullable(dispatchedRequest);
    assertIdentical(dispatchedRequest.method, "GET");
  });
});
