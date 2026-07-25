import http, { type Server } from "node:http";
import { SimAws } from "../../../service/aws/sim-aws.js";
import { simAwsLocalConfig } from "./sim-aws-local.config.js";
import { SimAwsHttp } from "../sim-aws-http.js";
import { SimAwsLocalUrl } from "../url/sim-aws-local-url.js";
import { waitNodeServerListen } from "./wait-node-server-listen.js";
import { SimAwsLocalRequestHandler } from "./sim-aws-local-request-handler.js";
import { SimAwsDnsServer } from "../../dns/sim-aws-dns-server.js";

interface SimAwsLocalServerProperties {
  readonly simAws?: SimAws;
}

/**
 * Local HTTP server for a simulated AWS environment.
 * Useful for local integration testing and local development.
 */
export class SimAwsLocalServer {
  private readonly requestHandler: SimAwsLocalRequestHandler;
  private readonly server: Server;
  private readonly dnsServer: SimAwsDnsServer;

  constructor(properties: SimAwsLocalServerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.requestHandler = new SimAwsLocalRequestHandler(
      new SimAwsHttp({ simAws }),
    );
    this.dnsServer = new SimAwsDnsServer({ simAws });
    this.server = http.createServer((request, response) => {
      this.requestHandler.handle(request, response);
    });
  }

  /**
   * Start serving simulated AWS services on localhost.
   *
   * DNS comes up alongside HTTP rather than being opted into, so a served
   * environment is inspectable with a DNS client without anything extra to
   * discover. It binds the same port number on UDP that HTTP took on TCP, which
   * is normally free because the two protocols have separate port namespaces.
   *
   * HTTP binds the loopback address rather than the hostname. `sim-aws.localhost`
   * resolves to both `::1` and `127.0.0.1`, and binding the name takes whichever
   * the resolver returns first, which is commonly `::1`. DNS answers with the
   * IPv4 loopback address, so binding it explicitly is what makes the address in
   * a DNS answer one that actually serves HTTP.
   */
  async listen(port: number = simAwsLocalConfig.defaultPort): Promise<this> {
    this.server.listen(port, simAwsLocalConfig.loopbackAddress);
    await waitNodeServerListen(this.server);
    await this.dnsServer.listen(Number(this.port));
    return this;
  }

  /**
   * Get the hostname on which this local server is listening.
   */
  get hostname(): string {
    return simAwsLocalConfig.hostname;
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
   * Get the UDP port on which DNS queries are answered.
   *
   * Usually the same number as `port`, but not guaranteed: if that number was
   * already taken on UDP, DNS bound an ephemeral port instead. Read it rather
   * than assuming the numbers match.
   */
  get dnsPort(): string {
    return this.dnsServer.port;
  }

  /**
   * Stop serving simulated AWS services.
   */
  close(): void {
    this.server.close();
    this.dnsServer.close();
  }

  /**
   * Adapt a simulated AWS URL for this local server instance.
   */
  localUrl(input: string | URL): URL {
    const simAwsLocalUrl = new SimAwsLocalUrl({ input, port: this.port });
    return simAwsLocalUrl.toURL();
  }
}

interface ServeSimAwsProperties {
  readonly simAws?: SimAws;
  readonly port?: number;
}

/**
 * Serve a simulated AWS environment on localhost.
 */
export async function serveSimAws(
  properties: ServeSimAwsProperties = {},
): Promise<SimAwsLocalServer> {
  const { simAws = new SimAws(), port = simAwsLocalConfig.defaultPort } =
    properties;
  const server = new SimAwsLocalServer({ simAws });
  return server.listen(port);
}
