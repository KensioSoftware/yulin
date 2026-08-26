import { type SimClock, SimRealClock } from "../../util/clock/sim-clock.js";
import {
  simAwsProxiedSourceIp,
  simAwsProxiedTraceId,
} from "../http/sim-aws-proxied-connection.js";
import { SimProxyBodyEncoding } from "../proxy/sim-proxy-body-encoding.js";
import {
  type SimPayload2Endpoint,
  simPayload2ReportedPath,
} from "./sim-payload-2-endpoint.js";
import type { SimPayload2Event } from "./sim-payload-2-event.type.js";
import {
  type SimPayload2Authorization,
  SimPayload2RequestContextBuilder,
} from "./sim-payload-2-request-context.js";
import { SimPayload2RequestParts } from "./sim-payload-2-request-parts.js";

interface SimPayload2EventBuilderProperties {
  /**
   * Clock stamping the event's requestContext time, so a handler sees the same
   * "now" as the rest of the simulation.
   */
  readonly clock?: SimClock;
}

/**
 * Builds the payload format 2.0 event an invocation passes to the function
 * handler.
 *
 * Request headers are passed through as received, apart from the ones AWS
 * rewrites itself, while the requestContext describes the AWS-shaped endpoint
 * the request reached and the caller, if any, that it authenticated.
 *
 * Fields that would otherwise be empty are left out rather than set to null,
 * which is what real AWS does: a handler reading `event.cookies` on a request
 * that carried none finds nothing there. `rawQueryString` is the exception and
 * is always present, as an empty string when there was no query.
 */
export class SimPayload2EventBuilder {
  private readonly bodyEncoding = new SimProxyBodyEncoding();
  private readonly requestParts = new SimPayload2RequestParts();
  private readonly requestContext = new SimPayload2RequestContextBuilder();
  private readonly clock: SimClock;

  constructor(properties: SimPayload2EventBuilderProperties = {}) {
    this.clock = properties.clock ?? new SimRealClock();
  }

  /**
   * Build the invocation event for one request to an endpoint.
   *
   * An authorization is supplied only when the endpoint authorized a caller,
   * which is what makes the authorizer block present for an authorized
   * invocation and absent for an open one.
   */
  async build(
    request: Request,
    endpoint: SimPayload2Endpoint,
    authorization?: SimPayload2Authorization,
  ): Promise<SimPayload2Event> {
    const url = new URL(request.url);
    const rawPath = simPayload2ReportedPath(endpoint, url);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const contentType = request.headers.get("content-type");
    const at = this.clock.now();

    const event: SimPayload2Event = {
      version: "2.0",
      routeKey: endpoint.routeKey,
      rawPath,
      rawQueryString: url.search.replace(/^\?/, ""),
      headers: this.requestParts.headers({
        request,
        domainName: endpoint.domainName,
        traceId: simAwsProxiedTraceId(at),
        sourceIp: simAwsProxiedSourceIp,
      }),
      requestContext: this.requestContext.build({
        request,
        rawPath,
        endpoint,
        at,
        ...(authorization !== undefined && { authorization }),
      }),
      isBase64Encoded:
        bytes.length > 0 && !this.bodyEncoding.isText(contentType),
    };

    this.requestParts.addTo(event, request, url);
    this.addRouteFields(event, endpoint);
    this.addBody(event, bytes, contentType);

    return event;
  }

  /**
   * Add the fields the matched route and its stage contribute, when there are
   * any.
   */
  private addRouteFields(
    event: SimPayload2Event,
    endpoint: SimPayload2Endpoint,
  ): void {
    const { pathParameters, stageVariables } = endpoint;

    if (
      pathParameters !== undefined &&
      Object.keys(pathParameters).length > 0
    ) {
      event.pathParameters = pathParameters;
    }

    if (
      stageVariables !== undefined &&
      Object.keys(stageVariables).length > 0
    ) {
      event.stageVariables = stageVariables;
    }
  }

  private addBody(
    event: SimPayload2Event,
    bytes: Uint8Array,
    contentType: string | null,
  ): void {
    if (bytes.length > 0) {
      event.body = this.bodyEncoding.encode(bytes, contentType);
    }
  }
}
