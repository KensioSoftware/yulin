import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfCustomOriginDispatcher } from "./sim-cf-custom-origin-dispatcher.js";

/**
 * Dispatches sim CloudFront custom Origin requests into a simulated AWS
 * environment, over the same in-process HTTP entry point everything else
 * addressed to a simulated hostname goes through.
 *
 * Reusing that entry point is what keeps CloudFront free of per-service
 * knowledge: an Origin domain is resolved by simulated Route53, so an HTTP
 * API, a Lambda Function URL, and a hosted-zone record pointing at either all
 * work without CloudFront knowing which is which.
 */
class SimCfSimAwsOriginDispatcher implements SimCfCustomOriginDispatcher {
  private readonly simAws: SimAws;
  private http: SimAwsHttp | undefined;

  constructor(simAws: SimAws) {
    this.simAws = simAws;
  }

  /**
   * Whether simulated Route53 resolves the Origin hostname to a service.
   */
  resolves(originHostname: string): boolean {
    return this.simAws.route53().resolveHttpHost(originHostname) !== undefined;
  }

  /**
   * Serve the Origin request from the simulated environment.
   */
  async fetch(request: Request): Promise<Response> {
    this.http ??= new SimAwsHttp({ simAws: this.simAws });

    return await this.http.handleRequest(request);
  }
}

/**
 * Create a custom Origin dispatcher backed by a simulated AWS environment.
 */
export function makeSimCfCustomOriginDispatcher(
  simAws: SimAws,
): SimCfCustomOriginDispatcher {
  return new SimCfSimAwsOriginDispatcher(simAws);
}
