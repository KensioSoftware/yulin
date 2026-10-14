import http2 from "node:http2";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimLambdaHttp2Module } from "./sim-lambda-http2-module.js";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

const servedHost = "orders.example.test";

const servingAlways = { now: true } as const;

type Connect = (...callArguments: unknown[]) => http2.ClientHttp2Session;

/**
 * A simulation serving one hostname while `serving` says so, recording what
 * it was asked for and answering with what `answer` gives.
 */
function servingSimulation(
  requests: Request[],
  answer: () => Promise<Response>,
  serving: { now: boolean } = servingAlways,
): SimLambdaOutboundHttp {
  return {
    serves: (hostname): boolean => serving.now && hostname === servedHost,
    fetch: async (request): Promise<Response> => {
      requests.push(request);

      return await answer();
    },
  };
}

function answering(): Promise<Response> {
  return Promise.resolve(
    new Response('{"answered":true}', {
      status: 201,
      headers: { "content-type": "application/json", connection: "close" },
    }),
  );
}

/**
 * The real HTTP/2 module wrapped over a simulation.
 */
function connectThrough(outbound: SimLambdaOutboundHttp): Connect {
  return makeSimLambdaHttp2Module({
    hostModule: http2,
    outbound,
  })["connect"] as Connect;
}

/**
 * What a client stream received: its response headers and body, or the error
 * it failed with.
 */
interface Received {
  readonly headers?: http2.IncomingHttpHeaders | undefined;
  readonly body?: string;
  readonly error?: Error;
}

async function sent(
  session: http2.ClientHttp2Session,
  headers: http2.OutgoingHttpHeaders,
  body?: string,
): Promise<Received> {
  const stream = session.request(headers);

  return await new Promise((resolve) => {
    let responseHeaders: http2.IncomingHttpHeaders | undefined;
    const chunks: Buffer[] = [];

    stream.on("response", (received) => {
      responseHeaders = received;
    });
    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.on("end", () => {
      resolve({
        headers: responseHeaders,
        body: Buffer.concat(chunks).toString(),
      });
    });
    stream.on("error", (error) => {
      resolve({ error });
    });
    stream.end(body);
  });
}

describe("sim Lambda HTTP/2 transport module", () => {
  it("keeps everything the host module exports", () => {
    const module = makeSimLambdaHttp2Module({
      hostModule: http2,
      outbound: servingSimulation([], answering),
    });

    assertIdentical(module["constants"], http2.constants);
  });

  it("answers a request on a session the simulation serves", async () => {
    // Given the HTTP/2 module wrapped over a simulation.
    const requests: Request[] = [];
    const session = connectThrough(servingSimulation(requests, answering))(
      `https://${servedHost}`,
    );

    // When a request is sent on a session to the hostname it serves.
    const received = await sent(
      session,
      {
        ":method": "POST",
        ":path": "/orders?draft=true",
        "content-type": "application/json",
      },
      '{"orderId":"order-1"}',
    );
    session.close();

    // Then the simulation was asked for it as it was sent, with nothing of
    // HTTP/2's own framing in its headers.
    assertArrayLength(requests, 1);
    const [request] = requests;
    assertNonNullable(request);
    assertIdentical(request.method, "POST");
    assertIdentical(request.url, `https://${servedHost}/orders?draft=true`);
    assertIdentical(request.headers.get("content-type"), "application/json");
    assertIdentical(request.headers.get("x-yulin-sim-lambda-exchange"), null);
    assertIdentical(await request.text(), '{"orderId":"order-1"}');

    // And its answer came back, less what HTTP/2 cannot carry.
    assertObjectMatches(received, {
      headers: { ":status": 201, "content-type": "application/json" },
      body: '{"answered":true}',
    });
    assertUndefined(received.headers["connection"]);
  });

  it("connects with a listener and no options, to a URL", async () => {
    // Given the HTTP/2 module wrapped over a simulation.
    const requests: Request[] = [];
    const connect = connectThrough(servingSimulation(requests, answering));

    // When a session is connected to a URL with only a listener.
    const connected = new Promise<void>((resolve, reject) => {
      const session = connect(new URL(`https://${servedHost}:8443`), () => {
        void sent(session, { ":path": "/orders" }).then(() => {
          session.close();
          resolve();
        }, reject);
      });
    });
    await connected;

    // Then the listener ran once the session connected, and a request with
    // no body was asked for at the port the URL named.
    assertIdentical(requests[0]?.method, "GET");
    assertIdentical(requests[0].url, `https://${servedHost}:8443/orders`);
  });

  it("fails the request with the error the simulation raised", async () => {
    // Given a simulation that cannot answer.
    const session = connectThrough(
      servingSimulation([], () =>
        Promise.reject(new Error("Cannot answer a request to orders")),
      ),
    )(`https://${servedHost}`);

    // When a request is sent.
    const received = await sent(session, { ":path": "/orders" });
    session.close();

    // Then the client stream fails with that error, which is what an SDK
    // rejects the call with.
    assertIdentical(
      received.error?.message,
      "Cannot answer a request to orders",
    );
  });

  it("explains a request sent once the simulation stops serving", async () => {
    // Given a session opened while the simulation served its hostname.
    const serving = { now: true };
    const session = connectThrough(servingSimulation([], answering, serving))(
      `https://${servedHost}`,
    );

    // When a request is sent on it after the invocation has ended.
    serving.now = false;
    const received = await sent(session, { ":path": "/orders" });
    session.close();

    // Then it fails, saying why.
    assertStringIncludes(received.error?.message ?? "", "once no invocation");
  });

  it("leaves sessions to anywhere else to the host module", () => {
    // Given the module wrapped over a host whose connect is recorded.
    const calls: unknown[][] = [];
    const module = makeSimLambdaHttp2Module({
      hostModule: {
        connect: (...callArguments: unknown[]): string => {
          calls.push(callArguments);
          return "connected";
        },
      },
      outbound: servingSimulation([], answering),
    });
    const connect = module["connect"] as (...a: unknown[]) => unknown;

    // When sessions are connected to a hostname the simulation serves nothing
    // at, and to something that is not a URL.
    const elsewhere = connect("https://api.example.com", {
      peerMaxConcurrentStreams: 1,
    });
    const unreadable = connect("not a url");

    // Then the host module connected both, as asked.
    assertIdentical(elsewhere, "connected");
    assertIdentical(unreadable, "connected");
    assertArrayLength(calls, 2);
    assertIdentical(calls[0][0], "https://api.example.com");
  });
});
