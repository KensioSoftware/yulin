import type { CommandHandler } from "../../../../../command/command-handler.js";
import type { SimArn } from "../../../../aws/arn.js";
import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type {
  SimCreatePolicyCommand,
  SimCreatePolicyCommandOutput,
} from "./create-policy.cmd.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import type {
  SimIamPolicy,
  SimIamPolicyName,
} from "../../../policy/sim-iam-policy.js";
import { makeSimPolicyArn } from "../../../policy/sim-iam-policy-arn.js";
import { normalisePolicyPath } from "../../../policy/sim-iam-policy-path.js";
import { CreatePolicyRecordFactory } from "./create-policy-record-factory.js";
import { SimIamEntityAlreadyExists } from "../../../error/sim-iam.error.js";

interface CreatePolicyCommandHandlerProps {
  readonly accountId: SimAwsAccountId;
  readonly policies: Map<SimArn, SimIamPolicy>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM CreatePolicyCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/CreatePolicyCommand/
 */
export class CreatePolicyCommandHandler implements CommandHandler<
  SimCreatePolicyCommand,
  SimCreatePolicyCommandOutput
> {
  private readonly accountId: SimAwsAccountId;
  private readonly policies: Map<SimArn, SimIamPolicy>;
  private readonly background: BackgroundScheduler;
  private readonly policyFactory = new CreatePolicyRecordFactory();

  constructor(props: CreatePolicyCommandHandlerProps) {
    const { accountId, policies, background = new BackgroundTasks() } = props;
    this.accountId = accountId;
    this.policies = policies;
    this.background = background;
  }

  /**
   * Handle a CreatePolicyCommand from the SDK.
   */
  async handle(
    cmd: SimCreatePolicyCommand,
  ): Promise<SimCreatePolicyCommandOutput> {
    const policyName = cmd.input.PolicyName as SimIamPolicyName | undefined;

    if (policyName === undefined || policyName.length === 0) {
      throw new Error("PolicyName is required");
    }

    const path = normalisePolicyPath(cmd.input.Path);
    const arn = makeSimPolicyArn({
      accountId: this.accountId,
      path,
      policyName,
    });

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    if (this.policies.has(arn)) {
      throw new SimIamEntityAlreadyExists(
        `Sim IAM Policy already exists: ${arn}`,
      );
    }

    const policy = this.policyFactory.makePolicy({
      arn,
      path,
      policyName,
      cmd,
    });

    this.policies.set(arn, policy);

    return this.policyFactory.makeOutput(policy);
  }
}
