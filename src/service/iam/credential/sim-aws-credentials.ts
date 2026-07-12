import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamRole } from "../role/sim-iam-role.js";
import type { SimIamSession } from "./session/sim-iam-session.js";

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
}
