import http, { type Server } from "node:http";
import { SimAws } from "../../../service/aws/sim-aws.js";
import { simAwsLocalConfig } from "./sim-aws-local.config.js";
import { SimAwsHttp } from "../sim-aws-http.js";
import { SimAwsLocalUrl } from "../url/sim-aws-local-url.js";
import { NodeServerPortBinder } from "./node-server-port-binder.js";
import { nodeServerPort } from "./node-server-port.js";
import { SimAwsLocalRequestHandler } from "./sim-aws-local-request-handler.js";
import { SimAwsDnsServer } from "../../dns/sim-aws-dns-server.js";
import { SimLocalLiveReload } from "../live-reload/sim-local-live-reload.js";

interface SimAwsLocalServerProperties {
  readonly simAws?: SimAws;
  readonly liveReload?: boolean;
}

/**
 * Local HTTP server for a simulated AWS environment.
 * Useful for local integration testing and local development.
 */
export class SimAwsLocalServer {
  private readonly requestHandler: SimAwsLocalRequestHandler;
  private readonly server: Server;
  private readonly portBinder: NodeServerPortBinder;
  private readonly dnsServer: SimAwsDnsServer;
  private readonly liveReload: SimLocalLiveReload;

  constructor(properties: SimAwsLocalServerProperties = {}) {
    const { simAws = new SimAws(), liveReload = false } = properties;
    this.liveReload = new SimLocalLiveReload({ enabled: liveReload });
    const channel = this.liveReload.channel();
    this.requestHandler = new SimAwsLocalRequestHandler({
      simAwsHttp: new SimAwsHttp({ simAws }),
      ...(channel !== undefined && { liveReload: channel }),
    });
    this.dnsServer = new SimAwsDnsServer({ simAws });
    this.server = http.createServer((request, response) => {
      this.requestHandler.handle(request, response);
    });
    this.portBinder = new NodeServerPortBinder({ server: this.server });
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
   *
   * A pinned port that is still held is waited for rather than refused, so a
   * restart that overlaps the process it replaces still gets its port back.
   */
  async listen(port: number = simAwsLocalConfig.defaultPort): Promise<this> {
    await this.portBinder.bind(port);
    await this.dnsServer.listen(Number(this.port));

    this.liveReload.serving(this.port);

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
    return nodeServerPort(this.server);
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
   *
   * Open connections are ended rather than left to finish. Node's own close
   * stops the server accepting and lets go of the connections that are idle,
   * but one that is in use, which is what a browser part way through a request
   * or a live reload stream holds, keeps its socket open and the process with
   * it. Local development restarts on that process exiting, so the connections
   * go.
   *
   * The order is what a browser needs. Both ports are let go first, so a
   * replacement process can have them however long the rest takes. Then the
   * live reload streams are told a reload is coming and seen out, because a
   * socket destroyed with bytes still in flight is reset, and a reset costs the
   * browser the event it was just sent. Only what is left after that is
   * destroyed.
   *
   * Await it to know the last event has gone before leaving the process.
   */
  async close(): Promise<void> {
    this.server.close();
    this.dnsServer.close();

    await this.liveReload.stopping();

    this.server.closeAllConnections();
  }

  /**
   * Reload every browser connected to this server.
   *
   * For a change that needs no restart, such as new content in a simulated
   * Bucket. A change to the code that built the environment needs the process
   * to restart, and the pages reload themselves when it comes back.
   */
  reload(): void {
    this.liveReload.reload();
  }

  /**
   * Give now the refusal a reload would be given later, if there is one.
   *
   * This is how something handed the server to reload for it, such as a
   * watched template file, can refuse a server that was served without live
   * reload as it is handed over rather than on the first change.
   */
  checkReload(): void {
    this.liveReload.checkReload();
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
  readonly liveReload?: boolean;
}

/**
 * Serve a simulated AWS environment on localhost.
 */
export async function serveSimAws(
  properties: ServeSimAwsProperties = {},
): Promise<SimAwsLocalServer> {
  const {
    simAws = new SimAws(),
    port = simAwsLocalConfig.defaultPort,
    liveReload = false,
  } = properties;
  const server = new SimAwsLocalServer({ simAws, liveReload });
  return server.listen(port);
}
