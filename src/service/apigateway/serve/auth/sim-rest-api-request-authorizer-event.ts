import type { SimPayload1Endpoint } from "../../../../serve/payload-1/sim-payload-1-endpoint.js";
import { SimPayload1EventBuilder } from "../../../../serve/payload-1/sim-payload-1-event-builder.js";
import type { SimPayload1RequestContext } from "../../../../serve/payload-1/sim-payload-1-event.type.js";
import type { SimClock } from "../../../../util/clock/sim-clock.js";

/**
 * The event a `REQUEST` authorizer's function is invoked with.
 *
 * It is the payload format 1.0 request event with `type` and `methodArn` added
 * and the body left out. AWS's own example of this event carries no `body` and
 * no `isBase64Encoded`, which is the one published account of what an
 * authorizer receives, so neither is sent here.
 *
 * The maps are empty rather than `null` for the same reason. An integration
 * event sends `null` where nothing was supplied, and the published authorizer
 * event sends `{}`, so a `REQUEST` authorizer reading
 * `event.queryStringParameters.token` finds nothing rather than throwing.
 */
export interface SimRestApiRequestAuthorizerEvent {
  type: "REQUEST";
  /**
   * The `execute-api` ARN of the request being authorized. The policy the
   * function answers with is evaluated against this same ARN.
   */
  methodArn: string;
  /** The resource path template the request matched, without the stage. */
  resource: string;
  /** The request path, stage segment and all. */
  path: string;
  httpMethod: string;
  headers: Record<string, string>;
  multiValueHeaders: Record<string, string[]>;
  queryStringParameters: Record<string, string>;
  multiValueQueryStringParameters: Record<string, string[]>;
  pathParameters: Record<string, string>;
  stageVariables: Record<string, string>;
  requestContext: SimPayload1RequestContext;
}

interface SimRestApiRequestAuthorizerEventInput {
  readonly request: Request;
  readonly endpoint: SimPayload1Endpoint;
  readonly methodArn: string;
}

interface SimRestApiRequestAuthorizerEventBuilderProperties {
  /** Clock stamping the event's requestContext time. */
  readonly clock: SimClock;
}

/**
 * Builds the event a `REQUEST` authorizer is invoked with.
 *
 * The members are copied across one at a time rather than spread, so what an
 * authorizer receives is stated here rather than following from whatever the
 * integration event happens to hold.
 */
export class SimRestApiRequestAuthorizerEventBuilder {
  private readonly eventBuilder: SimPayload1EventBuilder;

  constructor(properties: SimRestApiRequestAuthorizerEventBuilderProperties) {
    this.eventBuilder = new SimPayload1EventBuilder({
      clock: properties.clock,
    });
  }

  /**
   * Build the authorizer event for one request.
   */
  async build(
    input: SimRestApiRequestAuthorizerEventInput,
  ): Promise<SimRestApiRequestAuthorizerEvent> {
    // The request is cloned because reading it consumes its body, and the
    // integration behind the method still has to build an event of its own
    // from the same request.
    const requestEvent = await this.eventBuilder.build(
      input.request.clone(),
      input.endpoint,
    );

    return {
      type: "REQUEST",
      methodArn: input.methodArn,
      resource: requestEvent.resource,
      path: requestEvent.path,
      httpMethod: requestEvent.httpMethod,
      headers: requestEvent.headers ?? {},
      multiValueHeaders: requestEvent.multiValueHeaders ?? {},
      queryStringParameters: requestEvent.queryStringParameters ?? {},
      multiValueQueryStringParameters:
        requestEvent.multiValueQueryStringParameters ?? {},
      pathParameters: requestEvent.pathParameters ?? {},
      stageVariables: requestEvent.stageVariables ?? {},
      requestContext: requestEvent.requestContext,
    };
  }
}
