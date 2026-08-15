import type { SimAwsAccountId } from "../../../../aws/sim-aws-account-id.js";
import type { AwsRegionName } from "../../../../aws/sim-aws-region.js";

/**
 * The stores a container secret's `valueFrom` may name.
 */
export type SimEcsSecretStoreName = "secretsmanager" | "ssm";

/**
 * Where one container secret's value comes from.
 *
 * The Account and Region are absent where the reference did not name them,
 * which is a bare SSM parameter name. Real ECS reads one of those in the task's
 * own Region, so whoever resolves the reference supplies the scope rather than
 * this deciding it.
 */
export interface SimEcsSecretReference {
  readonly store: SimEcsSecretStoreName;
  readonly accountId: SimAwsAccountId | undefined;
  readonly regionName: AwsRegionName | undefined;
  /**
   * The secret id or parameter name the store is asked for.
   */
  readonly identifier: string;
  readonly jsonKey: string | undefined;
  readonly versionStage: string | undefined;
  readonly versionId: string | undefined;
}
