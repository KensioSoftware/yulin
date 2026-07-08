import type { SimArn } from "../../aws/arn.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";

export type SimIamPrincipalType =
  "root" | "user" | "role" | "assumed-role" | "service";

/**
 * Internal abstraction for anything that can make AWS requests.
 */
export interface SimIamPrincipal {
  readonly arn: SimArn;
  readonly accountId: SimAwsAccountId;
  readonly principalType: SimIamPrincipalType;
  readonly name: string;
}
