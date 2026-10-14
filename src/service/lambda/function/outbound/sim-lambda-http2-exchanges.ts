import { AsyncResource } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type http2 from "node:http2";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  simLambdaHttp2ExchangeHeaderName,
  simLambdaHttp2ExchangeId,
} from "./sim-lambda-http2-messages.js";

type SessionRequestFunction = (
  headers?: http2.OutgoingHttpHeaders,
  options?: http2.ClientSessionRequestOptions,
) => http2.ClientHttp2Stream;

/**
 * A request sent on a simulated session, waiting for its answer.
 */
export interface SimLambdaHttp2Exchange {
  readonly stream: http2.ClientHttp2Stream;

  /**
   * The asynchronous context the request was sent from. A pooled session
   * outlives the invocation that opened it, and each request on it belongs to
   * whichever invocation sent it.
   */
  readonly scope: AsyncResource;
}

/**
 * The requests in flight on one simulated session, each joined to the
 * asynchronous context it was sent from.
 */
export class SimLambdaHttp2Exchanges {
  private readonly exchanges = new Map<string, SimLambdaHttp2Exchange>();

  /**
   * Tag each request the session sends with the context it was sent from.
   */
  track(session: http2.ClientHttp2Session): void {
    const hostRequest = session.request.bind(session);
    const request: SessionRequestFunction = (headers, options) => {
      const exchangeId = randomUUID();
      const stream = hostRequest(
        { ...headers, [simLambdaHttp2ExchangeHeaderName]: exchangeId },
        options,
      );
      this.exchanges.set(exchangeId, {
        stream,
        scope: new AsyncResource("SimLambdaHttp2Request"),
      });
      stream.once("close", () => this.exchanges.delete(exchangeId));

      return stream;
    };

    Object.assign(session, { request });
  }

  /**
   * The exchange a request arriving at the session's server belongs to.
   *
   * Every request on the session's client is tagged by `track`, and nothing
   * else can reach its server.
   */
  exchangeFor(request: http2.Http2ServerRequest): SimLambdaHttp2Exchange {
    const exchange = this.exchanges.get(simLambdaHttp2ExchangeId(request));
    assertDefined(exchange, "sim Lambda HTTP/2 exchange for a request");

    return exchange;
  }
}
