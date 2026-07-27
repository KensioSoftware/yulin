import { SimIamIncompleteSignature } from "../error/sim-iam-sigv4.error.js";
import { simIamSigV4Algorithm } from "../sim-iam-sigv4-authorization.js";
import { SimIamSigV4CredentialScope } from "../sim-iam-sigv4-credential-scope.js";

/**
 * The access key and scope a presigned URL's `X-Amz-Credential` names.
 *
 * The same `<access-key-id>/<scope>` pair an Authorization header carries,
 * written into a query parameter instead.
 */
export class SimIamSigV4PresignedCredential {
  public readonly accessKeyId: string;
  public readonly scope: SimIamSigV4CredentialScope;

  private constructor(accessKeyId: string, scope: SimIamSigV4CredentialScope) {
    this.accessKeyId = accessKeyId;
    this.scope = scope;
  }

  /**
   * Split a credential value, or fail saying what shape it should have been.
   */
  static parse(value: string): SimIamSigV4PresignedCredential {
    const separator = value.indexOf("/");

    if (separator < 1) {
      throw new SimIamIncompleteSignature(
        `Presigned URL X-Amz-Credential ${value} must be ` +
          `<access-key-id>/<scope>`,
      );
    }

    return new SimIamSigV4PresignedCredential(
      value.slice(0, separator),
      SimIamSigV4CredentialScope.parse(value.slice(separator + 1)),
    );
  }
}

/**
 * Refuse a presigned URL made with a signing algorithm that is not simulated.
 *
 * Naming the algorithm is worth doing because the alternative is a signature
 * mismatch with nothing to act on: SigV4A URLs look identical apart from this
 * parameter.
 */
export function simIamSigV4CheckPresignedAlgorithm(algorithm: string): void {
  if (algorithm !== simIamSigV4Algorithm) {
    throw new SimIamIncompleteSignature(
      `Presigned URL X-Amz-Algorithm ${algorithm} is not ${
        simIamSigV4Algorithm
      }`,
    );
  }
}
