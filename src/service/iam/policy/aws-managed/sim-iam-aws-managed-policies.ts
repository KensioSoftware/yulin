import snapshot from "./sim-iam-aws-managed-policies.json" with { type: "json" };
import type { SimArn } from "../../../aws/arn.js";
import type { JSONString } from "../../../../util/type-guard/json.js";
import type {
  SimIamManagedPolicy,
  SimIamPolicyDocument,
  SimIamPolicyId,
  SimIamPolicyName,
} from "../sim-iam-policy.js";

interface SimIamAwsManagedPolicyRecord {
  readonly policyId: string;
  readonly description?: string;
  readonly createDate: string;
  readonly updateDate: string;
  readonly versionId: string;
  readonly document: unknown;
}

const records: ReadonlyMap<string, SimIamAwsManagedPolicyRecord> = new Map(
  Object.entries(snapshot.policies),
);

const policies = new Map<string, SimIamManagedPolicy>();

/**
 * The account and resource prefix every AWS-managed policy ARN has, in any
 * partition.
 */
const awsManagedArn = /^arn:([\w-]+):iam::aws:policy\/(.+)$/;

/**
 * Whether an ARN names a policy AWS manages rather than an Account's own.
 */
export function isSimIamAwsManagedPolicyArn(arn: string): boolean {
  return awsManagedArn.test(arn);
}

/**
 * The AWS-managed policy an ARN names, from the snapshot
 * `scripts/mts/write-iam-aws-managed-policies.mts` writes.
 *
 * An ARN outside the snapshot has no policy here, whether or not AWS
 * publishes one under it.
 */
export function simIamAwsManagedPolicy(
  arn: SimArn,
): SimIamManagedPolicy | undefined {
  const [, partition, pathAndName] = awsManagedArn.exec(arn) ?? [];

  if (partition === undefined || pathAndName === undefined) {
    return undefined;
  }

  const cached = policies.get(arn);

  if (cached !== undefined) {
    return cached;
  }

  const record = records.get(pathAndName);

  if (record === undefined) {
    return undefined;
  }

  const policy = awsManagedPolicy(arn, partition, pathAndName, record);
  policies.set(arn, policy);

  return policy;
}

/**
 * Every catalogued AWS-managed policy, in the `aws` partition.
 */
export function simIamAwsManagedPolicies(): readonly SimIamManagedPolicy[] {
  return records
    .keys()
    .flatMap((pathAndName) => {
      const policy = simIamAwsManagedPolicy(
        `arn:aws:iam::aws:policy/${pathAndName}` as SimArn,
      );

      return policy === undefined ? [] : [policy];
    })
    .toArray();
}

/**
 * A catalogued policy as an Account in the ARN's partition sees it.
 *
 * AWS publishes each partition's copy of a policy with that partition's ARNs.
 * The catalogue holds the `aws` copy, so an ARN in a statement is moved into
 * the partition the policy was attached from.
 */
function awsManagedPolicy(
  arn: SimArn,
  partition: string,
  pathAndName: string,
  record: SimIamAwsManagedPolicyRecord,
): SimIamManagedPolicy {
  const nameStart = pathAndName.lastIndexOf("/") + 1;

  return {
    arn,
    policyId: record.policyId as SimIamPolicyId,
    policyName: pathAndName.slice(nameStart) as SimIamPolicyName,
    path: `/${pathAndName.slice(0, nameStart)}`,
    defaultVersionId: record.versionId,
    attachmentCount: 0,
    permissionsBoundaryUsageCount: 0,
    isAttachable: true,
    description: record.description,
    creationDate: new Date(record.createDate),
    updateDate: new Date(record.updateDate),
    policyDocument: JSON.stringify(record.document).replaceAll(
      '"arn:aws:',
      () => `"arn:${partition}:`,
    ) as JSONString<SimIamPolicyDocument>,
  };
}
