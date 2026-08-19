import type { SimAws } from "../../../service/aws/sim-aws.js";
import { SimAwsLocalUrl } from "../url/sim-aws-local-url.js";

interface SimAwsLocalLocationProperties {
  readonly simAws: SimAws;

  /**
   * Where the port this server took is read from, since a response is
   * localised long after the server was built.
   */
  readonly port: () => string;
}

/**
 * Puts a `Location` header naming a simulated hostname into the localhost form
 * a browser can follow.
 *
 * A simulated service redirects to the hostname it would use against real AWS.
 * A browser handed that hostname leaves the simulation and goes to the public
 * internet. The localhost form is the address the same environment answers on,
 * and it is what `srv.localUrl` gives a caller holding a simulated URL. Both
 * ends of a redirect now agree.
 *
 * A hostname this simulation resolves is rewritten, and everything else is
 * passed on as the service wrote it, including a redirect to a real address.
 * The hostname is read the way an arriving request's is read. A redirect to
 * `www.example.com` and a request for `www.example.com` reach the same place.
 *
 * The scheme goes with the host, because the local form is served over HTTP.
 *
 * Only the local server does this. `SimAwsHttp` answers in the process that
 * built the environment and reaches every simulated hostname by its own name.
 * A test using it sees the hostname the service issued.
 */
export class SimAwsLocalLocation {
  private readonly simAws: SimAws;
  private readonly port: () => string;

  constructor(properties: SimAwsLocalLocationProperties) {
    this.simAws = properties.simAws;
    this.port = properties.port;
  }

  /**
   * Return the response a client should get, with its `Location` header
   * localised where that header names a simulated hostname.
   */
  localise(response: Response): Response {
    const location = response.headers.get("location");

    if (location === null) {
      return response;
    }

    const localUrl = this.localUrl(location);

    if (localUrl === undefined) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("location", localUrl.href);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  /**
   * The local address a `Location` header points at, where the simulation
   * serves what it named.
   *
   * A relative location is left alone. It is already relative to a hostname
   * the client reached this server by.
   */
  private localUrl(location: string): URL | undefined {
    const url = URL.parse(location);

    if (url === null) {
      return undefined;
    }

    const localUrl = new SimAwsLocalUrl({
      input: url,
      port: this.port(),
    }).toURL();

    if (this.resolves(url.hostname) || this.resolves(localUrl.hostname)) {
      return localUrl;
    }

    return undefined;
  }

  /**
   * Whether simulated Route53 resolves a hostname to a service of this
   * simulation.
   */
  private resolves(hostname: string): boolean {
    return this.simAws.route53().resolveHttpHost(hostname) !== undefined;
  }
}
