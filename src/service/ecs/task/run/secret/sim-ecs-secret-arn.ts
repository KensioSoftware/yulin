import type { SimAwsAccountId } from "../../../../aws/sim-aws-account-id.js";
import type { AwsRegionName } from "../../../../aws/sim-aws-region.js";
import { SimEcsSecretResolutionError } from "./sim-ecs-secret.error.js";

/**
 * Where each part of a container secret's `valueFrom` sits once it is split on
 * colons.
 *
 * The extended form real ECS accepts for a secret is
 * `arn:aws:secretsmanager:region:account:secret:id:json-key:stage:version`,
 * and every part after the id may be empty to mean it was not given. A secret
 * id cannot itself contain a colon, so splitting is unambiguous. A parameter
 * ARN stops at its resource, which carries the name after `parameter/`.
 */
export const simEcsSecretArnPart = {
  service: 2,
  region: 3,
  account: 4,
  resource: 5,
  secretId: 6,
  jsonKey: 7,
  versionStage: 8,
  versionId: 9,
} as const;

/**
 * The Account and Region an ARN names.
 */
export interface SimEcsSecretArnScope {
  readonly accountId: SimAwsAccountId | undefined;
  readonly regionName: AwsRegionName | undefined;
}

/**
 * One optional part of a reference, where empty means it was not given.
 */
export function simEcsSecretArnPartGiven(
  part: string | undefined,
): string | undefined {
  if (part === undefined || part === "") {
    return undefined;
  }

  return part;
}

/**
 * One part of a reference that has to be there for it to name anything.
 */
export function simEcsSecretArnPartRequired(
  part: string | undefined,
  valueFrom: string,
): string {
  const value = simEcsSecretArnPartGiven(part);

  if (value === undefined) {
    throw new SimEcsSecretResolutionError(
      `${valueFrom} names no secret or parameter.`,
    );
  }

  return value;
}

/**
 * The Account and Region the parts of an ARN name.
 */
export function simEcsSecretArnScope(
  parts: readonly string[],
): SimEcsSecretArnScope {
  return {
    accountId: simEcsSecretArnPartGiven(parts[simEcsSecretArnPart.account]) as
      | SimAwsAccountId
      | undefined,
    regionName: simEcsSecretArnPartGiven(parts[simEcsSecretArnPart.region]) as
      | AwsRegionName
      | undefined,
  };
}
