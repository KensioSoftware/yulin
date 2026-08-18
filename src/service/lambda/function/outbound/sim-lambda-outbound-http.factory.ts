import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaAwsApiOutbound } from "./sim-lambda-aws-api-outbound.js";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

interface SimLambdaOutboundHttpProperties {
  readonly simAws: SimAws;
  readonly regionName?: AwsRegionName | undefined;
}

/**
 * Answers everything sim Lambda function code addresses to a hostname its
 * simulated environment serves.
 *
 * A hostname simulated Route53 resolves goes through the same in-process HTTP
 * entry point a request arriving on localhost does. The simulation then
 * answers a function's request to a Cognito user pool domain, an HTTP API or a
 * load balancer without knowing which of them it is, exactly as it answers a
 * browser.
 *
 * An AWS service API endpoint is answered as a Command, because that is what
 * one carries. That comes second because a resolved hostname is the more
 * specific answer. A load balancer's own `.elb.amazonaws.com` name and a
 * custom domain below an AWS one both end in a service API suffix, and both
 * name something the simulation is serving over HTTP.
 */
class SimAwsLambdaOutboundHttp implements SimLambdaOutboundHttp {
  private readonly simAws: SimAws;
  private readonly awsApi: SimLambdaAwsApiOutbound;
  private http: SimAwsHttp | undefined;

  constructor(properties: SimLambdaOutboundHttpProperties) {
    this.simAws = properties.simAws;
    this.awsApi = new SimLambdaAwsApiOutbound(properties);
  }

  /**
   * Whether this simulation serves a hostname, as a hostname simulated Route53
   * resolves or as an AWS service API endpoint.
   */
  serves(hostname: string): boolean {
    return this.resolves(hostname) || this.awsApi.serves(hostname);
  }

  /**
   * Answer a request from the simulation.
   */
  async fetch(request: Request): Promise<Response> {
    const { hostname } = new URL(request.url);

    if (!this.resolves(hostname)) {
      return await this.awsApi.fetch(request);
    }

    this.http ??= new SimAwsHttp({ simAws: this.simAws });

    return await this.http.handleRequest(request);
  }

  /**
   * Whether simulated Route53 resolves a hostname to a service of this
   * simulation.
   */
  private resolves(hostname: string): boolean {
    return this.simAws.route53().resolveHttpHost(hostname) !== undefined;
  }
}

/**
 * Build the outbound HTTP a simulated environment answers its functions with.
 */
export function makeSimLambdaOutboundHttp(
  properties: SimLambdaOutboundHttpProperties,
): SimLambdaOutboundHttp {
  return new SimAwsLambdaOutboundHttp(properties);
}
