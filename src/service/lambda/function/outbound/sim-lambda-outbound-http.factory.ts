import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import {
  isSimAwsApiRequest,
  SimLambdaAwsApiOutbound,
} from "./sim-lambda-aws-api-outbound.js";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";

/**
 * Ask for a request at a URL, which is the request itself where that is where
 * it was already addressed.
 *
 * The body is read here because a request being asked for somewhere else has
 * to be built again, and there is nothing streaming through this: what arrives
 * is a request a client has finished writing.
 */
async function requestAt(url: URL, request: Request): Promise<Request> {
  if (url.href === request.url) {
    return request;
  }

  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body: request.body === null ? null : await request.arrayBuffer(),
  });
}

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
 * An AWS service API endpoint is answered as a Command when it carries one,
 * and over HTTP when it does not. A user pool's JWKS is published at the
 * regional Cognito endpoint and fetched by a verifier holding no credentials,
 * so a hostname alone does not say which of the two a request is.
 *
 * A resolved hostname is answered before either, because it is the more
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
    const served = this.servedUrl(request);

    if (served === undefined) {
      return await this.awsApi.fetch(request);
    }

    this.http ??= new SimAwsHttp({ simAws: this.simAws });

    return await this.http.handleRequest(await requestAt(served, request));
  }

  /**
   * Where the simulation serves a request over HTTP, or nothing for one it
   * answers as a Command.
   *
   * A hostname simulated Route53 resolves is served as it was asked for. An
   * AWS service API endpoint is served at the local hostname it rewrites to,
   * since that is the name simulated Route53 knows the endpoint by, and only
   * for a request that is not an API call.
   *
   * Everything else is the wire dispatcher's, including an endpoint the
   * simulation serves nothing at, so that a request it cannot route is refused
   * with the explanation that dispatcher gives rather than with a 501 naming a
   * hostname nobody asked for.
   */
  private servedUrl(request: Request): URL | undefined {
    const url = new URL(request.url);

    if (this.resolves(url.hostname)) {
      return url;
    }

    if (isSimAwsApiRequest(request)) {
      return undefined;
    }

    const localUrl = new SimAwsLocalUrl({ input: url }).toURL();

    return this.resolves(localUrl.hostname) ? localUrl : undefined;
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
