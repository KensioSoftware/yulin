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
   *
   * Every response is stamped with simulated time, as real AWS stamps every API
   * response with server time. That is the one mechanism an outside client has
   * for discovering what this simulation thinks the time is, without needing to
   * know it is talking to a simulator at all.
   */
  async handleRequest(request: Request): Promise<Response> {
    const response = await this.routeRequest(request);

    response.headers.set("date", this.simAws.now().toUTCString());

    return response;
  }

  private async routeRequest(request: Request): Promise<Response> {
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
