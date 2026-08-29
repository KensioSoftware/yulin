import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * The request context a simulated KMS operation is made in.
 *
 * Both parts are request metadata the simulator takes on trust, in the way a
 * real KMS request carries them: who is making the call, and whether it
 * arrived through another AWS service rather than from the caller directly.
 */
export interface SimKmsRequestOptions {
  /**
   * The principal making the request. Defaults to the Account root.
   */
  readonly caller?: SimAwsCaller | undefined;

  /**
   * The service making the request on the caller's behalf, named as a service
   * such as `ssm` rather than as an endpoint.
   *
   * It becomes the `kms:ViaService` condition value for the request, using the
   * region the key belongs to. A caller reaching KMS directly leaves it unset,
   * and a policy conditioned on `kms:ViaService` then does not match.
   */
  readonly viaService?: string | undefined;

  /**
   * Whether the service named by `viaService` is making the request with the
   * caller's own KMS permissions rather than with its own.
   *
   * A key policy admitting whoever the request came from then grants nothing
   * by itself, because what it admits is the service, and the caller has to
   * hold the KMS action in an identity policy as well. A key policy naming the
   * caller still allows the request on its own, as it does for any other KMS
   * request.
   *
   * No simulated service sets this. Parameter Store is the case it was written
   * for, and the aws/ssm key policy grants its cryptographic actions to a
   * wildcard principal outright.
   */
  readonly withCallerPermissions?: boolean | undefined;
}
