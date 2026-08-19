import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimCreatePolicyCommand } from "../command/policy/create-policy/create-policy.command.js";
import type { SimDeletePolicyCommand } from "../command/policy/delete-policy/delete-policy.command.js";
import type { SimDeleteRolePolicyCommand } from "../command/policy/delete-role-policy/delete-role-policy.command.js";
import type { SimDeleteRoleCommand } from "../command/role/delete-role/delete-role.command.js";
import type { SimDetachRolePolicyCommand } from "../command/role/detach-role-policy/detach-role-policy.command.js";
import type { SimGetPolicyCommand } from "../command/policy/get-policy/get-policy.command.js";
import type { SimListPoliciesCommand } from "../command/policy/list-policies/list-policies.command.js";
import type { SimPutRolePolicyCommand } from "../command/policy/put-role-policy/put-role-policy.command.js";
import type { SimPutUserPolicyCommand } from "../command/policy/put-user-policy/put-user-policy.command.js";
import type { SimAttachRolePolicyCommand } from "../command/role/attach-role-policy/attach-role-policy.command.js";
import type { SimCreateRoleCommand } from "../command/role/create-role/create-role.command.js";
import type { SimGetRoleCommand } from "../command/role/get-role/get-role.command.js";
import type { SimListRolesCommand } from "../command/role/list-roles/list-roles.command.js";
import type { SimAttachUserPolicyCommand } from "../command/user/attach-user-policy/attach-user-policy.command.js";
import type { SimCreateAccessKeyCommand } from "../command/user/create-access-key/create-access-key.command.js";
import type { SimCreateLoginProfileCommand } from "../command/user/create-login-profile/create-login-profile.command.js";
import type { SimCreateUserCommand } from "../command/user/create-user/create-user.command.js";
import type { SimIam } from "../sim-iam.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated IAM instance.
 */
export class SimIamSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simIam: SimIam) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "AttachRolePolicyCommand",
        async (command, context): Promise<unknown> =>
          await simIam.attachRolePolicy(
            command as SimAttachRolePolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "AttachUserPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simIam.attachUserPolicy(
            command as SimAttachUserPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DetachRolePolicyCommand",
        async (command, context): Promise<unknown> =>
          await simIam.detachRolePolicy(
            command as SimDetachRolePolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteRoleCommand",
        async (command, context): Promise<unknown> =>
          await simIam.deleteRole(
            command as SimDeleteRoleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteRolePolicyCommand",
        async (command, context): Promise<unknown> =>
          await simIam.deleteRolePolicy(
            command as SimDeleteRolePolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeletePolicyCommand",
        async (command, context): Promise<unknown> =>
          await simIam.deletePolicy(
            command as SimDeletePolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateAccessKeyCommand",
        async (command, context): Promise<unknown> =>
          await simIam.createAccessKey(
            command as SimCreateAccessKeyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateLoginProfileCommand",
        async (command, context): Promise<unknown> =>
          await simIam.createLoginProfile(
            command as SimCreateLoginProfileCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreatePolicyCommand",
        async (command, context): Promise<unknown> =>
          await simIam.createPolicy(
            command as SimCreatePolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateRoleCommand",
        async (command, context): Promise<unknown> =>
          await simIam.createRole(
            command as SimCreateRoleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateUserCommand",
        async (command, context): Promise<unknown> =>
          await simIam.createUser(
            command as SimCreateUserCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simIam.getPolicy(
            command as SimGetPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetRoleCommand",
        async (command, context): Promise<unknown> =>
          await simIam.getRole(
            command as SimGetRoleCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListPoliciesCommand",
        async (command, context): Promise<unknown> =>
          await simIam.listPolicies(
            command as SimListPoliciesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListRolesCommand",
        async (command, context): Promise<unknown> =>
          await simIam.listRoles(
            command as SimListRolesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutRolePolicyCommand",
        async (command, context): Promise<unknown> =>
          await simIam.putRolePolicy(
            command as SimPutRolePolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutUserPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simIam.putUserPolicy(
            command as SimPutUserPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated IAM can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated IAM supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
