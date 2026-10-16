import http2 from "node:http2";
import { duplexPair, type Duplex } from "node:stream";
import {
  simLambdaHttp2ConnectArguments,
  simLambdaHttp2Request,
  simLambdaHttp2ResponseHeaders,
} from "./sim-lambda-http2-messages.js";
import { SimLambdaHttp2Exchanges } from "./sim-lambda-http2-exchanges.js";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

/**
 * The host module's `connect`.
 */
export type SimLambdaHttp2Connect = (
  ...callArguments: unknown[]
) => http2.ClientHttp2Session;

/**
 * One HTTP/2 session the simulation answers.
 */
export class SimLambdaHttp2Session {
  private readonly exchanges = new SimLambdaHttp2Exchanges();

  constructor(
    private readonly authority: URL,
    private readonly outbound: SimLambdaOutboundHttp,
  ) {}

  /**
   * Connect the host module's client to an in-process server.
   *
   * The host client does all the HTTP/2 work, so streams, flow control,
   * timeouts and resets behave as they do over a network socket. Only the
   * socket it runs over is supplied.
   */
  connect(
    hostConnect: SimLambdaHttp2Connect,
    callArguments: readonly unknown[],
  ): http2.ClientHttp2Session {
    const { options, listener } = simLambdaHttp2ConnectArguments(callArguments);

    const server = http2.createServer((request, response) => {
      this.answer(request, response);
    });
    const [clientSocket, serverSocket] = duplexPair();
    server.emit("connection", serverSocket);

    const session = hostConnect(
      this.authority,
      { ...options, createConnection: (): Duplex => clientSocket },
      ...listener,
    );
    this.exchanges.track(session);

    return session;
  }

  private answer(
    request: http2.Http2ServerRequest,
    response: http2.Http2ServerResponse,
  ): void {
    const exchange = this.exchanges.exchangeFor(request);

    exchange.scope.runInAsyncScope(() => {
      void this.respond(request, response, exchange.stream);
    });
  }

  /**
   * Answer one request from the simulation.
   *
   * A request the simulation cannot answer fails the client's stream with the
   * error that explains it, which is what the SDK rejects the call with.
   *
   * The answer carries the `date` the simulation gave it, or none. The server
   * would otherwise date it from the host clock.
   */
  private async respond(
    request: http2.Http2ServerRequest,
    response: http2.Http2ServerResponse,
    clientStream: http2.ClientHttp2Stream,
  ): Promise<void> {
    try {
      const answered = await this.outbound.fetch(
        await simLambdaHttp2Request(this.authority, this.outbound, request),
      );
      const body = Buffer.from(await answered.arrayBuffer());

      response.sendDate = false;
      response.writeHead(
        answered.status,
        simLambdaHttp2ResponseHeaders(answered.headers),
      );
      response.end(body);
    } catch (error) {
      clientStream.destroy(error as Error);
    }
  }
}
