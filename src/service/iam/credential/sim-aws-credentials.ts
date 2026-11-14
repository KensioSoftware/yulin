import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamRole } from "../role/sim-iam-role.js";
import type { SimIamSession } from "./session/sim-iam-session.js";
import type { SimIamSessionPolicy } from "./session/sim-iam-session-policy.js";

export interface SimAwsCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string | undefined;
}

/**
 * The authenticated identity resolved from simulated AWS credentials.
 *
 * For temporary role credentials, `principal` is the assumed-role session
 * principal while `identityPolicyPrincipal` is the underlying IAM Role.
 */
export interface SimIamCredentialIdentity {
  readonly principal: SimAwsPrincipal;
  readonly identityPolicyPrincipal: SimAwsPrincipal;
  readonly role?: SimIamRole | undefined;
  readonly session?: SimIamSession | undefined;

  /**
   * The policies the session was created with, where it had any.
   */
  readonly sessionPolicies?: readonly SimIamSessionPolicy[] | undefined;

  /** The access key the credentials were signed with. */
  readonly accessKeyId?: string | undefined;
}
