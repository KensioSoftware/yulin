/**
 * What an ALB invocation event says about where the request came from.
 *
 * The `elb` block is the whole of it, and it carries the target group ARN
 * rather than the load balancer's. That is what a handler reads to tell an ALB
 * event apart from an API Gateway one, which has a `requestContext` of a
 * completely different shape.
 */
export interface SimElbV2EventRequestContext {
  readonly elb: {
    readonly targetGroupArn: string;
  };
}

/**
 * The event an Application Load Balancer passes to a Lambda target.
 *
 * This is ALB's own shape rather than either API Gateway payload format:
 * `httpMethod` and `path` rather than a `requestContext.http` block, headers
 * and query string parameters as flat single-value maps, and a body that is
 * always present even when it is empty.
 */
export interface SimElbV2Event {
  readonly requestContext: SimElbV2EventRequestContext;
  readonly httpMethod: string;
  readonly path: string;
  readonly queryStringParameters: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly isBase64Encoded: boolean;
}

/**
 * The response an Application Load Balancer accepts from a Lambda target.
 *
 * Only `statusCode` is load bearing. A result without a numeric one is not a
 * response ALB can send, and the load balancer answers 502 rather than passing
 * the handler's shape on to the client.
 */
export interface SimElbV2Result {
  readonly statusCode?: number;
  readonly statusDescription?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly isBase64Encoded?: boolean;
}
