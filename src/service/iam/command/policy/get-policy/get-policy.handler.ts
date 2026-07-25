import type { CommandHandler } from "../../../../../command/command-handler.js";
import type { SimArn } from "../../../../aws/arn.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import type { SimIamManagedPolicy } from "../../../policy/sim-iam-policy.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import type {
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput,
} from "./get-policy.command.js";

interface GetPolicyCommandHandlerProperties {
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
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
  private readonly policies: Map<SimArn, SimIamManagedPolicy>;
  private readonly background: BackgroundScheduler;

  constructor(properties: GetPolicyCommandHandlerProperties) {
    const { policies, background = new BackgroundTasks() } = properties;

    this.policies = policies;
    this.background = background;
  }

  /**
   * Handle a GetPolicyCommand from the SDK.
   */
  async handle(
    command: SimGetPolicyCommand,
  ): Promise<SimGetPolicyCommandOutput> {
    const policyArn = command.input.PolicyArn as SimArn | undefined;

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
        CreateDate: policy.creationDate,
        UpdateDate: policy.updateDate,
      },
    };
  }
}
