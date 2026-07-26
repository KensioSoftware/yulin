import { SimIamIncompleteSignature } from "./error/sim-iam-sigv4.error.js";

const terminator = "aws4_request";
const dateStampPattern = /^\d{8}$/;

interface SimIamSigV4CredentialScopeProperties {
  readonly dateStamp: string;
  readonly regionName: string;
  readonly serviceName: string;
}

/**
 * The scope a SigV4 signature was made in: a date, a Region, and a service.
 *
 * The scope is not only checked, it is an input to the signing key, so a
 * request signed for one Region or service cannot be replayed against another
 * even before anything compares the two.
 */
export class SimIamSigV4CredentialScope {
  public readonly dateStamp: string;
  public readonly regionName: string;
  public readonly serviceName: string;

  constructor(properties: SimIamSigV4CredentialScopeProperties) {
    this.dateStamp = properties.dateStamp;
    this.regionName = properties.regionName;
    this.serviceName = properties.serviceName;
  }

  /**
   * Parse the scope part of a Credential value, such as
   * `20260726/eu-west-2/lambda/aws4_request`.
   */
  static parse(value: string): SimIamSigV4CredentialScope {
    const parts = value.split("/");

    if (parts.length !== 4) {
      throw new SimIamIncompleteSignature(
        `SigV4 credential scope ${value} must be ` +
          `<date>/<region>/<service>/${terminator}`,
      );
    }

    const [dateStamp, regionName, serviceName, scopeTerminator] = parts as [
      string,
      string,
      string,
      string,
    ];

    if (!dateStampPattern.test(dateStamp)) {
      throw new SimIamIncompleteSignature(
        `SigV4 credential scope date ${dateStamp} must be 8 digits, YYYYMMDD`,
      );
    }

    if (scopeTerminator !== terminator) {
      throw new SimIamIncompleteSignature(
        `SigV4 credential scope must end with ${terminator}, ` +
          `not ${scopeTerminator}`,
      );
    }

    return new SimIamSigV4CredentialScope({
      dateStamp,
      regionName,
      serviceName,
    });
  }

  /**
   * The scope in the form it appears in a Credential value and a string to
   * sign.
   */
  toString(): string {
    return [this.dateStamp, this.regionName, this.serviceName, terminator].join(
      "/",
    );
  }
}
