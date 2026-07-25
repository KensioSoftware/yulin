import dgram from "node:dgram";
import { SimAws } from "../../service/aws/sim-aws.js";
import { simAwsLocalConf as simAwsLocalConfig } from "../http/local-server/sim-aws-local.conf.js";
import { SimAwsDns } from "./sim-aws-dns.js";

interface SimAwsDnsServerProperties {
  readonly simAws?: SimAws;
}

/**
 * Local DNS server for a simulated AWS environment.
 *
 * Answers real DNS queries over UDP, so simulated hosted zones can be inspected
 * with an ordinary DNS client. UDP only: a resolver falls back to TCP for
 * responses too large for a datagram, and the simulator's answers never are.
 */
export class SimAwsDnsServer {
  private readonly dns: SimAwsDns;
  private socket: dgram.Socket;
  private listening = false;

  constructor(properties: SimAwsDnsServerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.dns = new SimAwsDns({ simAws });
    this.socket = this.createSocket();
  }

  /**
   * Start answering DNS queries, preferring a given port number.
   *
   * UDP and TCP port namespaces are separate, so the number the HTTP server
   * took on TCP is normally free on UDP and one number serves both protocols.
   * That is a convenience rather than a guarantee: an unrelated process may
   * already hold that UDP port, so binding falls back to an ephemeral port and
   * reports it through `port` instead of failing to serve DNS at all.
   */
  async listen(preferredPort: number): Promise<this> {
    try {
      await this.bind(preferredPort);
    } catch {
      // The preferred number is free on TCP but held by something else on UDP.
      // A socket whose bind failed cannot be reused, so it is replaced.
      this.socket.close();
      this.socket = this.createSocket();
      await this.bind(0);
    }

    return this;
  }

  /**
   * Get the UDP port on which this DNS server is listening.
   */
  get port(): string {
    if (!this.listening) {
      throw new Error(
        "DNS server is not yet listening, cannot get port number",
      );
    }

    return String(this.socket.address().port);
  }

  /**
   * Stop answering DNS queries.
   */
  close(): void {
    if (!this.listening) {
      return;
    }

    this.listening = false;
    this.socket.close();
  }

  private createSocket(): dgram.Socket {
    const socket = dgram.createSocket("udp4");

    // A socket with no error listener throws on an 'error' event, which would
    // take the process down. Nothing useful can be done about a datagram that
    // failed to send to a client that may no longer be there, so the error is
    // absorbed and the server keeps answering.
    socket.on("error", () => {
      // Nothing to do but keep serving.
    });

    socket.on("message", (message, remote) => {
      // The send callback keeps a failure here from reaching the socket's error
      // event as an unhandled one.
      socket.send(
        this.dns.handleQuery(message),
        remote.port,
        remote.address,
        () => {
          // Delivery failure is the client's problem, not the server's.
        },
      );
    });

    return socket;
  }

  private async bind(port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        reject(error);
      };

      this.socket.once("error", onError);
      this.socket.bind(port, simAwsLocalConfig.loopbackAddress, () => {
        this.socket.off("error", onError);
        this.listening = true;
        resolve();
      });
    });
  }
}
