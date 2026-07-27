import { SimIamSigV4PresignedQuery } from "../sigv4/presign/sim-iam-sigv4-presigned-query.js";
import { simIamSigV4Algorithm } from "../sigv4/sim-iam-sigv4-authorization.js";
import type { SimIamSigV4ExpectedScope } from "../sigv4/sim-iam-sigv4-expected-scope.js";
import type { SimIamSigV4SignedRequest } from "../sigv4/sim-iam-sigv4-signed-request.js";
import type { SimIamSigV4Verifier } from "../sigv4/sim-iam-sigv4-verifier.js";
import {
  simAwsCallerHeaderName,
  simAwsCallerHeaderPrincipal,
} from "./sim-aws-caller-header.js";
import { SimAwsRequestCaller } from "./sim-aws-request-caller.js";

interface SimAwsRequestCallerResolverProperties {
  readonly signedRequests: SimIamSigV4Verifier;
}

/**
 * What resolving a caller needs beyond the request itself.
 */
export interface SimAwsCallerResolveOptions {
  /**
   * The service and Region the signature should have been scoped to.
   */
  readonly expectedScope?: SimIamSigV4ExpectedScope | undefined;
  /**
   * Simulated time, which credential expiry and a presigned URL's own expiry
   * are both judged against.
   */
  readonly now?: Date | undefined;
}

/**
 * The one place an HTTP request into simulated AWS becomes a principal.
 *
 * Resolution runs in a fixed order:
 *
 * 1. an `x-sim-aws-caller` header naming the principal directly;
 * 2. an `Authorization: AWS4-HMAC-SHA256` header, verified as a signature;
 * 3. neither, giving anonymous.
 *
 * The header wins over a signature so that a developer can override the
 * identity of a request their tooling already signs, without having to stop it
 * signing. Nothing else is worth resolving after an explicit statement of who
 * the caller is.
 *
 * Anonymous is the floor, and deliberately not the Account root. Simulated IAM
 * treats an omitted in-process caller as the root principal with unrestricted
 * access, which is convenient inside a test and would be a serious mistake over
 * HTTP: every unauthenticated request would arrive as an administrator.
 */
export class SimAwsRequestCallerResolver {
  private readonly signedRequests: SimIamSigV4Verifier;

  constructor(properties: SimAwsRequestCallerResolverProperties) {
    this.signedRequests = properties.signedRequests;
  }

  /**
   * Resolve the principal behind a request as received.
   *
   * Throws a SimAwsRequestAuthFailure when the request states an identity that
   * cannot be accepted. Stating none is not a failure; it is anonymous.
   */
  resolve(
    request: SimIamSigV4SignedRequest,
    options: SimAwsCallerResolveOptions = {},
  ): SimAwsRequestCaller {
    const named = request.headers.get(simAwsCallerHeaderName);

    if (named !== null) {
      return new SimAwsRequestCaller({
        principal: simAwsCallerHeaderPrincipal(named),
        authMethod: "caller-header",
      });
    }

    if (!this.carriesSignature(request)) {
      return SimAwsRequestCaller.anonymous();
    }

    return this.signedCaller(request, options);
  }

  /**
   * Whether the request offers a SigV4 signature to verify.
   *
   * Two things count: an AWS4-HMAC-SHA256 Authorization header, and the
   * `X-Amz-Algorithm` parameter a presigned URL states its signature with. An
   * Authorization header of any other scheme belongs to the application: a
   * bearer token sent to a Function URL with NONE auth is the handler's
   * business, and treating it as a broken signature would refuse a request real
   * AWS delivers.
   */
  private carriesSignature(request: SimIamSigV4SignedRequest): boolean {
    return (
      request.headers.get("authorization")?.startsWith(simIamSigV4Algorithm) ===
        true || SimIamSigV4PresignedQuery.carriedBy(request.url)
    );
  }

  private signedCaller(
    request: SimIamSigV4SignedRequest,
    options: SimAwsCallerResolveOptions,
  ): SimAwsRequestCaller {
    const identity = this.signedRequests.verify(request, {
      expectedScope: options.expectedScope,
      now: options.now,
    });

    return new SimAwsRequestCaller({
      principal: identity.principal,
      identityPolicyPrincipal: identity.identityPolicyPrincipal,
      authMethod: "sigv4",
    });
  }
}
