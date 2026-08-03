import type { SimPayload2Endpoint } from "../../../../serve/payload-2/sim-payload-2-endpoint.js";
import { SimPayload2EventBuilder } from "../../../../serve/payload-2/sim-payload-2-event-builder.js";
import type { SimPayload2Event } from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import type { SimClock } from "../../../../util/clock/sim-clock.js";

/**
 * The event a payload format 2.0 Lambda `REQUEST` authorizer is invoked with.
 *
 * It is the payload format 2.0 request event with three members added and the
 * body left out. AWS's own example of this event carries no `body` and no
 * `isBase64Encoded`, which is the one published account of what an authorizer
 * receives, so neither is sent here: an authorizer written against a body it
 * would not get on AWS is exactly the divergence worth refusing to create.
 */
export interface SimHttpApiAuthorizerEvent extends Omit<
  SimPayload2Event,
  "body" | "isBase64Encoded"
> {
  type: "REQUEST";
  /**
   * The route the request matched, as an `execute-api` ARN. A policy response
   * is evaluated against this same ARN.
   */
  routeArn: string;
  /**
   * What the request carried at each of the authorizer's identity sources, in
   * the order they were configured. These are the values, not the expressions
   * that found them.
   */
  identitySource: string[];
}

interface SimHttpApiAuthorizerEventInput {
  readonly request: Request;
  readonly endpoint: SimPayload2Endpoint;
  readonly routeArn: string;
  readonly identitySource: readonly string[];
}

interface SimHttpApiAuthorizerEventBuilderProperties {
  /** Clock stamping the event's requestContext time. */
  readonly clock: SimClock;
}

/**
 * Builds the event a Lambda `REQUEST` authorizer is invoked with.
 *
 * The members are copied across one at a time rather than spread, so what an
 * authorizer receives is stated here rather than following from whatever the
 * integration event happens to hold.
 */
export class SimHttpApiAuthorizerEventBuilder {
  private readonly eventBuilder: SimPayload2EventBuilder;

  constructor(properties: SimHttpApiAuthorizerEventBuilderProperties) {
    this.eventBuilder = new SimPayload2EventBuilder({
      clock: properties.clock,
    });
  }

  /**
   * Build the authorizer event for one request.
   */
  async build(
    input: SimHttpApiAuthorizerEventInput,
  ): Promise<SimHttpApiAuthorizerEvent> {
    // The request is cloned because reading it consumes its body, and the
    // integration behind the route still has to build an event of its own from
    // the same request.
    const requestEvent = await this.eventBuilder.build(
      input.request.clone(),
      input.endpoint,
    );

    const event: SimHttpApiAuthorizerEvent = {
      version: requestEvent.version,
      type: "REQUEST",
      routeArn: input.routeArn,
      identitySource: [...input.identitySource],
      routeKey: requestEvent.routeKey,
      rawPath: requestEvent.rawPath,
      rawQueryString: requestEvent.rawQueryString,
      headers: requestEvent.headers,
      requestContext: requestEvent.requestContext,
    };

    this.addPresentFields(event, requestEvent);

    return event;
  }

  /**
   * Copy across the members the request only sometimes has, which the event
   * builder leaves out when it has nothing to put there.
   */
  private addPresentFields(
    event: SimHttpApiAuthorizerEvent,
    requestEvent: SimPayload2Event,
  ): void {
    const { cookies, queryStringParameters, pathParameters, stageVariables } =
      requestEvent;

    if (cookies !== undefined) {
      event.cookies = cookies;
    }

    if (queryStringParameters !== undefined) {
      event.queryStringParameters = queryStringParameters;
    }

    if (pathParameters !== undefined) {
      event.pathParameters = pathParameters;
    }

    if (stageVariables !== undefined) {
      event.stageVariables = stageVariables;
    }
  }
}
