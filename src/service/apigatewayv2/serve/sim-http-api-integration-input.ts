import type { SimHttpApiAdmitted } from "../api/authorizer/sim-http-api-authorization.js";
import type { SimHttpApiMatch } from "../api/sim-http-api-match.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

/**
 * One request an integration is invoked for, as the endpoint resolved it.
 */
export interface SimHttpApiIntegrationInvocationInput {
  readonly api: SimHttpApi;
  readonly match: SimHttpApiMatch;
  readonly request: Request;
  /** What the route's authorization knows about the caller. */
  readonly authorization: SimHttpApiAdmitted;
  /** The AWS-shaped hostname the request arrived on. */
  readonly domainName: string;
  /** The path the invocation event reports, which the resolver settled. */
  readonly rawPath: string;
  /**
   * The id the endpoint stamped this request with, which the invocation event
   * reports as its own.
   */
  readonly requestId?: string | undefined;
}
