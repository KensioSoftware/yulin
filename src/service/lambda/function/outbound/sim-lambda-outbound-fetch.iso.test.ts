import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimLambdaOutboundFetch } from "./sim-lambda-outbound-fetch.js";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

/**
 * A simulation serving one hostname, recording what it answered.
 */
function servingSimulation(answered: Request[]): SimLambdaOutboundHttp {
  return {
    serves: (hostname): boolean => hostname === "auth.example.com",
    fetch: (request): Promise<Response> => {
      answered.push(request);

      return Promise.resolve(new Response('{"answered":true}'));
    },
  };
}

/**
 * A host fetch that records what it was called with rather than reaching the
 * network.
 */
function hostFetchStub(calls: unknown[][]): typeof fetch {
  return (input: string | URL | Request, init?: RequestInit) => {
    calls.push([input, init]);

    return Promise.resolve(new Response("from the network"));
  };
}

describe("sim Lambda outbound fetch", () => {
  it("answers a request to a hostname the simulation serves", async () => {
    // Given a fetch over a simulation serving one hostname.
    const answered: Request[] = [];
    const calls: unknown[][] = [];
    const routedFetch = makeSimLambdaOutboundFetch(
      servingSimulation(answered),
      hostFetchStub(calls),
    );

    // When function code fetches from that hostname.
    const response = await routedFetch(
      "https://auth.example.com/oauth2/token",
      {
        method: "POST",
        body: "grant_type=authorization_code",
      },
    );

    // Then the simulation answered it, as it was asked for.
    assertIdentical(await response.text(), '{"answered":true}');
    assertArrayLength(answered, 1);
    const [request] = answered;
    assertNonNullable(request);
    assertIdentical(request.method, "POST");
    assertIdentical(await request.text(), "grant_type=authorization_code");

    // And nothing reached the network.
    assertArrayLength(calls, 0);
  });

  it("reads the hostname from every way a request is addressed", async () => {
    // Given a fetch over the same simulation.
    const answered: Request[] = [];
    const routedFetch = makeSimLambdaOutboundFetch(
      servingSimulation(answered),
      hostFetchStub([]),
    );

    // When the same hostname is named as a URL and as a Request.
    await routedFetch(new URL("https://auth.example.com/oauth2/token"));
    await routedFetch(new Request("https://auth.example.com/oauth2/token"));

    // Then both are the simulation's to answer.
    assertArrayLength(answered, 2);
  });

  it("leaves a hostname the simulation serves nothing at to the host", async () => {
    // Given a fetch over the same simulation.
    const calls: unknown[][] = [];
    const routedFetch = makeSimLambdaOutboundFetch(
      servingSimulation([]),
      hostFetchStub(calls),
    );

    // When function code fetches from somewhere else.
    const response = await routedFetch("https://api.example.com/status", {
      method: "GET",
    });

    // Then the host fetch made the request, with the arguments it was given.
    assertIdentical(await response.text(), "from the network");
    assertArrayLength(calls, 1);
    const [call] = calls;
    assertNonNullable(call);
    assertIdentical(call[0], "https://api.example.com/status");
  });

  it("leaves arguments naming no hostname to the host", async () => {
    // Given a fetch over the same simulation.
    const calls: unknown[][] = [];
    const routedFetch = makeSimLambdaOutboundFetch(
      servingSimulation([]),
      hostFetchStub(calls),
    );

    // When function code fetches something that is no URL at all.
    await routedFetch("not a url");

    // Then the host fetch has it, and its own error message with it.
    assertArrayLength(calls, 1);
  });

  it("leaves every request to the host with no simulation to answer", async () => {
    // Given a fetch built with no simulation behind it, as a function outside
    // a simulated environment has.
    const calls: unknown[][] = [];
    const routedFetch = makeSimLambdaOutboundFetch(
      undefined,
      hostFetchStub(calls),
    );

    // When function code fetches a hostname a simulation would have served.
    await routedFetch("https://auth.example.com/oauth2/token");

    // Then it goes where it was addressed.
    assertArrayLength(calls, 1);
  });
});
