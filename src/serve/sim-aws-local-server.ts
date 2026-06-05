import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { SimAws } from "../service/aws/sim-aws.js";
import { SimAwsLocalServiceResolver } from "./sim-aws-local-service-resolver.js";
import { SimAwsServiceControllerContainer } from "./sim-aws-service-controller-container.js";

const defaultServePort = 0; // Find an available port.

/**
 * Local HTTP server for a simulated AWS environment.
 */
export class SimAwsLocalServer {
  private readonly serviceResolver: SimAwsLocalServiceResolver;
  private readonly controllers: SimAwsServiceControllerContainer;
  private readonly server: Server;

  constructor(simAws: SimAws) {
    this.serviceResolver = new SimAwsLocalServiceResolver();
    this.controllers = new SimAwsServiceControllerContainer(simAws);
    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });
  }

  /**
   * Start serving simulated AWS services on localhost.
   */
  listen(port: number = defaultServePort): Server {
    this.server.listen(port, "127.0.0.1");
    return this.server;
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      const hostname = this.hostnameFromHostHeader(request.headers.host);
      /* v8 ignore if -- Node HTTP server rejects this situation earlier */
      if (hostname === undefined) {
        this.sendText(response, 400, "Missing Host header\n");
        return;
      }

      const target = this.serviceResolver.resolveHost(hostname);
      if (target === undefined) {
        this.sendText(
          response,
          501,
          `Unknown simulated AWS host ${hostname} \n`,
        );
        return;
      }

      const controller = this.controllers.controllerForService(target.service);
      await controller.handleRequest(target, request, response);
    } catch (error) {
      /* v8 ignore next */
      this.sendText(
        response,
        500,
        error instanceof Error
          ? `${error.message}\n`
          : "Internal server error\n",
      );
    }
  }

  private hostnameFromHostHeader(
    hostHeader: string | undefined,
  ): string | undefined {
    /* v8 ignore if -- Node HTTP server rejects this situation earlier */
    if (hostHeader === undefined) {
      return undefined;
    }

    const hostname = hostHeader.split(":")[0]?.toLowerCase();

    /* v8 ignore if -- Node HTTP server rejects this situation earlier */
    if (hostname === undefined || hostname.length === 0) {
      return undefined;
    }

    return hostname;
  }

  private sendText(
    response: ServerResponse,
    statusCode: number,
    body: string,
  ): void {
    response.writeHead(statusCode, {
      "content-type": "text/plain; charset=utf-8",
      "content-length": Buffer.byteLength(body),
    });
    response.end(body);
  }
}

/**
 * Serve a simulated AWS environment on localhost.
 */
export function serveSimAws(
  simAws: SimAws,
  port: number = defaultServePort,
): Server {
  const server = new SimAwsLocalServer(simAws);
  return server.listen(port);
}
