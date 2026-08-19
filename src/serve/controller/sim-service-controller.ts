import type { AwsRegionName } from "../../service/aws/sim-aws-region.js";
import type { SimAws } from "../../service/aws/sim-aws.js";
import { SimAwsRequestCaller } from "../../service/iam/request/sim-aws-request-caller.js";
import type { SimAwsRequestSource } from "../../service/iam/request/sim-aws-request-source.js";

/**
 * Which of a service's endpoints a hostname named.
 *
 * Only S3 has more than one, and the difference is not cosmetic: the website
 * endpoint serves a static site to whoever the Bucket policy has made it
 * readable by, while the REST endpoint is the API the SDK and presigned URLs
 * talk to. Both authorize, and a website visitor presenting nothing is simply
 * anonymous. The hostname is the only thing that says which endpoint was
 * addressed, so it is settled where hostnames are understood rather than
 * guessed at again downstream.
 */
export type SimAwsServiceEndpoint = "rest" | "website";

export interface SimAwsServiceTarget {
  readonly service:
    | "s3"
    | "cloudFront"
    | "lambda"
    | "route53"
    | "cognitoIdentityProvider"
    | "executeApi"
    | "elbV2";
  readonly resourceName: string;
  // regionName is used for validation, not look-up
  readonly regionName?: AwsRegionName;
  readonly endpoint?: SimAwsServiceEndpoint;
}

interface SimAwsServiceRequestProperties {
  readonly target: SimAwsServiceTarget;
  readonly request: Request;
  readonly caller?: SimAwsRequestCaller | undefined;
  readonly source?: SimAwsRequestSource | undefined;
  readonly body?: Uint8Array | undefined;
}

/**
 * One HTTP request, routed to a simulated service and attributed to a
 * principal.
 *
 * Controllers are handed this rather than a bare request because everything
 * they need has already been settled once at the boundary: which resource the
 * hostname names, who is asking, and the request body, buffered so that both
 * signature verification and the controller can read the same bytes.
 *
 * The request carries no simulator control headers, so a Lambda handler
 * echoing `event.headers` sees the request as its client sent it.
 */
export class SimAwsServiceRequest {
  public readonly target: SimAwsServiceTarget;
  public readonly request: Request;
  public readonly caller: SimAwsRequestCaller;
  /**
   * The resource the caller is making this request on behalf of, when it said
   * it was making one for anything. This is what a service principal's grant is
   * conditioned on, and most requests state none.
   */
  public readonly source: SimAwsRequestSource | undefined;
  public readonly body?: Uint8Array | undefined;

  constructor(properties: SimAwsServiceRequestProperties) {
    this.target = properties.target;
    this.request = properties.request;
    // An unattributed request is anonymous, never the Account root.
    this.caller = properties.caller ?? SimAwsRequestCaller.anonymous();
    this.source = properties.source;
    this.body = properties.body;
  }
}

/**
 * Factory function for making instances of simulated AWS service controllers.
 */
export type SimAwsServiceControllerFactory = (
  simAws: SimAws,
) => SimAwsServiceController;

/**
 * Controller for a simulated AWS service exposed through HTTP.
 */
export interface SimAwsServiceController {
  /**
   * Handle an HTTP request routed to this simulated AWS service.
   */
  handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response>;
}
