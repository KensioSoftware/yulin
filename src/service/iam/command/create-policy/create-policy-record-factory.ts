import type { SimArn } from "../../../aws/arn.js";
import type {
  SimIamPolicy,
  SimIamPolicyDocument,
  SimIamPolicyName,
} from "../../policy/sim-iam-policy.js";
import { makeSimPolicyId } from "../../policy/sim-iam-policy-arn.js";
import type {
  SimCreatePolicyCommand,
  SimCreatePolicyCommandOutput,
} from "./create-policy.cmd.js";
import type { JSONString } from "../../../../util/type-guard/json.js";

interface CreatePolicyRecordFactoryProps {
  readonly arn: SimArn;
  readonly path: string;
  readonly policyName: SimIamPolicyName;
  readonly cmd: SimCreatePolicyCommand;
}

/**
 * Builds IAM Policy records and CreatePolicy responses.
 *
 * The handler owns command orchestration: validation, sequencing, duplicate
 * checks, and persistence. This factory owns the shape of the stored policy and
 * the shape returned to the SDK caller. Keeping those transformations here
 * reduces handler complexity and keeps field-mapping decisions in one place.
 */
export class CreatePolicyRecordFactory {
  /**
   * Create the simulator's stored policy model from validated command data.
   *
   * The same timestamp is used for CreateDate and UpdateDate because a newly
   * created IAM policy has not had a later update event. The default version
   * starts at v1, matching IAM's managed policy version model.
   */
  makePolicy(props: CreatePolicyRecordFactoryProps): SimIamPolicy {
    const { arn, path, policyName, cmd } = props;
    const now = new Date();

    return {
      arn,
      policyId: makeSimPolicyId(),
      policyName,
      path,
      defaultVersionId: "v1",
      attachmentCount: 0,
      permissionsBoundaryUsageCount: 0,
      isAttachable: true,
      description: cmd.input.Description,
      createDate: now,
      updateDate: now,
      policyDocument: cmd.input.PolicyDocument as
        JSONString<SimIamPolicyDocument> | undefined,
    };
  }

  /**
   * Convert the simulator's internal policy record into the SDK response shape.
   *
   * The policy document is stored locally but is not returned by CreatePolicy.
   * IAM callers retrieve policy document content through policy-version APIs,
   * so this method exposes only the metadata fields included in CreatePolicy
   * output.
   */
  makeOutput(policy: SimIamPolicy): SimCreatePolicyCommandOutput {
    return {
      Policy: {
        PolicyName: policy.policyName,
        PolicyId: policy.policyId,
        Arn: policy.arn,
        Path: policy.path,
        DefaultVersionId: policy.defaultVersionId,
        AttachmentCount: policy.attachmentCount,
        PermissionsBoundaryUsageCount: policy.permissionsBoundaryUsageCount,
        IsAttachable: policy.isAttachable,
        Description: policy.description,
        CreateDate: policy.createDate,
        UpdateDate: policy.updateDate,
      },
    };
  }
}
