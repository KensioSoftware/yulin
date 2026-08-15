import {
  simAwsProxiedSourceIp,
  simAwsProxiedTraceId,
} from "../../../serve/http/sim-aws-proxied-connection.js";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import { SimElbV2BodyEncoding } from "./sim-elbv2-body-encoding.js";
import type { SimElbV2Event } from "./sim-elbv2-event.type.js";
import { SimElbV2RequestParts } from "./sim-elbv2-request-parts.js";

interface SimElbV2EventBuilderProperties {
  /**
   * Clock stamping the trace id, so a handler sees the same "now" as the rest
   * of the simulation.
   */
  readonly clock: SimClock;
}

interface SimElbV2EventInput {
  readonly request: Request;
  /** The request body, already read, because its size is checked first. */
  readonly bytes: Uint8Array;
  /** The target group the listener forwarded to. */
  readonly targetGroupArn: string;
  /** The DNS name of the load balancer the request reached. */
  readonly dnsName: string;
  /** The port the listener taking the request answers on. */
  readonly port: number;
  /** The protocol that listener speaks. */
  readonly protocol: string;
}

/**
 * Builds the event an Application Load Balancer passes to a Lambda target.
 *
 * Every field is always present, which is what tells this apart from the API
 * Gateway payload formats: a request with no query string carries an empty
 * `queryStringParameters` map rather than none, and one with no body carries an
 * empty `body` rather than leaving the field out.
 */
export class SimElbV2EventBuilder {
  private readonly bodyEncoding = new SimElbV2BodyEncoding();
  private readonly requestParts = new SimElbV2RequestParts();
  private readonly clock: SimClock;

  constructor(properties: SimElbV2EventBuilderProperties) {
    this.clock = properties.clock;
  }

  /**
   * Build the invocation event for one request forwarded to a target group.
   */
  build(input: SimElbV2EventInput): SimElbV2Event {
    const { request, bytes } = input;
    const url = new URL(request.url);
    const contentType = request.headers.get("content-type");
    const contentEncoding = request.headers.get("content-encoding");

    return {
      requestContext: { elb: { targetGroupArn: input.targetGroupArn } },
      httpMethod: request.method,
      path: url.pathname,
      queryStringParameters: this.requestParts.queryStringParameters(url),
      headers: this.requestParts.headers({
        request,
        dnsName: input.dnsName,
        port: input.port,
        protocol: input.protocol,
        traceId: simAwsProxiedTraceId(this.clock.now()),
        sourceIp: simAwsProxiedSourceIp,
      }),
      body: this.bodyEncoding.encode(bytes, contentType, contentEncoding),
      // An empty body is text rather than empty base64, which is what real ELB
      // reports for a GET carrying nothing.
      isBase64Encoded:
        bytes.length > 0 &&
        !this.bodyEncoding.isText(contentType, contentEncoding),
    };
  }
}
