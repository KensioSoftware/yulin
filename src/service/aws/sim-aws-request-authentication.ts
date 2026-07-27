import type { SimIamCredentialIdentity } from "../iam/credential/sim-aws-credentials.js";
import type { SimAwsRequestCaller } from "../iam/request/sim-aws-request-caller.js";
import { simIamSigV4SignedRequest } from "../iam/sigv4/sim-iam-sigv4-signed-request.js";
import type { SimAwsServiceFactory } from "./factory/sim-aws-service-factory.js";
import type { SimAwsRequestCallerOptions } from "./sim-aws-properties.js";

interface SimAwsRequestAuthenticationProperties {
  readonly serviceFactory: SimAwsServiceFactory;
  readonly clock: { now(): Date };
}

/**
 * One simulation's request authentication boundary.
 *
 * Verification and caller resolution live behind the same object because they
 * need the same two things: the shared credential registries, which span every
 * Account, and this simulation's clock. Everything a signature is judged
 * against in time, which is credential expiry and a presigned URL's own
 * lifetime, is judged against simulated time rather than the real clock, and
 * this is the one place that has to remember it.
 */
export class SimAwsRequestAuthentication {
  private readonly serviceFactory: SimAwsServiceFactory;
  private readonly clock: { now(): Date };

  constructor(properties: SimAwsRequestAuthenticationProperties) {
    this.serviceFactory = properties.serviceFactory;
    this.clock = properties.clock;
  }

  /**
   * Verify a request's SigV4 signature, returning the identity behind it.
   */
  verifySignature(
    request: Request,
    body: Uint8Array | undefined,
  ): SimIamCredentialIdentity {
    return this.serviceFactory.signedRequests.verify(
      simIamSigV4SignedRequest(request, body),
      { now: this.clock.now() },
    );
  }

  /**
   * Work out which principal a request is made by.
   */
  resolveCaller(
    request: Request,
    options: SimAwsRequestCallerOptions,
  ): SimAwsRequestCaller {
    return this.serviceFactory.requestCallers.resolve(
      simIamSigV4SignedRequest(request, options.body),
      { expectedScope: options.expectedScope, now: this.clock.now() },
    );
  }
}
