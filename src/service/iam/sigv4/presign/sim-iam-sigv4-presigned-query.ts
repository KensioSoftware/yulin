import type { SimIamSigV4CredentialScope } from "../sim-iam-sigv4-credential-scope.js";
import { simIamSigV4CheckedAmzDate } from "../sim-iam-sigv4-request-date.js";
import type { SimIamSigV4SignatureStatement } from "../sim-iam-sigv4-signature-statement.js";
import {
  simIamSigV4CheckPresignedAlgorithm,
  SimIamSigV4PresignedCredential,
} from "./sim-iam-sigv4-presigned-credential.js";
import {
  simIamSigV4PresignedParameter,
  simIamSigV4PresignedParameters as parameters,
  simIamSigV4RequiredPresignedParameter as required,
} from "./sim-iam-sigv4-presigned-parameters.js";
import { SimIamSigV4PresignedWindow } from "./sim-iam-sigv4-presigned-window.js";

/**
 * The signature a presigned URL carries in its query string.
 *
 * A presigned URL states in query parameters exactly what an `Authorization`
 * header states, plus the lifetime it was signed for. That is the whole of the
 * difference: the canonical request, the signing key and the comparison are
 * the same work, which is why this is a second way of reading a signature
 * rather than a second way of verifying one.
 */
export class SimIamSigV4PresignedQuery implements SimIamSigV4SignatureStatement {
  public readonly accessKeyId: string;
  public readonly scope: SimIamSigV4CredentialScope;
  public readonly signedHeaderNames: readonly string[];
  public readonly signature: string;
  public readonly amzDate: string;
  public readonly sessionToken: string | undefined;

  private readonly window: SimIamSigV4PresignedWindow;

  private constructor(url: URL) {
    simIamSigV4CheckPresignedAlgorithm(required(url, parameters.algorithm));

    const credential = SimIamSigV4PresignedCredential.parse(
      required(url, parameters.credential),
    );

    this.accessKeyId = credential.accessKeyId;
    this.scope = credential.scope;
    this.amzDate = simIamSigV4CheckedAmzDate(
      simIamSigV4PresignedParameter(url, parameters.date) ?? null,
      this.scope,
      "X-Amz-Date parameter",
    );
    this.signedHeaderNames = required(url, parameters.signedHeaders)
      .split(";")
      .map((name) => name.toLowerCase());
    this.signature = required(url, parameters.signature);
    this.sessionToken = simIamSigV4PresignedParameter(
      url,
      parameters.securityToken,
    );
    this.window = new SimIamSigV4PresignedWindow(
      this.amzDate,
      SimIamSigV4PresignedWindow.expirySeconds(
        simIamSigV4PresignedParameter(url, parameters.expires),
      ),
    );
  }

  /**
   * Whether a URL offers a presigned signature to verify.
   *
   * Presence of `X-Amz-Algorithm` is the test, not its value. A request
   * carrying that parameter is unambiguously an attempt at a presigned URL, so
   * an unsupported algorithm belongs in a refusal that says so rather than in
   * a silent fall through to anonymous.
   */
  static carriedBy(url: URL): boolean {
    return (
      simIamSigV4PresignedParameter(url, parameters.algorithm) !== undefined
    );
  }

  /**
   * Read a presigned URL's signature, or fail describing what was missing.
   */
  static parse(url: URL): SimIamSigV4PresignedQuery {
    return new SimIamSigV4PresignedQuery(url);
  }

  /**
   * Refuse this URL if simulated time has passed the window it was signed for.
   */
  checkNotExpired(now: Date): void {
    this.window.checkNotExpired(now);
  }
}
