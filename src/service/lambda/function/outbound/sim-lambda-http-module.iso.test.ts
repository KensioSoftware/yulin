import type { IncomingMessage } from "node:http";
import type { Readable, Writable } from "node:stream";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimLambdaHttpModule } from "./sim-lambda-http-module.js";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

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

/**
 * A simulation serving one hostname, recording what it was asked for.
 */
function servingSimulation(
  requests: Request[],
  body = '{"answered":true}',
): SimLambdaOutboundHttp {
  return {
    serves: (hostname): boolean => hostname === "orders.example.test",
    fetch: (request): Promise<Response> => {
      requests.push(request);

      return Promise.resolve(
        new Response(body, {
          headers: { "content-type": "application/json" },
        }),
      );
    },
  };
}

async function readResponse(message: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of message as unknown as Readable) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }

  return Buffer.concat(chunks).toString();
}

describe("sim Lambda HTTP transport module", () => {
  it("keeps everything the host module exports", () => {
    // Given a wrapped host module.
    const module = makeSimLambdaHttpModule({
      hostModule: hostModuleStub([]),
      outbound: servingSimulation([]),
    });

    // Then what a client library reaches for besides the request functions is
    // the host module's own.
    assertIdentical(
      (module["STATUS_CODES"] as Record<string, string>)["200"],
      "OK",
    );
  });

  it("answers a request the simulation serves from the simulation", async () => {
    // Given a wrapped module over a simulation that answers.
    const answered: Request[] = [];
    const calls: unknown[][] = [];
    const module = makeSimLambdaHttpModule({
      hostModule: hostModuleStub(calls),
      outbound: servingSimulation(answered),
    });
    const request = module["request"] as (...a: unknown[]) => Writable;

    // When a request to that hostname is made and its body written.
    const response = await new Promise<IncomingMessage>((resolve) => {
      const outgoing = request(
        {
          host: "orders.example.test",
          method: "POST",
          path: "/oauth2/token",
          headers: Object.fromEntries([
            ["content-type", "application/x-www-form-urlencoded"],
          ]),
        },
        resolve,
      );
      outgoing.end("grant_type=authorization_code");
    });

    // Then the simulation received the request as it was written.
    assertArrayLength(answered, 1);
    const [answeredRequest] = answered;
    assertNonNullable(answeredRequest);
    assertIdentical(answeredRequest.method, "POST");
    assertIdentical(
      answeredRequest.url,
      "https://orders.example.test/oauth2/token",
    );
    assertIdentical(
      await answeredRequest.text(),
      "grant_type=authorization_code",
    );

    // And the answer reads back as an HTTP response.
    assertIdentical(response.statusCode, 200);
    assertIdentical(response.headers["content-type"], "application/json");
    assertIdentical(await readResponse(response), '{"answered":true}');

    // And nothing reached the host module.
    assertArrayEmpty(calls);
  });

  it("makes the request with the scheme the module carries", async () => {
    // Given the module standing in for `node:http`.
    const answered: Request[] = [];
    const module = makeSimLambdaHttpModule({
      hostModule: hostModuleStub([]),
      outbound: servingSimulation(answered),
      scheme: "http:",
    });

    // When a request naming no scheme of its own is made.
    await new Promise<IncomingMessage>((resolve) => {
      const outgoing = (module["request"] as (...a: unknown[]) => Writable)(
        { host: "orders.example.test", method: "POST", path: "/" },
        resolve,
      );
      outgoing.end("{}");
    });

    // Then the module's own scheme is the one the simulation is asked with.
    const [answeredRequest] = answered;
    assertNonNullable(answeredRequest);
    assertIdentical(answeredRequest.url, "http://orders.example.test/");
  });

  it("fails the request when the simulation cannot route it", async () => {
    // Given a wrapped module over a simulation that refuses.
    const module = makeSimLambdaHttpModule({
      hostModule: hostModuleStub([]),
      outbound: {
        serves: (): boolean => true,
        fetch: async (): Promise<Response> => {
          await Promise.resolve();
          throw new Error("Cannot route this");
        },
      },
    });
    const request = module["request"] as (...a: unknown[]) => Writable;

    // When a request the simulation serves is made.
    const error = await new Promise<Error>((resolve) => {
      const outgoing = request({ host: "orders.example.test" });
      outgoing.on("error", resolve);
      outgoing.end();
    });

    // Then the refusal arrives as the error event a client listens for.
    assertStringIncludes(error.message, "Cannot route this");
  });

  it("accepts the socket controls a client sets on a request", () => {
    // Given a request the simulation will answer.
    const module = makeSimLambdaHttpModule({
      hostModule: hostModuleStub([]),
      outbound: servingSimulation([]),
    });
    const outgoing = (module["request"] as (...a: unknown[]) => Writable)({
      host: "orders.example.test",
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
    const module = makeSimLambdaHttpModule({
      hostModule: hostModuleStub(calls),
      outbound: servingSimulation([]),
    });

    // When requests to a hostname the simulation serves nothing at are made
    // both ways.
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
    const answered: Request[] = [];
    const module = makeSimLambdaHttpModule({
      hostModule: hostModuleStub([]),
      outbound: servingSimulation(answered),
    });

    // When a get to that hostname is made with nothing written to it.
    await new Promise<IncomingMessage>((resolve) => {
      (module["get"] as (...a: unknown[]) => unknown)(
        "https://orders.example.test/.well-known/jwks.json",
        resolve,
      );
    });

    // Then it was answered without the caller ending it.
    assertArrayLength(answered, 1);
    const [answeredRequest] = answered;
    assertNonNullable(answeredRequest);
    assertIdentical(answeredRequest.method, "GET");
  });
});
