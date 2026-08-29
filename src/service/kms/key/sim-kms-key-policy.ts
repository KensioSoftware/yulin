import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIamResourcePolicyInput } from "../../iam/authorize/context/sim-iam-authorization-input.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import { simKmsCallerAccountConditionKey } from "./sim-kms-caller-account.js";
import {
  simKmsViaServiceConditionKey,
  type SimKmsViaService,
} from "./sim-kms-via-service.js";

/**
 * The name real KMS reports a key's policy under. A KMS key has exactly one
 * policy and it is always called this.
 */
export const simKmsKeyPolicyName = "default";

/**
 * The key policy of one simulated KMS key.
 *
 * Every KMS key has a policy and it cannot be removed, which is what makes it
 * the root of trust for the key: an IAM policy granting kms:Decrypt achieves
 * nothing unless the key policy allows the access too. That is unlike other
 * AWS resource policies, where the resource having no policy at all simply
 * leaves the decision to IAM.
 */
export class SimKmsKeyPolicy {
  private readonly keyArn: string;
  private policyDocument: SimIamPolicyDocument;

  constructor(keyArn: string, document: SimIamPolicyDocument) {
    this.keyArn = keyArn;
    this.policyDocument = document;
  }

  /**
   * Build the default policy CreateKey applies when given no policy.
   *
   * This is the policy the AWS console and CLI create: it allows the Account
   * root every KMS action, which is how a key ends up usable by whichever of
   * the Account's principals IAM allows. A key created with a policy that
   * omits this statement can only be used by the principals it names, and no
   * IAM policy will widen that.
   */
  static default(keyArn: string, accountId: SimAwsAccountId): SimKmsKeyPolicy {
    return new SimKmsKeyPolicy(keyArn, {
      Version: "2012-10-17",
      Id: "key-default-1",
      Statement: [
        {
          Sid: "Enable IAM User Permissions",
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "kms:*",
          Resource: "*",
        },
      ],
    });
  }

  /**
   * Build the policy real AWS gives an AWS managed key.
   *
   * It is not the customer default with a different name on it. It grants use
   * of the key to the Account's principals only when the request reaches KMS
   * through the service that owns the key, and it delegates nothing else to
   * IAM: the second statement covers reading the key's metadata and no more.
   *
   * That is what makes an AWS managed key usable by a caller holding no KMS
   * permission at all, and unusable by a caller holding kms:Decrypt on it who
   * calls KMS directly.
   */
  static awsManaged(
    keyArn: string,
    accountId: SimAwsAccountId,
    viaService: SimKmsViaService,
  ): SimKmsKeyPolicy {
    return new SimKmsKeyPolicy(keyArn, {
      Version: "2012-10-17",
      Id: `auto-${viaService.serviceName}-1`,
      Statement: [
        {
          Sid: `Allow access through ${viaService.serviceName} for all principals in the account that are authorized to use ${viaService.serviceName}`,
          Effect: "Allow",
          Principal: { AWS: "*" },
          Action: [
            "kms:Encrypt",
            "kms:Decrypt",
            "kms:ReEncrypt*",
            "kms:GenerateDataKey*",
            "kms:CreateGrant",
            "kms:DescribeKey",
          ],
          Resource: "*",
          Condition: {
            StringEquals: {
              [simKmsCallerAccountConditionKey]: accountId,
              [simKmsViaServiceConditionKey]: viaService.value,
            },
          },
        },
        {
          Sid: "Allow direct access to key metadata to the account",
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: ["kms:Describe*", "kms:Get*", "kms:List*", "kms:RevokeGrant"],
          Resource: "*",
        },
      ],
    });
  }

  /**
   * The stored policy document.
   */
  document(): SimIamPolicyDocument {
    return this.policyDocument;
  }

  /**
   * Replace the stored policy document.
   */
  replaceWith(document: SimIamPolicyDocument): void {
    this.policyDocument = document;
  }

  /**
   * This policy as the resource-policy side of an IAM authorization.
   */
  asResourcePolicy(): SimIamResourcePolicyInput {
    return {
      document: this.policyDocument,
      policyName: simKmsKeyPolicyName,
      resourceArn: this.keyArn,
    };
  }
}
