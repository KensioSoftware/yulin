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
}
