import type { SimArn } from "../../../aws/arn.js";
import type { SimIamPolicyDocument } from "../../policy/sim-iam-policy.js";

/**
 * One policy passed to `AssumeRole` to limit the session it creates.
 *
 * An inline session policy has neither a name nor an ARN. A managed one keeps
 * the ARN it was named by. Its document is the one in force when the Role was
 * assumed.
 */
export interface SimIamSessionPolicy {
  readonly document: SimIamPolicyDocument;
  readonly policyName?: string | undefined;
  readonly policyArn?: SimArn | undefined;
}
