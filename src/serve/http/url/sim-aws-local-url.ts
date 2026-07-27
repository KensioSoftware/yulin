import { simAwsLocalConfig } from "../local-server/sim-aws-local.config.js";

interface SimAwsLocalUrlProperties {
  readonly input: string | URL;
  readonly port?: string;
}

/**
 * Local URL for a simulated AWS service.
 */
export class SimAwsLocalUrl {
  public static readonly localhostSuffix = `.${simAwsLocalConfig.hostname}`;

  private readonly url: URL;

  constructor(properties: SimAwsLocalUrlProperties) {
    this.url = new URL(properties.input);
    this.url.protocol = "http:";
    this.url.hostname = this.localHostname(this.url.hostname);
    if (properties.port !== undefined) {
      this.url.port = properties.port;
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

    const awsHostnamePrefix = this.awsHostnamePrefix(hostname);

    if (awsHostnamePrefix !== undefined) {
      return `${awsHostnamePrefix}${SimAwsLocalUrl.localhostSuffix}`;
    }

    return `${hostname}${SimAwsLocalUrl.localhostSuffix}`;
  }

  /**
   * Get the part of a real AWS service hostname that identifies the resource,
   * dropping the AWS domain the local suffix replaces.
   *
   * Returns undefined for hostnames that are not AWS service endpoints, such
   * as a CloudFront alternate domain name, which are used as they are.
   */
  private awsHostnamePrefix(hostname: string): string | undefined {
    // The path-style S3 endpoint names no Bucket in its hostname, so it is
    // matched separately rather than by making the Bucket label optional.
    const awsHostname =
      /^(?<prefix>.+\.(?:s3|s3-website)\.[^.]+)\.amazonaws\.com$/.exec(
        hostname,
      ) ??
      /^(?<prefix>s3\.[^.]+)\.amazonaws\.com$/.exec(hostname) ??
      /^(?<prefix>.+\.lambda-url\.[^.]+)\.on\.aws$/.exec(hostname);

    return awsHostname?.groups?.["prefix"];
  }
}
