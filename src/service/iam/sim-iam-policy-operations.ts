import type { SimIamRequestOptions } from "./command/sim-iam-request-options.js";
import type {
  SimIamCommand,
  SimIamEmptyOutput,
  SimIamGetInlinePolicyOutput,
  SimIamInlinePolicyInput,
  SimIamListAttachedPoliciesOutput,
  SimIamListEntityPoliciesInput,
  SimIamListInlinePoliciesOutput,
  SimIamManagedPolicyInput,
  SimIamPutInlinePolicyInput,
} from "./command/entity/sim-iam-entity-policy.command.js";
import type * as updates from "./command/entity/sim-iam-entity-update.command.js";
import type * as versions from "./command/policy/version/sim-iam-policy-version.command.js";
import { SimIamTagOperations } from "./sim-iam-tag-operations.js";

type Options = SimIamRequestOptions | undefined;
type Empty = Promise<SimIamEmptyOutput>;

/**
 * The simulated IAM facade's commands on the policies of Roles, Users and
 * groups, on changing a Role after it is created, and on the versions of a
 * managed policy.
 *
 * They sit apart from `SimIam` because it grows by one delegating method per
 * simulated operation, and a file has a length this codebase allows.
 */
export abstract class SimIamPolicyOperations extends SimIamTagOperations {
  /** Handle an IAM GetRolePolicy command. */
  async getRolePolicy(
    command: SimIamCommand<SimIamInlinePolicyInput<"RoleName">>,
    options?: Options,
  ): Promise<SimIamGetInlinePolicyOutput> {
    return await this.commands.rolePolicies.inline.get(
      command.input.RoleName,
      command.input.PolicyName,
      options,
    );
  }

  /** Handle an IAM ListRolePolicies command. */
  async listRolePolicies(
    command: SimIamCommand<SimIamListEntityPoliciesInput<"RoleName">>,
    options?: Options,
  ): Promise<SimIamListInlinePoliciesOutput> {
    return await this.commands.rolePolicies.inline.list(
      command.input.RoleName,
      command.input,
      options,
    );
  }

  /** Handle an IAM GetUserPolicy command. */
  async getUserPolicy(
    command: SimIamCommand<SimIamInlinePolicyInput<"UserName">>,
    options?: Options,
  ): Promise<SimIamGetInlinePolicyOutput> {
    return await this.commands.userPolicies.inline.get(
      command.input.UserName,
      command.input.PolicyName,
      options,
    );
  }

  /** Handle an IAM ListUserPolicies command. */
  async listUserPolicies(
    command: SimIamCommand<SimIamListEntityPoliciesInput<"UserName">>,
    options?: Options,
  ): Promise<SimIamListInlinePoliciesOutput> {
    return await this.commands.userPolicies.inline.list(
      command.input.UserName,
      command.input,
      options,
    );
  }

  /** Handle an IAM DeleteUserPolicy command. */
  async deleteUserPolicy(
    command: SimIamCommand<SimIamInlinePolicyInput<"UserName">>,
    options?: Options,
  ): Empty {
    return await this.commands.userPolicies.inline.delete(
      command.input.UserName,
      command.input.PolicyName,
      options,
    );
  }

  /** Handle an IAM DetachUserPolicy command. */
  async detachUserPolicy(
    command: SimIamCommand<SimIamManagedPolicyInput<"UserName">>,
    options?: Options,
  ): Empty {
    return await this.commands.userPolicies.managed.detach(
      command.input.UserName,
      command.input.PolicyArn,
      options,
    );
  }

  /** Handle an IAM GetGroupPolicy command. */
  async getGroupPolicy(
    command: SimIamCommand<SimIamInlinePolicyInput<"GroupName">>,
    options?: Options,
  ): Promise<SimIamGetInlinePolicyOutput> {
    return await this.commands.groupPolicies.inline.get(
      command.input.GroupName,
      command.input.PolicyName,
      options,
    );
  }

  /** Handle an IAM ListGroupPolicies command. */
  async listGroupPolicies(
    command: SimIamCommand<SimIamListEntityPoliciesInput<"GroupName">>,
    options?: Options,
  ): Promise<SimIamListInlinePoliciesOutput> {
    return await this.commands.groupPolicies.inline.list(
      command.input.GroupName,
      command.input,
      options,
    );
  }

