import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import { simIamAttachedPolicies } from "../../../policy/sim-iam-managed-policy-lookup.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import type {
  SimListAttachedRolePoliciesCommand,
  SimListAttachedRolePoliciesCommandOutput,
} from "./list-attached-role-policies.command.js";

interface ListAttachedRolePoliciesCommandHandlerProperties {
  readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM ListAttachedRolePoliciesCommand handler.
 *
 * Every attached ARN is listed, including an AWS-managed one outside the
 * catalogue, because the attachment is what is being listed. The whole list
 * comes back in one page.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/ListAttachedRolePoliciesCommand/
 */
export class ListAttachedRolePoliciesCommandHandler implements CommandHandler<
  SimListAttachedRolePoliciesCommand,
  SimListAttachedRolePoliciesCommandOutput
> {
  private readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListAttachedRolePoliciesCommandHandlerProperties) {
    const { roles, background = new BackgroundTasks() } = properties;

    this.roles = roles;
    this.background = background;
  }

  /**
   * Handle a ListAttachedRolePoliciesCommand from the SDK.
   */
  async handle(
    command: SimListAttachedRolePoliciesCommand,
  ): Promise<SimListAttachedRolePoliciesCommandOutput> {
    const roleName = command.input.RoleName as SimIamRoleName | undefined;

    if (roleName === undefined || roleName.length === 0) {
      throw new Error("RoleName is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const role = this.roles.get(roleName);

    if (role === undefined) {
      throw new SimIamNoSuchEntity(`No IAM Role with name ${roleName}`);
    }

    return {
      AttachedPolicies: simIamAttachedPolicies(
        role.attachedPolicyArns,
        command.input.PathPrefix,
      ),
      IsTruncated: false,
    };
  }
}
