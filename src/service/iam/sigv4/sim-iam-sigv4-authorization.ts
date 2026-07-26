import { SimIamIncompleteSignature } from "./error/sim-iam-sigv4.error.js";
import { SimIamSigV4CredentialScope } from "./sim-iam-sigv4-credential-scope.js";

export const simIamSigV4Algorithm = "AWS4-HMAC-SHA256";

interface SimIamSigV4AuthorizationProperties {
  readonly accessKeyId: string;
  readonly scope: SimIamSigV4CredentialScope;
  readonly signedHeaderNames: readonly string[];
  readonly signature: string;
}

/**
 * The parts of an `Authorization: AWS4-HMAC-SHA256 ...` header.
 *
 * The signed header list matters as much as the signature: verification has to
 * canonicalize exactly the headers the signer chose, not whichever headers the
 * request happens to carry now.
 */
export class SimIamSigV4Authorization {
  public readonly accessKeyId: string;
  public readonly scope: SimIamSigV4CredentialScope;
  public readonly signedHeaderNames: readonly string[];
  public readonly signature: string;

  constructor(properties: SimIamSigV4AuthorizationProperties) {
    this.accessKeyId = properties.accessKeyId;
    this.scope = properties.scope;
    this.signedHeaderNames = properties.signedHeaderNames;
    this.signature = properties.signature;
  }

  /**
   * Parse an Authorization header value, or fail describing what was missing.
   */
  static parse(headerValue: string | null): SimIamSigV4Authorization {
    if (headerValue === null || headerValue.length === 0) {
      throw new SimIamIncompleteSignature(
        "Request carries no Authorization header to verify",
      );
    }

    const [algorithm, ...rest] = headerValue.split(" ");

    if (algorithm !== simIamSigV4Algorithm) {
      throw new SimIamIncompleteSignature(
        `Authorization header algorithm ${String(algorithm)} is not ${
          simIamSigV4Algorithm
        }`,
      );
    }

    const fields = this.fields(rest.join(" "));
    const credential = this.field(fields, "Credential");
    const separator = credential.indexOf("/");

    if (separator < 1) {
      throw new SimIamIncompleteSignature(
        `Authorization header Credential ${credential} must be ` +
          `<access-key-id>/<scope>`,
      );
    }

    return new SimIamSigV4Authorization({
      accessKeyId: credential.slice(0, separator),
      scope: SimIamSigV4CredentialScope.parse(credential.slice(separator + 1)),
      signedHeaderNames: this.field(fields, "SignedHeaders")
        .split(";")
        .map((name) => name.toLowerCase()),
      signature: this.field(fields, "Signature"),
    });
  }

  /**
   * Split the comma-separated `Name=value` fields that follow the algorithm.
   */
  private static fields(value: string): ReadonlyMap<string, string> {
    const fields = new Map<string, string>();

    for (const field of value.split(",")) {
      const separator = field.indexOf("=");

      if (separator > 0) {
        fields.set(
          field.slice(0, separator).trim(),
          field.slice(separator + 1).trim(),
        );
      }
    }

    return fields;
  }

  private static field(
    fields: ReadonlyMap<string, string>,
    name: string,
  ): string {
    const value = fields.get(name);

    if (value === undefined || value.length === 0) {
      throw new SimIamIncompleteSignature(
        `Authorization header is missing its ${name} field`,
      );
    }

    return value;
  }
}
