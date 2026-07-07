import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimArn } from "../../../aws/arn.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimIamPolicy } from "../../policy/sim-iam-policy.js";
import { SimIamNoSuchEntity } from "../../error/sim-iam.error.js";
import type {
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput,
} from "./get-policy.cmd.js";

interface GetPolicyCommandHandlerProps {
  readonly policies: Map<SimArn, SimIamPolicy>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM GetPolicyCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/GetPolicyCommand/
 */
export class GetPolicyCommandHandler implements CommandHandler<
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput
> {
  private readonly policies: Map<SimArn, SimIamPolicy>;
  private readonly background: BackgroundScheduler;

  constructor(props: GetPolicyCommandHandlerProps) {
    const { policies, background = new BackgroundTasks() } = props;

    this.policies = policies;
    this.background = background;
  }

  /**
   * Handle a GetPolicyCommand from the SDK.
   */
  async handle(cmd: SimGetPolicyCommand): Promise<SimGetPolicyCommandOutput> {
    const policyArn = cmd.input.PolicyArn as SimArn | undefined;

    if (policyArn === undefined || policyArn.length === 0) {
      throw new Error("PolicyArn is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const policy = this.policies.get(policyArn);

    if (policy === undefined) {
      throw new SimIamNoSuchEntity(`No IAM Policy with ARN ${policyArn}`);
    }

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
