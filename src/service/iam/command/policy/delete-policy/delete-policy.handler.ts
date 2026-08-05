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
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";
import type {
  SimDeletePolicyCommand,
  SimDeletePolicyCommandOutput,
} from "./delete-policy.command.js";

interface DeletePolicyCommandHandlerProperties {
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly users: Map<SimIamUsername, SimIamUser>;
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
  private readonly roles: Map<SimIamRoleName, SimIamRole>;
  private readonly users: Map<SimIamUsername, SimIamUser>;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeletePolicyCommandHandlerProperties) {
    const {
      policies,
      roles,
      users,
      background = new BackgroundTasks(),
    } = properties;

    this.policies = policies;
    this.roles = roles;
    this.users = users;
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
    this.policies.delete(policyArn);

    return {};
  }

  private assertNotAttached(policyArn: SimArn): void {
    if (this.attachmentCount(policyArn) > 0) {
      throw new SimIamDeleteConflict(
        `Cannot delete a policy attached to entities: IAM Policy ${policyArn}`,
      );
    }
  }

  private attachmentCount(policyArn: SimArn): number {
    const identities = [...this.roles.values(), ...this.users.values()];

    return identities.filter((identity) =>
      identity.attachedPolicyArns.has(policyArn),
    ).length;
  }
}
