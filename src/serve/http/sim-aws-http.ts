import { SimAwsLocalServiceResolver } from "../resolve/sim-aws-local-service-resolver.js";
import { SimAwsServiceControllerContainer } from "../controller/sim-aws-service-controller-container.js";
import { SimAws } from "../../service/aws/sim-aws.js";

/**
 * HTTP interface for sending requests into a simulated AWS environment.
 */
export class SimAwsHttp {
  private readonly serviceResolver = new SimAwsLocalServiceResolver();
  private readonly controllers: SimAwsServiceControllerContainer;

  constructor(public readonly simAws: SimAws = new SimAws()) {
    this.controllers = new SimAwsServiceControllerContainer(simAws);
  }

  /**
   * Send a Fetch API request to simulated AWS.
   */
  async fetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    return this.handleRequest(new Request(input, init));
  }

  /**
   * Handle a simulated AWS HTTP request.
   */
  async handleRequest(request: Request): Promise<Response> {
    try {
      const hostname = this.hostnameFromRequest(request);
      if (hostname === undefined) {
        return new Response("Missing Host header\n", { status: 400 });
      }

      const target = this.serviceResolver.resolveHost(hostname);
      if (target === undefined) {
        return new Response(`Unknown simulated AWS host ${hostname} \n`, {
          status: 501,
          headers: {
            "content-type": "text/plain; charset=utf-8",
          },
        });
      }

      const controller = this.controllers.controllerForService(target.service);
      return await controller.handleRequest(target, request);
    } catch (error) {
      /* v8 ignore next */
      return new Response(
        error instanceof Error
          ? `${error.message}\n`
          : "Internal server error\n",
        { status: 500 },
      );
    }
  }

  private hostnameFromRequest(request: Request): string | undefined {
    const hostname = new URL(request.url).hostname.toLowerCase();

    if (hostname.length === 0) {
      return undefined;
    }

    return hostname;
  }
}
