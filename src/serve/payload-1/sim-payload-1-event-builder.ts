import { type SimClock, SimRealClock } from "../../util/clock/sim-clock.js";
import {
  simAwsProxiedSourceIp,
  simAwsProxiedTraceId,
} from "../http/sim-aws-proxied-connection.js";
import type { SimPayload1Endpoint } from "./sim-payload-1-endpoint.js";
import type { SimPayload1Event } from "./sim-payload-1-event.type.js";
import { SimPayload1RequestContextBuilder } from "./sim-payload-1-request-context.js";
import { simPayload1Body } from "./sim-payload-1-body.js";
import {
  orNull,
  simPayload1Headers,
  simPayload1QueryStringParameters,
} from "./sim-payload-1-request-parts.js";

interface SimPayload1EventBuilderProperties {
  /**
   * Clock stamping the event's requestContext time, so a handler sees the same
   * "now" as the rest of the simulation.
   */
  readonly clock?: SimClock;
}

/**
 * Builds the payload format 1.0 event a REST API's proxy integration passes to
 * the function handler.
 *
 * This is the older of the two formats and the only one a REST API sends. It
 * carries both a single-value and a multi-value map for the headers and the
 * query string, and it sends `null` where payload format 2.0 leaves a field
 * out. A handler written for one reads the other wrongly, which is why the two
 * builders stay apart.
 */
export class SimPayload1EventBuilder {
  private readonly requestContext = new SimPayload1RequestContextBuilder();
  private readonly clock: SimClock;

  constructor(properties: SimPayload1EventBuilderProperties = {}) {
    this.clock = properties.clock ?? new SimRealClock();
  }

  /**
   * Build the invocation event for one request to an endpoint.
   */
  async build(
    request: Request,
    endpoint: SimPayload1Endpoint,
  ): Promise<SimPayload1Event> {
    const url = new URL(request.url);
    const at = this.clock.now();
    const body = simPayload1Body(
      new Uint8Array(await request.arrayBuffer()),
      request.headers.get("content-type"),
    );

    const headers = simPayload1Headers(request, {
      domainName: endpoint.domainName,
      traceId: simAwsProxiedTraceId(at),
      sourceIp: simAwsProxiedSourceIp,
    });
    const query = simPayload1QueryStringParameters(url.searchParams);

    return {
      resource: endpoint.resourcePath,
      path: url.pathname,
      httpMethod: request.method,
      headers: orNull(headers.single),
      multiValueHeaders: orNull(headers.multi),
      queryStringParameters: orNull(query.single),
      multiValueQueryStringParameters: orNull(query.multi),
      pathParameters: orNull({ ...endpoint.pathParameters }),
      stageVariables: orNull({ ...endpoint.stageVariables }),
      requestContext: this.requestContext.build({
        request,
        url,
        endpoint,
        sourceIp: simAwsProxiedSourceIp,
        at,
      }),
      ...body,
    };
  }
}
