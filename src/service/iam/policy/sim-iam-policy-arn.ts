import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIamPolicyId, SimIamPolicyName } from "./sim-iam-policy.js";
import type { SimArn } from "../../aws/arn.js";
import { faker } from "@faker-js/faker";

/**
 * Make a sim IAM policy ARN.
 */
export function makeSimPolicyArn(properties: {
  readonly accountId: SimAwsAccountId;
  readonly path: string;
  readonly policyName: SimIamPolicyName;
}): SimArn {
  return `arn:aws:iam::${properties.accountId}:policy${properties.path}${properties.policyName}` as SimArn;
}

/**
 * Make a sim IAM policy ID.
 */
export function makeSimPolicyId(): SimIamPolicyId {
  return faker.string.alphanumeric({
    length: 21,
    casing: "upper",
  }) as SimIamPolicyId;
}
