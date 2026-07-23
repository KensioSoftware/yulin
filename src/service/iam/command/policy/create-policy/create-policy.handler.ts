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
import type { SimIamManagedPolicy } from "../../../policy/sim-iam-policy.js";
import { CreatePolicyInputResolver } from "./create-policy-input-resolver.js";
import { CreatePolicyRecordFactory } from "./create-policy-record-factory.js";
import { SimIamEntityAlreadyExists } from "../../../error/sim-iam.error.js";

interface CreatePolicyCommandHandlerProperties {
  readonly accountId: SimAwsAccountId;
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
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
  private readonly policies: Map<SimArn, SimIamManagedPolicy>;
  private readonly background: BackgroundScheduler;
  private readonly inputResolver: CreatePolicyInputResolver;
  private readonly policyFactory = new CreatePolicyRecordFactory();

  constructor(properties: CreatePolicyCommandHandlerProperties) {
    const {
      accountId,
      policies,
      background = new BackgroundTasks(),
    } = properties;
    this.policies = policies;
    this.background = background;
    this.inputResolver = new CreatePolicyInputResolver(accountId);
  }

  /**
   * Handle a CreatePolicyCommand from the SDK.
   */
  async handle(
    command: SimCreatePolicyCommand,
  ): Promise<SimCreatePolicyCommandOutput> {
    const { policyName, path, arn } = this.inputResolver.resolve(command);

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
      cmd: command,
    });

    this.policies.set(arn, policy);

    return this.policyFactory.makeOutput(policy);
  }
}
