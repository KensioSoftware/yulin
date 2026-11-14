import { simIamPolicyVersions } from "../../../policy/sim-iam-policy-versions.js";
import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import type { SimArn } from "../../../../aws/arn.js";
import {
  SimIamDeleteConflict,
  SimIamNoSuchEntity,
} from "../../../error/sim-iam.error.js";
import type { SimIamManagedPolicy } from "../../../policy/sim-iam-policy.js";
import type { SimIamPolicyUsage } from "../../../policy/sim-iam-policy-usage.js";
import type {
  SimDeletePolicyCommand,
  SimDeletePolicyCommandOutput,
} from "./delete-policy.command.js";

interface DeletePolicyCommandHandlerProperties {
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
  readonly usage: SimIamPolicyUsage;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM DeletePolicyCommand handler.
 *
 * Real IAM refuses to delete a managed policy while anything is attached to
 * it, so this counts the Roles and Users carrying the ARN rather than reading
 * the policy record's own attachment count: attachment is recorded on the
 * identity, which is where AttachRolePolicy puts it.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/DeletePolicyCommand/
 */
export class DeletePolicyCommandHandler implements CommandHandler<
  SimDeletePolicyCommand,
  SimDeletePolicyCommandOutput
> {
  private readonly policies: Map<SimArn, SimIamManagedPolicy>;
  private readonly usage: SimIamPolicyUsage;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeletePolicyCommandHandlerProperties) {
    const { policies, usage, background = new BackgroundTasks() } = properties;

    this.policies = policies;
    this.usage = usage;
    this.background = background;
  }

  /**
   * Handle a DeletePolicyCommand from the SDK.
   */
  async handle(
    command: SimDeletePolicyCommand,
  ): Promise<SimDeletePolicyCommandOutput> {
    const policyArn = command.input.PolicyArn as SimArn | undefined;

    if (policyArn === undefined || policyArn.length === 0) {
      throw new Error("PolicyArn is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    if (!this.policies.has(policyArn)) {
      throw new SimIamNoSuchEntity(`No IAM Policy with ARN ${policyArn}`);
    }

    this.assertNotAttached(policyArn);
    this.assertOneVersion(policyArn);
    this.policies.delete(policyArn);

    return {};
  }

  private assertNotAttached(policyArn: SimArn): void {
    if (this.usage(policyArn).attachmentCount > 0) {
      throw new SimIamDeleteConflict(
        `Cannot delete a policy attached to entities: IAM Policy ${policyArn}`,
      );
    }
  }

  private assertOneVersion(policyArn: SimArn): void {
    const policy = this.policies.get(policyArn);

    if (policy !== undefined && simIamPolicyVersions(policy).length > 1) {
      throw new SimIamDeleteConflict(
        "This policy has more than one version. Before you delete a policy, " +
          "you must delete the policy's non-default versions.",
      );
    }
  }
}
