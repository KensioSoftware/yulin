import type {
  SimPayload2JwtAuthorizer,
  SimPayload2LambdaAuthorizer,
} from "../../../../../serve/payload-2/sim-payload-2-event.type.js";

/**
 * Everything one served request contributes to its access log line.
 *
 * A request refused before an integration ran fills in what it knows and
 * leaves the rest out. That is the case the access log exists for: a Lambda
 * authorizer denial, an absent identity source and a throttled request each
 * produce a line describing a request no handler ever saw.
 */
export interface SimHttpApiAccessLogRequest {
  readonly requestId: string;
  /** The simulated instant the request arrived. */
  readonly at: Date;
  readonly accountId: string;
  readonly apiId: string;
  readonly domainName: string;
  readonly domainPrefix: string;
  readonly stage: string;
  readonly routeKey: string;
  readonly method: string;
  readonly path: string;
  readonly protocol: string;
  readonly sourceIp: string;
  readonly userAgent: string;
  readonly status: number;
  readonly responseLength: number;
  /** Milliseconds of simulated time the whole request took. */
  readonly responseLatency: number;
  /**
   * The status the integrated function's own code returned, which is what
   * `$context.integration.status` reports. Absent where no integration ran.
   */
  readonly integrationStatus?: number | undefined;
  /**
   * The status Lambda answered the invocation with, which is what
   * `$context.integrationStatus` reports for a Lambda proxy integration. It is
   * 200 for an invocation that reached the handler, whatever the handler then
   * returned.
   */
  readonly lambdaInvokeStatus?: number | undefined;
  readonly integrationLatency?: number | undefined;
  readonly integrationErrorMessage?: string | undefined;
  /** The message an authorizer refusal leaves behind, where it left one. */
  readonly authorizerError?: string | undefined;
  /** The message the endpoint answered with, such as `Forbidden`. */
  readonly errorMessage?: string | undefined;
  /** The base path an API mapping matched, for a custom domain request. */
  readonly basePathMatched?: string | undefined;
  /** What a `JWT` route's authorizer accepted, where one did. */
  readonly jwt?: SimPayload2JwtAuthorizer | undefined;
  /** What a `CUSTOM` route's Lambda authorizer passed on, where one did. */
  readonly lambda?: SimPayload2LambdaAuthorizer | null | undefined;
}
