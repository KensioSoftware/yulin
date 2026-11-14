import type { SimIamPolicyUsage } from "../../../policy/sim-iam-policy-usage.js";
import { simIamListedPolicies } from "./sim-iam-listed-policies.js";
import { simIamPage } from "../../sim-iam-page.js";
import type { CommandHandler } from "../../../../../command/command-handler.js";
import type { SimArn } from "../../../../aws/arn.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import type { SimIamManagedPolicy } from "../../../policy/sim-iam-policy.js";
import type {
  SimListPoliciesCommand,
  SimListPoliciesCommandOutput,
} from "./list-policies.command.js";

interface ListPoliciesCommandHandlerProperties {
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
  readonly usage: SimIamPolicyUsage;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM ListPoliciesCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/ListPoliciesCommand/
 */
export class ListPoliciesCommandHandler implements CommandHandler<
  SimListPoliciesCommand,
  SimListPoliciesCommandOutput
> {
  private readonly policies: Map<SimArn, SimIamManagedPolicy>;
  private readonly usage: SimIamPolicyUsage;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListPoliciesCommandHandlerProperties) {
    const { policies, usage, background = new BackgroundTasks() } = properties;

    this.policies = policies;
    this.usage = usage;
    this.background = background;
  }

  /**
   * Handle a ListPoliciesCommand from the SDK.
   */
  async handle(
    command: SimListPoliciesCommand,
  ): Promise<SimListPoliciesCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const { items, ...paging } = simIamPage(
      simIamListedPolicies(this.policies.values(), this.usage, command.input),
      (policy) => policy.arn,
      command.input,
    );

    return {
      Policies: items.map((policy) => {
        const counts = this.usage(policy.arn);

        return {
          PolicyName: policy.policyName,
          PolicyId: policy.policyId,
          Arn: policy.arn,
          Path: policy.path,
          DefaultVersionId: policy.defaultVersionId,
          AttachmentCount: counts.attachmentCount,
          PermissionsBoundaryUsageCount: counts.permissionsBoundaryUsageCount,
          IsAttachable: policy.isAttachable,
          Description: policy.description,
          CreateDate: policy.creationDate,
          UpdateDate: policy.updateDate,
        };
      }),
      ...paging,
    };
  }
}
