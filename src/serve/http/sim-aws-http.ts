import { SimAwsServiceControllerContainer } from "../controller/container/sim-aws-service-controller-container.js";
import { SimAws } from "../../service/aws/sim-aws.js";

interface SimAwsHttpProperties {
  readonly simAws?: SimAws;
}

/**
 * HTTP interface for sending requests into a simulated AWS environment.
 */
export class SimAwsHttp {
  private readonly simAws: SimAws;
  private readonly controllers: SimAwsServiceControllerContainer;

  constructor(properties: SimAwsHttpProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.simAws = simAws;
    this.controllers = new SimAwsServiceControllerContainer({ simAws });
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

      const target = this.simAws.route53().resolveHttpHost(hostname);
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
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();

    if (hostname.length === 0) {
      return undefined;
    }

    return hostname;
  }
}
