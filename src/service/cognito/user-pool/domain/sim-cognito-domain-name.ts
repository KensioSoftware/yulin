import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * How long a domain string may be, prefix and custom alike.
 */
const maxDomainLength = 63;

/**
 * The characters one DNS label holds, which is what a prefix domain is.
 */
const domainLabelPattern = /^[\da-z-]+$/u;

/**
 * Whether a value is one DNS label: those characters, starting and ending with
 * a letter or a number.
 *
 * The first and last characters are checked separately rather than in the
 * pattern, because a pattern saying all three things at once is the kind that
 * backtracks.
 */
function isDomainLabel(value: string): boolean {
  const first = value.at(0) ?? "";
  const last = value.at(-1) ?? "";

  return domainLabelPattern.test(value) && first !== "-" && last !== "-";
}

/**
 * The words real Cognito refuses in a prefix domain.
 */
const reservedWords = ["aws", "amazon", "cognito"];

/**
 * The label a hosted domain sits under, between the prefix and the region.
 */
export const cognitoDomainHostLabel = "auth";

/**
 * The domain suffix real Cognito serves a prefix domain on.
 */
export const cognitoDomainHostSuffix = "amazoncognito.com";

interface SimCognitoDomainNameProperties {
  readonly value: string | undefined;

  /**
   * Whether the request asked for a custom domain, which is what a
   * `CustomDomainConfig` says. A prefix and a custom domain are validated
   * differently, and the request rather than the value is what decides which
   * one is being asked for.
   */
  readonly custom: boolean;

  /** The region the pool lives in, which a prefix domain is served under. */
  readonly regionName: string;
}

/**
 * The domain string of one user pool domain, and the hostname it is served on.
 *
 * A prefix domain is one DNS label, and Cognito puts it under
 * `auth.<region>.amazoncognito.com`. A custom domain is the whole hostname,
 * which the request owns rather than Cognito. The two are different enough
 * that a value is checked against the form the request asked for rather than
 * being guessed at from the value itself.
 */
export class SimCognitoDomainName {
  public readonly value: string;
  public readonly custom: boolean;

  /**
   * The hostname real Cognito would serve this domain on.
   */
  public readonly hostname: string;

  constructor(properties: SimCognitoDomainNameProperties) {
    this.value = SimCognitoDomainName.required(properties.value);
    this.custom = properties.custom;

    if (this.custom) {
      this.requireCustomDomain();
      this.hostname = this.value;
    } else {
      this.requirePrefix();
      this.hostname =
        `${this.value}.${cognitoDomainHostLabel}.` +
        `${properties.regionName}.${cognitoDomainHostSuffix}`;
    }
  }

  private static required(value: string | undefined): string {
    if (value === undefined || value === "") {
      throw new SimCognitoInvalidParameterException(
        "Domain is required: name the domain the pool is served on",
      );
    }

    if (value.length > maxDomainLength) {
      throw new SimCognitoInvalidParameterException(
        `Domain '${value}' is too long: a domain is at most ` +
          `${String(maxDomainLength)} characters`,
      );
    }

    return value;
  }

  /**
   * The hostname this domain answers on inside the simulation.
   *
   * Serving drops the AWS domain from an AWS hostname, in the same way it
   * drops `.amazonaws.com` from an S3 endpoint, so a prefix domain is reached
   * locally by the part in front of it. A custom domain is the hostname the
   * request chose, and there is nothing to drop.
   */
  get localHostname(): string {
    if (this.custom) {
      return this.value;
    }

    return this.hostname.replace(`.${cognitoDomainHostSuffix}`, "");
  }

  /**
   * Check a prefix domain, which is one label with no reserved word in it.
   *
   * Real Cognito refuses a prefix containing `aws`, `amazon` or `cognito`, and
   * a pool deployed with one here would fail on the way to AWS rather than
   * here.
   */
  private requirePrefix(): void {
    if (!isDomainLabel(this.value)) {
      throw new SimCognitoInvalidParameterException(
        `Domain '${this.value}' is not a domain prefix: a prefix is lower ` +
          `case letters, numbers and hyphens, starting and ending with a ` +
          `letter or a number`,
      );
    }

    const reserved = reservedWords.find((word) => this.value.includes(word));

    if (reserved !== undefined) {
      throw new SimCognitoInvalidParameterException(
        `Domain '${this.value}' contains the reserved word '${reserved}': a ` +
          `domain prefix cannot contain ${reservedWords.join(", ")}`,
      );
    }
  }

  /**
   * Check a custom domain, which is a fully qualified name below a domain the
   * request owns.
   *
   * Real Cognito requires a subdomain rather than a bare registered domain,
   * so `auth.example.com` is accepted and `example.com` is not.
   */
  private requireCustomDomain(): void {
    const labels = this.value.split(".");

    if (labels.length < 3 || labels.some((label) => !isDomainLabel(label))) {
      throw new SimCognitoInvalidParameterException(
        `Domain '${this.value}' is not a custom domain: a custom domain is a ` +
          `fully qualified subdomain, such as 'auth.example.com'`,
      );
    }
  }
}
