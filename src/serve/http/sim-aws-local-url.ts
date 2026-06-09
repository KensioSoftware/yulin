import { simAwsLocalConf } from "./sim-aws-local.conf.js";

/**
 * Local URL for a simulated AWS service.
 */
export class SimAwsLocalUrl {
  public static readonly localhostSuffix = `.${simAwsLocalConf.hostname}`;

  private readonly url: URL;

  constructor(input: string | URL, port?: string) {
    this.url = new URL(input);
    this.url.protocol = "http:";
    this.url.hostname = this.localHostname(this.url.hostname);
    if (port !== undefined) {
      this.url.port = port;
    }
  }

  /**
   * Convert to a URL instance.
   */
  toURL(): URL {
    return new URL(this.url.toString());
  }

  /**
   * Convert to a URL string.
   */
  toString(): string {
    return this.url.toString();
  }

  /**
   * Get a copy of the URL without the localhost suffix in the hostname.
   */
  withoutLocalhostSuffix(): URL {
    const url = this.toURL();
    url.hostname = url.hostname.replace(SimAwsLocalUrl.localhostSuffix, "");
    return url;
  }

  private localHostname(hostname: string): string {
    if (hostname.endsWith(SimAwsLocalUrl.localhostSuffix)) {
      return hostname;
    }

    const s3AwsHostname =
      /^(?<prefix>.+\.(?:s3|s3-website)\.[^.]+)\.amazonaws\.com$/.exec(
        hostname,
      );

    if (s3AwsHostname?.groups?.["prefix"] !== undefined) {
      return `${s3AwsHostname.groups["prefix"]}${SimAwsLocalUrl.localhostSuffix}`;
    }

    return `${hostname}${SimAwsLocalUrl.localhostSuffix}`;
  }
}
