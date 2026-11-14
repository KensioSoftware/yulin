import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type { SimIamRequestOptions } from "../command/sim-iam-request-options.js";
import type { SimIam } from "../sim-iam.js";

/**
 * A SimIam method that handles one SDK Command.
 */
type SimIamCommandMethod = (
  command: never,
  options?: SimIamRequestOptions,
) => Promise<unknown>;

/**
 * The name of each SimIam method that handles an SDK Command.
 */
type SimIamOperationName = {
  [K in keyof SimIam]: SimIam[K] extends SimIamCommandMethod ? K : never;
}[keyof SimIam];

/**
 * The SimIam method handling each SDK Command, named the way the SDK names the
 * Command without its `Command` suffix and starting lower case.
 */
const simIamSdkOperations = [
  "addUserToGroup",
  "attachGroupPolicy",
  "attachRolePolicy",
  "attachUserPolicy",
  "createAccessKey",
  "createGroup",
  "createLoginProfile",
  "createPolicy",
  "createPolicyVersion",
  "createRole",
  "createUser",
  "deleteAccessKey",
  "deleteGroup",
  "deleteGroupPolicy",
  "deleteLoginProfile",
  "deletePolicy",
  "deletePolicyVersion",
  "deleteRole",
  "deleteRolePermissionsBoundary",
  "deleteRolePolicy",
  "deleteUser",
  "deleteUserPermissionsBoundary",
  "deleteUserPolicy",
  "detachGroupPolicy",
  "detachRolePolicy",
  "detachUserPolicy",
  "getGroup",
  "getGroupPolicy",
  "getLoginProfile",
  "getPolicy",
  "getPolicyVersion",
  "getRole",
  "getRolePolicy",
  "getUser",
  "getUserPolicy",
  "listAccessKeys",
  "listAttachedGroupPolicies",
  "listAttachedRolePolicies",
  "listAttachedUserPolicies",
  "listGroupPolicies",
  "listGroups",
  "listGroupsForUser",
  "listPolicies",
  "listPolicyVersions",
  "listRolePolicies",
  "listRoleTags",
  "listRoles",
  "listUserPolicies",
  "listUserTags",
  "listUsers",
  "putGroupPolicy",
  "putRolePermissionsBoundary",
  "putRolePolicy",
  "putUserPermissionsBoundary",
  "putUserPolicy",
  "removeUserFromGroup",
  "setDefaultPolicyVersion",
  "tagRole",
  "tagUser",
  "untagRole",
  "untagUser",
  "updateAccessKey",
  "updateAssumeRolePolicy",
  "updateRole",
] as const satisfies readonly SimIamOperationName[];

/**
 * Routes intercepted SDK Commands to one scoped simulated IAM instance.
 */
export class SimIamSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simIam: SimIam) {
    this.routes = new Map(
      simIamSdkOperations.map((operation) => [
        `${operation.charAt(0).toUpperCase()}${operation.slice(1)}Command`,
        async (command, context): Promise<unknown> =>
          // oxlint-disable-next-line security/detect-object-injection -- operation is one of the fixed names above.
          await (simIam[operation] as SimIamCommandMethod).call(
            simIam,
            command as never,
            simSdkCallerOptions(context),
          ),
      ]),
    );
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
