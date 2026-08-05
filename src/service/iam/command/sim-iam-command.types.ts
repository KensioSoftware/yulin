/**
 * The structural command and output types of every simulated IAM operation.
 *
 * Collected here so the service facade can name them in one import, rather
 * than repeating a per-command import list.
 */

export type {
  SimCreatePolicyCommand,
  SimCreatePolicyCommandOutput,
} from "./policy/create-policy/create-policy.command.js";
export type {
  SimDeletePolicyCommand,
  SimDeletePolicyCommandOutput,
} from "./policy/delete-policy/delete-policy.command.js";
export type {
  SimDeleteRolePolicyCommand,
  SimDeleteRolePolicyCommandOutput,
} from "./policy/delete-role-policy/delete-role-policy.command.js";
export type {
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput,
} from "./policy/get-policy/get-policy.command.js";
export type {
  SimListPoliciesCommand,
  SimListPoliciesCommandOutput,
} from "./policy/list-policies/list-policies.command.js";
export type {
  SimPutRolePolicyCommand,
  SimPutRolePolicyCommandOutput,
} from "./policy/put-role-policy/put-role-policy.command.js";
export type {
  SimPutUserPolicyCommand,
  SimPutUserPolicyCommandOutput,
} from "./policy/put-user-policy/put-user-policy.command.js";
export type {
  SimAttachRolePolicyCommand,
  SimAttachRolePolicyCommandOutput,
} from "./role/attach-role-policy/attach-role-policy.command.js";
export type {
  SimCreateRoleCommand,
  SimCreateRoleCommandOutput,
} from "./role/create-role/create-role.command.js";
export type {
  SimDeleteRoleCommand,
  SimDeleteRoleCommandOutput,
} from "./role/delete-role/delete-role.command.js";
export type {
  SimDetachRolePolicyCommand,
  SimDetachRolePolicyCommandOutput,
} from "./role/detach-role-policy/detach-role-policy.command.js";
export type {
  SimGetRoleCommand,
  SimGetRoleCommandOutput,
} from "./role/get-role/get-role.command.js";
export type {
  SimListRolesCommand,
  SimListRolesCommandOutput,
} from "./role/list-roles/list-roles.command.js";
export type {
  SimCreateAccessKeyCommand,
  SimCreateAccessKeyCommandOutput,
} from "./user/create-access-key/create-access-key.command.js";
export type {
  SimCreateUserCommand,
  SimCreateUserCommandOutput,
} from "./user/create-user/create-user.command.js";
