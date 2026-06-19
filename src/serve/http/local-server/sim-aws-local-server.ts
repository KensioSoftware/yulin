import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { SimAws } from "../../../service/aws/sim-aws.js";
import { simAwsLocalConf } from "./sim-aws-local.conf.js";
import { SimAwsHttp } from "../sim-aws-http.js";
import { SimAwsLocalUrl } from "../url/sim-aws-local-url.js";
import { NodeFetchHttpAdapter } from "../node-fetch-http-adapter.js";
import { waitNodeServerListen } from "./wait-node-server-listen.js";

interface SimAwsLocalServerProps {
  readonly simAws?: SimAws;
}

/**
 * Local HTTP server for a simulated AWS environment.
 * Useful for local integration testing and local development.
 */
export class SimAwsLocalServer {
  private readonly simAwsHttp: SimAwsHttp;
  private readonly nodeFetchHttpAdapter = new NodeFetchHttpAdapter();
  private readonly server: Server;

  constructor(props: SimAwsLocalServerProps = {}) {
    const { simAws = new SimAws() } = props;
    this.simAwsHttp = new SimAwsHttp({ simAws });
    this.server = http.createServer((request, response) => {
      this.handleRequest(request, response).catch((error: unknown) => {
        this.handleRequestError(error, response);
      });
    });
  }

  /**
   * Start serving simulated AWS services on localhost.
   */
  async listen(port: number = simAwsLocalConf.defaultPort): Promise<this> {
    this.server.listen(port, this.hostname);
    await waitNodeServerListen(this.server);
    return this;
  }

  /**
   * Get the hostname on which this local server is listening.
   */
  get hostname(): string {
    return simAwsLocalConf.hostname;
  }

  /**
   * Get the TCP port on which this local server is listening.
   */
  get port(): string {
    if (!this.server.listening) {
      throw new Error("Server is not yet listening, cannot get port number");
    }

    const address = this.server.address();
    /* v8 ignore if -- does not happen in practice */
    if (address === null || typeof address === "string") {
      throw new Error("Expected local HTTP server to listen on a TCP port");
    }

    return String(address.port);
  }

  /**
   * Stop serving simulated AWS services.
   */
  close(): void {
    this.server.close();
  }

  /**
   * Adapt a simulated AWS URL for this local server instance.
   */
  localUrl(input: string | URL): URL {
    return new SimAwsLocalUrl({ input, port: this.port }).toURL();
  }

  private async handleRequest(
    nodeRequest: IncomingMessage,
    nodeResponse: ServerResponse,
  ): Promise<void> {
    const request =
      this.nodeFetchHttpAdapter.nodeRequestToFetchRequest(nodeRequest);
    const response = await this.simAwsHttp.handleRequest(request);

    await this.nodeFetchHttpAdapter.sendFetchResponse(nodeResponse, response);
  }

  private handleRequestError(
    error: unknown,
    nodeResponse: ServerResponse,
  ): void {
    const message =
      error instanceof Error ? error.message : "HTTP request processing failed";

    /* v8 ignore if */
    if (nodeResponse.writableEnded) {
      return;
    }

    if (!nodeResponse.headersSent) {
      nodeResponse.statusCode = 400;
      nodeResponse.setHeader("content-type", "text/plain; charset=utf-8");
    }

    nodeResponse.end(message);
  }
}

interface ServeSimAwsProps {
  readonly simAws?: SimAws;
  readonly port?: number;
}

/**
 * Serve a simulated AWS environment on localhost.
 */
export async function serveSimAws(
  props: ServeSimAwsProps = {},
): Promise<SimAwsLocalServer> {
  const { simAws = new SimAws(), port = simAwsLocalConf.defaultPort } = props;
  const server = new SimAwsLocalServer({ simAws });
  return server.listen(port);
}
