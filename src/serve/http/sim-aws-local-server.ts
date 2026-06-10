import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { SimAws } from "../../service/aws/sim-aws.js";
import { simAwsLocalConf } from "./sim-aws-local.conf.js";
import { SimAwsHttp } from "./sim-aws-http.js";
import { assertDefined } from "../../util/defined/defined.js";
import { SimAwsLocalUrl } from "./sim-aws-local-url.js";

interface SimAwsLocalServerProps {
  readonly simAws?: SimAws;
}

/**
 * Local HTTP server for a simulated AWS environment.
 * Useful for local integration testing and local development.
 */
export class SimAwsLocalServer {
  private readonly simAwsHttp: SimAwsHttp;
  private readonly server: Server;

  constructor(props: SimAwsLocalServerProps = {}) {
    const { simAws = new SimAws() } = props;
    this.simAwsHttp = new SimAwsHttp({ simAws });
    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });
  }

  /**
   * Start serving simulated AWS services on localhost.
   */
  async listen(port: number = simAwsLocalConf.defaultPort): Promise<this> {
    this.server.listen(port, this.hostname);
    await this.waitForListening();
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

  private async waitForListening(): Promise<void> {
    /* v8 ignore if -- cannot happen in practice */
    if (this.server.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const listening = (): void => {
        cleanup();
        resolve();
      };

      /* v8 ignore next */
      const error = (cause: Error): void => {
        cleanup();
        reject(cause);
      };

      const cleanup = (): void => {
        this.server.off("listening", listening);
        this.server.off("error", error);
      };

      this.server.once("listening", listening);
      this.server.once("error", error);
    });
  }

  private async handleRequest(
    nodeRequest: IncomingMessage,
    nodeResponse: ServerResponse,
  ): Promise<void> {
    const request = this.nodeRequestToFetchRequest(nodeRequest);
    const response = await this.simAwsHttp.handleRequest(request);

    await this.sendFetchResponse(nodeResponse, response);
  }

  private nodeRequestToFetchRequest(nodeRequest: IncomingMessage): Request {
    const host = nodeRequest.headers.host;
    assertDefined(host, "local sim server nodeRequest.headers.host");
    const url = new URL(nodeRequest.url ?? "/", `http://${host}`);

    return new Request(url, {
      method: nodeRequest.method,
      headers: this.nodeRequestHeaders(nodeRequest),
      body:
        nodeRequest.method === "GET" || nodeRequest.method === "HEAD"
          ? undefined
          : nodeRequest,
      duplex:
        nodeRequest.method === "GET" || nodeRequest.method === "HEAD"
          ? undefined
          : "half",
    } as RequestInit);
  }

  private nodeRequestHeaders(nodeRequest: IncomingMessage): Headers {
    const headers = new Headers();

    for (const [name, value] of Object.entries(nodeRequest.headers)) {
      /* v8 ignore if -- does not happen in practice */
      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(name, item);
        }
        continue;
      }

      headers.set(name, value);
    }

    return headers;
  }

  private async sendFetchResponse(
    nodeResponse: ServerResponse,
    response: Response,
  ): Promise<void> {
    nodeResponse.writeHead(
      response.status,
      Object.fromEntries(response.headers.entries()),
    );

    if (response.body === null) {
      nodeResponse.end();
      return;
    }

    const body = Buffer.from(await response.arrayBuffer());
    nodeResponse.end(body);
  }
}

/**
 * Serve a simulated AWS environment on localhost.
 */
export async function serveSimAws(
  simAws: SimAws = new SimAws(),
  port: number = simAwsLocalConf.defaultPort,
): Promise<SimAwsLocalServer> {
  const server = new SimAwsLocalServer({ simAws });
  return server.listen(port);
}
