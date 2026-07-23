import type {
  SimSdkCommandRoute,
  SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimCreatePolicyCommand } from "../command/policy/create-policy/create-policy.cmd.js";
import type { SimGetPolicyCommand } from "../command/policy/get-policy/get-policy.cmd.js";
import type { SimListPoliciesCommand } from "../command/policy/list-policies/list-policies.cmd.js";
import type { SimPutRolePolicyCommand } from "../command/policy/put-role-policy/put-role-policy.cmd.js";
import type { SimPutUserPolicyCommand } from "../command/policy/put-user-policy/put-user-policy.cmd.js";
import type { SimAttachRolePolicyCommand } from "../command/role/attach-role-policy/attach-role-policy.cmd.js";
import type { SimCreateRoleCommand } from "../command/role/create-role/create-role.cmd.js";
import type { SimGetRoleCommand } from "../command/role/get-role/get-role.cmd.js";
import type { SimListRolesCommand } from "../command/role/list-roles/list-roles.cmd.js";
import type { SimCreateAccessKeyCommand } from "../command/user/create-access-key/create-access-key.cmd.js";
import type { SimCreateUserCommand } from "../command/user/create-user/create-user.cmd.js";
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
        async (command): Promise<unknown> =>
          await simIam.attachRolePolicy(command as SimAttachRolePolicyCommand),
      ],
      [
        "CreateAccessKeyCommand",
        async (command): Promise<unknown> =>
          await simIam.createAccessKey(command as SimCreateAccessKeyCommand),
      ],
      [
        "CreatePolicyCommand",
        async (command): Promise<unknown> =>
          await simIam.createPolicy(command as SimCreatePolicyCommand),
      ],
      [
        "CreateRoleCommand",
        async (command): Promise<unknown> =>
          await simIam.createRole(command as SimCreateRoleCommand),
      ],
      [
        "CreateUserCommand",
        async (command): Promise<unknown> =>
          await simIam.createUser(command as SimCreateUserCommand),
      ],
      [
        "GetPolicyCommand",
        async (command): Promise<unknown> =>
          await simIam.getPolicy(command as SimGetPolicyCommand),
      ],
      [
        "GetRoleCommand",
        async (command): Promise<unknown> =>
          await simIam.getRole(command as SimGetRoleCommand),
      ],
      [
        "ListPoliciesCommand",
        async (command): Promise<unknown> =>
          await simIam.listPolicies(command as SimListPoliciesCommand),
      ],
      [
        "ListRolesCommand",
        async (command): Promise<unknown> =>
          await simIam.listRoles(command as SimListRolesCommand),
      ],
      [
        "PutRolePolicyCommand",
        async (command): Promise<unknown> =>
          await simIam.putRolePolicy(command as SimPutRolePolicyCommand),
      ],
      [
        "PutUserPolicyCommand",
        async (command): Promise<unknown> =>
          await simIam.putUserPolicy(command as SimPutUserPolicyCommand),
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