  /** Handle an IAM DeleteGroupPolicy command. */
  async deleteGroupPolicy(
    command: SimIamCommand<SimIamInlinePolicyInput<"GroupName">>,
    options?: Options,
  ): Empty {
    return await this.commands.groupPolicies.inline.delete(
      command.input.GroupName,
      command.input.PolicyName,
      options,
    );
  }

  /** Handle an IAM DetachGroupPolicy command. */
  async detachGroupPolicy(
    command: SimIamCommand<SimIamManagedPolicyInput<"GroupName">>,
    options?: Options,
  ): Empty {
    return await this.commands.groupPolicies.managed.detach(
      command.input.GroupName,
      command.input.PolicyArn,
      options,
    );
  }

  /** Handle an IAM PutGroupPolicy command. */
  async putGroupPolicy(
    command: SimIamCommand<SimIamPutInlinePolicyInput<"GroupName">>,
    options?: Options,
  ): Empty {
    return await this.commands.groupPolicies.inline.put(
      command.input.GroupName,
      command.input,
      options,
    );
  }

  /** Handle an IAM AttachGroupPolicy command. */
  async attachGroupPolicy(
    command: SimIamCommand<SimIamManagedPolicyInput<"GroupName">>,
    options?: Options,
  ): Empty {
    return await this.commands.groupPolicies.managed.attach(
      command.input.GroupName,
      command.input.PolicyArn,
      options,
    );
  }

  /** Handle an IAM ListAttachedGroupPolicies command. */
  async listAttachedGroupPolicies(
    command: SimIamCommand<SimIamListEntityPoliciesInput<"GroupName">>,
    options?: Options,
  ): Promise<SimIamListAttachedPoliciesOutput> {
    return await this.commands.groupPolicies.managed.listAttached(
      command.input.GroupName,
      command.input,
      options,
    );
  }

  /** Handle an IAM UpdateRole command. */
  async updateRole(
    command: updates.SimUpdateRoleCommand,
    options?: Options,
  ): Empty {
    return await this.commands.roleUpdates.updateRole(command, options);
  }

  /** Handle an IAM UpdateAssumeRolePolicy command. */
  async updateAssumeRolePolicy(
    command: updates.SimUpdateAssumeRolePolicyCommand,
    options?: Options,
  ): Empty {
    return await this.commands.roleUpdates.updateAssumeRolePolicy(
      command,
      options,
    );
  }

  /** Handle an IAM PutRolePermissionsBoundary command. */
  async putRolePermissionsBoundary(
    command: updates.SimPutRolePermissionsBoundaryCommand,
    options?: Options,
  ): Empty {
    return await this.commands.roleBoundaries.put(
      command.input.RoleName,
      command.input.PermissionsBoundary,
      options,
    );
  }

  /** Handle an IAM DeleteRolePermissionsBoundary command. */
  async deleteRolePermissionsBoundary(
    command: updates.SimDeleteRolePermissionsBoundaryCommand,
    options?: Options,
  ): Empty {
    return await this.commands.roleBoundaries.delete(
      command.input.RoleName,
      options,
    );
  }

  /** Handle an IAM CreatePolicyVersion command. */
  async createPolicyVersion(
    command: versions.SimCreatePolicyVersionCommand,
    options?: Options,
  ): Promise<versions.SimCreatePolicyVersionCommandOutput> {
    return await this.commands.versions.createPolicyVersion(command, options);
  }

  /** Handle an IAM ListPolicyVersions command. */
  async listPolicyVersions(
    command: versions.SimListPolicyVersionsCommand,
    options?: Options,
  ): Promise<versions.SimListPolicyVersionsCommandOutput> {
    return await this.commands.versions.listPolicyVersions(command, options);
  }

  /** Handle an IAM DeletePolicyVersion command. */
  async deletePolicyVersion(
    command: versions.SimPolicyVersionCommand,
    options?: Options,
  ): Empty {
    return await this.commands.versions.deletePolicyVersion(command, options);
  }

  /** Handle an IAM SetDefaultPolicyVersion command. */
  async setDefaultPolicyVersion(
    command: versions.SimPolicyVersionCommand,
    options?: Options,
  ): Empty {
    return await this.commands.versions.setDefaultPolicyVersion(
      command,
      options,
    );
  }
}
