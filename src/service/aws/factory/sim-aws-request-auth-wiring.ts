import type { SimIamRegistry } from "../../iam/registry/sim-iam-registry.js";
import { SimIamAccessKeyRegistry } from "../../iam/registry/sim-iam-access-key-registry.js";
import { SimIamGlobalCredentialResolver } from "../../iam/registry/sim-iam-global-credential-resolver.js";
import { SimIamSigV4Verifier } from "../../iam/sigv4/sim-iam-sigv4-verifier.js";
import { SimAwsRequestCallerResolver } from "../../iam/request/sim-aws-request-caller-resolver.js";

interface SimAwsRequestAuthWiringProperties {
  readonly iamRegistry: SimIamRegistry;
}

/**
 * The request authentication collaborators shared by one SimAws instance.
 *
 * SimAwsServiceFactory constructs simulated services for an Account/Region
 * scope. This class holds the one graph that deliberately spans every scope
 * instead: a signed request names an access key rather than an Account, so
 * verifying it has to start from a simulation-wide index and only then reach
 * the IAM that issued the key.
 *
 * Keeping the three pieces together means they are wired once, in the order
 * they depend on each other, rather than as separate fields that happen to
 * refer to one another.
 * @internal
 */
export class SimAwsRequestAuthWiring {
  /**
   * Shared index of which Account owns each simulated access key.
   *
   * A SigV4 signed request names an access key but not an Account, so this is
   * what lets a signature be traced back to the IAM that issued it.
   */
  public readonly accessKeyRegistry = new SimIamAccessKeyRegistry();

  /**
   * Verifies SigV4 signatures made with any access key in this simulation.
   */
  public readonly signedRequests: SimIamSigV4Verifier;

  /**
   * Resolves the principal behind an HTTP request into this simulation.
   *
   * This is the single request authentication boundary: everything arriving
   * over HTTP, including the in-process `SimAwsHttp.fetch()` path, gets its
   * caller from here.
   */
  public readonly requestCallers: SimAwsRequestCallerResolver;

  constructor(properties: SimAwsRequestAuthWiringProperties) {
    this.signedRequests = new SimIamSigV4Verifier({
      credentials: new SimIamGlobalCredentialResolver({
        accessKeys: this.accessKeyRegistry,
        iam: properties.iamRegistry,
      }),
    });

    this.requestCallers = new SimAwsRequestCallerResolver({
      signedRequests: this.signedRequests,
    });
  }
}
