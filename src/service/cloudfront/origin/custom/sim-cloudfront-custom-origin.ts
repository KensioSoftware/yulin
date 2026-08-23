import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import type { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import {
  customOriginEdgeOrigin,
  customOriginEdgeParts,
} from "./sim-cf-custom-origin-edge.js";
import type { SimCloudFrontOrigin } from "../sim-cloudfront-origin.js";
import type { SimCloudFrontOriginRequest } from "../sim-cloudfront-request-response.js";
import type { SimCfCustomOriginDispatcher } from "./sim-cf-custom-origin-dispatcher.js";
import { simCfCustomOriginRequest } from "./sim-cf-custom-origin-request.js";
import { SimCfCustomOriginSigner } from "./sim-cf-custom-origin-signer.js";

interface SimCloudFrontCustomOriginProperties {
  readonly originId: string;
  readonly domainName: string;
  readonly originPath?: string | undefined;
  readonly dispatcher: SimCfCustomOriginDispatcher;
  readonly originAccessControl?: SimCloudFrontOriginAccessControl | undefined;
  /**
   * The headers CloudFront adds to every request it sends to this Origin,
   * keyed by lower-case header name.
   */
  readonly customHeaders?: Readonly<Record<string, string>> | undefined;
}

/**
 * Simulated CloudFront custom Origin.
 *
 * A custom Origin is any Origin CloudFront reaches over HTTP rather than as an
 * S3 Bucket. In a simulated environment that means another simulated service
 * with an endpoint of its own: an HTTP API or a Lambda Function URL, or
 * anything a simulated Route53 record points at one of those.
 *
 * An Origin with no origin access control is reached anonymously, as CloudFront
 * reaches one it has nothing to sign for, so a Function URL or route that
 * authorizes with `AWS_IAM` refuses the request. One whose origin access
 * control signs is reached as the CloudFront service principal instead, which
 * is what a Function URL behind an origin access control admits.
 */
export class SimCloudFrontCustomOrigin implements SimCloudFrontOrigin {
  /**
   * The origin access control this Origin was created with, if any.
   */
  public readonly originAccessControl:
    | SimCloudFrontOriginAccessControl
    | undefined;

  /**
   * The parts of this Origin an origin event carries, which
   * `SimCfCustomOriginEdgeParts` names.
   */
  public readonly domainName: string;
  public readonly originPath: string;
  public readonly customHeaders: Readonly<Record<string, string>>;

  private readonly originId: string;
  private readonly dispatcher: SimCfCustomOriginDispatcher;
  private readonly signer: SimCfCustomOriginSigner;

  constructor(
    private readonly properties: SimCloudFrontCustomOriginProperties,
  ) {
    this.originId = properties.originId;
    this.domainName = properties.domainName;
    this.originPath = properties.originPath ?? "";
    this.dispatcher = properties.dispatcher;
    this.originAccessControl = properties.originAccessControl;
    this.signer = new SimCfCustomOriginSigner(properties.originAccessControl);
    this.customHeaders = properties.customHeaders ?? {};
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
      customHeaders: this.customHeaders,
      signingHeaders: this.signer.forRequest(request),
    });

    const { hostname } = new URL(originRequest.url);

    if (!this.dispatcher.resolves(hostname)) {
      throw new Error(
        `Sim CloudFront Origin ${this.originId} domain name ${this.domainName} does not resolve to a simulated AWS service`,
      );
    }

    return await this.dispatcher.fetch(originRequest);
  }

  /**
   * This Origin as an origin event presents it.
   */
  toEdgeOrigin(): LambdaAtEdge.Origin {
    return customOriginEdgeOrigin(this);
  }

  /**
   * This Origin as an origin-request handler left it.
   *
   * The domain name, the Origin path and the custom headers are the parts the
   * fetch reads, so a handler that rewrote any of them sends the request
   * somewhere else, under another path, or carrying another header. A domain
   * name naming nothing in this simulation fails the same way a misconfigured
   * Origin does.
   */
  withEdgeOrigin(edgeOrigin: LambdaAtEdge.Origin): SimCloudFrontOrigin {
    return new SimCloudFrontCustomOrigin({
      ...this.properties,
      ...customOriginEdgeParts(this.originId, edgeOrigin),
    });
  }
}
