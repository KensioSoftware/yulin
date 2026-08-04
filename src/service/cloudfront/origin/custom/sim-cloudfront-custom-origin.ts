import type { SimCloudFrontOrigin } from "../sim-cloudfront-origin.js";
import type { SimCloudFrontOriginRequest } from "../sim-cloudfront-request-response.js";
import type { SimCfCustomOriginDispatcher } from "./sim-cf-custom-origin-dispatcher.js";
import { simCfCustomOriginRequest } from "./sim-cf-custom-origin-request.js";

interface SimCloudFrontCustomOriginProperties {
  readonly originId: string;
  readonly domainName: string;
  readonly originPath?: string | undefined;
  readonly dispatcher: SimCfCustomOriginDispatcher;
}

/**
 * Simulated CloudFront custom Origin.
 *
 * A custom Origin is any Origin CloudFront reaches over HTTP rather than as an
 * S3 Bucket. In a simulated environment that means another simulated service
 * with an endpoint of its own: an HTTP API or a Lambda Function URL, or
 * anything a simulated Route53 record points at one of those.
 *
 * The Origin is reached anonymously, as CloudFront reaches an Origin it has no
 * Origin Access Control for, so a Function URL or route that authorizes with
 * `AWS_IAM` refuses the request.
 */
export class SimCloudFrontCustomOrigin implements SimCloudFrontOrigin {
  private readonly originId: string;
  private readonly domainName: string;
  private readonly originPath: string;
  private readonly dispatcher: SimCfCustomOriginDispatcher;

  constructor(properties: SimCloudFrontCustomOriginProperties) {
    this.originId = properties.originId;
    this.domainName = properties.domainName;
    this.originPath = properties.originPath ?? "";
    this.dispatcher = properties.dispatcher;
  }

  /**
   * Fetch the request from the simulated service behind this Origin.
   *
   * An Origin domain naming nothing in the simulation fails here rather than
   * being sent to the real domain, because a simulated Distribution reaching
   * out to the internet is never what a test meant.
   */
  async fetch(request: SimCloudFrontOriginRequest): Promise<Response> {
    const originRequest = simCfCustomOriginRequest({
      domainName: this.domainName,
      originPath: this.originPath,
      request: request.req,
    });

    const { hostname } = new URL(originRequest.url);

    if (!this.dispatcher.resolves(hostname)) {
      throw new Error(
        `Sim CloudFront Origin ${this.originId} domain name ${this.domainName} does not resolve to a simulated AWS service`,
      );
    }

    return await this.dispatcher.fetch(originRequest);
  }
}
