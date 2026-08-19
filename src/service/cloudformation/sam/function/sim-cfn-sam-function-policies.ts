import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../sim-cfn-sam-record.js";

/**
 * The trust policy the Role carries, which lets Lambda assume it.
 */
export const lambdaAssumeRolePolicyDocument: SimCfnTemplateValueRecord = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

/**
 * The managed policy SAM attaches to every function Role it generates.
 */
export const basicExecutionPolicyArn: SimCfnTemplateValueRecord = {
  "Fn::Join": [
    "",
    [
      "arn:",
      { Ref: "AWS::Partition" },
      ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    ],
  ],
};

/**
 * What the `Policies` of a SAM function say about the Role it is expanded
 * with.
 */
export interface SamFunctionPolicies {
  /** Policy documents, named the way SAM names them. */
  readonly inlinePolicies: readonly SimCfnTemplateValueRecord[];
  /** Managed policy ARNs the Role attaches. */
  readonly managedPolicyArns: readonly string[];
}

/**
 * Read the `Policies` of a SAM function into the two lists an AWS::IAM::Role
 * carries.
 *
 * `Policies` holds one entry or a list of them, and an entry is a policy
 * document, a managed policy ARN, or a SAM policy template naming permissions
 * to generate. The templates are not expanded here. There are around a hundred
 * of them, and the default `SimIamAllowAllAuth` means a Role missing their
 * statements authorizes the same calls either way.
 */
export function samFunctionPolicies(
  logicalId: string,
  policies: SimCfnTemplateValue | undefined,
): SamFunctionPolicies {
  const entries = policyEntries(policies);

  return {
    inlinePolicies: entries
      .filter((entry) => isPolicyDocument(entry))
      .map((document, index) => ({
        PolicyName: `${logicalId}RolePolicy${String(index)}`,
        PolicyDocument: document,
      })),
    managedPolicyArns: entries.filter((entry) => isManagedPolicyArn(entry)),
  };
}

/**
 * The `Policies` property as a list, since SAM accepts a single entry in place
 * of one.
 */
function policyEntries(
  policies: SimCfnTemplateValue | undefined,
): SimCfnTemplateValue[] {
  if (policies === undefined) {
    return [];
  }

  return Array.isArray(policies) ? policies : [policies];
}

/**
 * Whether an entry is a policy document. A policy template is an object of one
 * key naming the template.
 */
function isPolicyDocument(
  entry: SimCfnTemplateValue,
): entry is SimCfnTemplateValueRecord {
  return isSamTemplateRecord(entry) && "Statement" in entry;
}

/**
 * Whether an entry is a managed policy ARN. A policy template arrives as a
 * bare name.
 */
function isManagedPolicyArn(entry: SimCfnTemplateValue): entry is string {
  return typeof entry === "string" && entry.startsWith("arn:");
}
