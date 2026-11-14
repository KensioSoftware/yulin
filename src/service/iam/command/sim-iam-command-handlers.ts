import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimArn } from "../../aws/arn.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimIamActionAuthorizer } from "../authorize/sim-iam-action-authorizer.js";
import type { SimIamInterServiceAuthZ } from "../authorize/sim-iam-inter-service-auth-z.js";
import {
  simIamGlobalServiceRegion,
  simIamInRegion,
} from "../authorize/sim-iam-region-auth-z.js";
import type { SimIamCredentialRegistry } from "../credential/sim-iam-credential-registry.js";
import type { SimIamUserCredentialGenerator } from "../credential/user/sim-iam-user-credential-generator.js";
import type { SimIamManagedPolicy } from "../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../role/sim-iam-role.js";
import type { SimIamUser, SimIamUsername } from "../user/sim-iam-user.js";
import { SimIamPolicyCommandHandlers } from "./policy/sim-iam-policy-command-handlers.js";
import { SimIamRoleCommandHandlers } from "./role/sim-iam-role-command-handlers.js";
import { SimIamUserCommandHandlers } from "./user/sim-iam-user-command-handlers.js";
import { SimIamTagCommandHandlers } from "./tag/sim-iam-tag-command-handlers.js";
import { SimIamIdentityAuthorizer } from "../tag/sim-iam-identity-authorizer.js";
import type { SimIamGroup, SimIamGroupName } from "../group/sim-iam-group.js";
import { simIamPolicyUsage } from "../policy/sim-iam-policy-usage.js";
import { SimIamEntityPolicyCommands } from "./entity/sim-iam-entity-policy-commands.js";
import { SimIamRoleUpdateCommands } from "./entity/sim-iam-entity-update-commands.js";
import { SimIamBoundaryCommands } from "./entity/sim-iam-boundary-commands.js";
import { SimIamGroupCommands } from "./group/sim-iam-group-commands.js";
import { SimIamGroupLookup } from "./group/sim-iam-group-lookup.js";
import { SimIamGroupListCommands } from "./group/sim-iam-group-list-commands.js";
import { SimIamGroupMembershipCommands } from "./group/sim-iam-group-membership-commands.js";
import { SimIamPolicyVersionCommands } from "./policy/version/sim-iam-policy-version-commands.js";
import { SimIamPolicyVersionStore } from "./policy/version/sim-iam-policy-version-store.js";
import { SimIamUserReadCommands } from "./user/sim-iam-user-read-commands.js";
import { SimIamUserLookup } from "./user/sim-iam-user-lookup.js";
import { SimIamAccessKeyCommands } from "./user/sim-iam-access-key-commands.js";
import { SimIamLoginProfileCommands } from "./user/sim-iam-login-profile-commands.js";

interface SimIamCommandHandlersProperties {
  readonly accountId: SimAwsAccountId;
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly groups: Map<SimIamGroupName, SimIamGroup>;
  readonly credentialRegistry: SimIamCredentialRegistry;
  readonly userCredentialGenerator: SimIamUserCredentialGenerator;
  readonly background: BackgroundScheduler;

  /**
   * IAM itself, which authorizes its own control-plane commands.
   */
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * The command handlers of one simulated IAM Account, grouped by resource.
 *
 * Every group authorizes against the same IAM and mutates the same Account
 * state, so they are wired together here rather than one at a time in the
 * service facade. That keeps SimIam what it should be: state maps plus
 * delegation.
 */
export class SimIamCommandHandlers {
  readonly roles: SimIamRoleCommandHandlers;
  readonly users: SimIamUserCommandHandlers;
  readonly policies: SimIamPolicyCommandHandlers;
  readonly roleTags: SimIamTagCommandHandlers;
  readonly userTags: SimIamTagCommandHandlers;
  readonly rolePolicies: SimIamEntityPolicyCommands;
  readonly userPolicies: SimIamEntityPolicyCommands;
  readonly groupPolicies: SimIamEntityPolicyCommands;
  readonly userReads: SimIamUserReadCommands;
  readonly accessKeys: SimIamAccessKeyCommands;
  readonly loginProfiles: SimIamLoginProfileCommands;
  readonly roleUpdates: SimIamRoleUpdateCommands;
  readonly roleBoundaries: SimIamBoundaryCommands;
  readonly userBoundaries: SimIamBoundaryCommands;
  readonly versions: SimIamPolicyVersionCommands;
  readonly groups: SimIamGroupCommands;
  readonly groupMembers: SimIamGroupMembershipCommands;
  readonly groupLists: SimIamGroupListCommands;

  constructor(properties: SimIamCommandHandlersProperties) {
    // IAM is global rather than Region-scoped, so its own control-plane
    // requests are made in the Region its one endpoint is in.
    const authorizer = new SimIamActionAuthorizer({
      iam: simIamInRegion(properties.iam, simIamGlobalServiceRegion),
    });

    this.roles = new SimIamRoleCommandHandlers({
      accountId: properties.accountId,
      roles: properties.roles,
      background: properties.background,
      authorizer,
    });
    this.users = new SimIamUserCommandHandlers({
      accountId: properties.accountId,
      users: properties.users,
      credentialRegistry: properties.credentialRegistry,
      credentialGenerator: properties.userCredentialGenerator,
      background: properties.background,
      authorizer,
    });
    const { accountId, roles, users, groups, background } = properties;
    const identity = (
      entity: "Role" | "User" | "Group",
      find: (name: string) => SimIamRole | SimIamUser | SimIamGroup | undefined,
    ): SimIamIdentityAuthorizer =>
      new SimIamIdentityAuthorizer({ accountId, authorizer, entity, find });
    const roleIdentity = identity("Role", (name) =>
      roles.get(name as SimIamRoleName),
    );
    const userIdentity = identity("User", (name) =>
      users.get(name as SimIamUsername),
    );
    const groupIdentity = identity("Group", (name) =>
      groups.get(name as SimIamGroupName),
    );
    const policyCommands = (
      kind: "Role" | "User" | "Group",
      entityIdentity: SimIamIdentityAuthorizer,
      find: (name: string) => SimIamRole | SimIamUser | SimIamGroup | undefined,
    ): SimIamEntityPolicyCommands =>
      new SimIamEntityPolicyCommands({
        kind,
        identity: entityIdentity,
        find,
        background,
      });

    this.roleTags = new SimIamTagCommandHandlers(
      "Role",
      roleIdentity,
      background,
    );
    this.userTags = new SimIamTagCommandHandlers(
      "User",
      userIdentity,
      background,
    );
    this.rolePolicies = policyCommands("Role", roleIdentity, (name) =>
      roles.get(name as SimIamRoleName),
    );
    this.userPolicies = policyCommands("User", userIdentity, (name) =>
      users.get(name as SimIamUsername),
    );
    this.groupPolicies = policyCommands("Group", groupIdentity, (name) =>
      groups.get(name as SimIamGroupName),
    );
    const userLookup = new SimIamUserLookup({
      accountId,
      users,
      authorizer,
      identity: userIdentity,
      background,
    });
    this.userReads = new SimIamUserReadCommands(userLookup);
    this.accessKeys = new SimIamAccessKeyCommands(userLookup);
    this.loginProfiles = new SimIamLoginProfileCommands(userLookup);
    this.roleUpdates = new SimIamRoleUpdateCommands({
      roles,
      roleIdentity,
      background,
    });
    this.roleBoundaries = new SimIamBoundaryCommands({
      kind: "Role",
      identity: roleIdentity,
      find: (name): SimIamRole | undefined => roles.get(name as SimIamRoleName),
      background,
    });
    this.userBoundaries = new SimIamBoundaryCommands({
      kind: "User",
      identity: userIdentity,
      find: (name): SimIamUser | undefined => users.get(name as SimIamUsername),
      background,
    });
    this.versions = new SimIamPolicyVersionCommands(
      new SimIamPolicyVersionStore({
        policies: properties.policies,
        authorizer,
        background,
      }),
    );
    const lookup = new SimIamGroupLookup({
      groups,
      users,
      groupIdentity,
      userIdentity,
      background,
    });
    this.groups = new SimIamGroupCommands(accountId, lookup);
    this.groupMembers = new SimIamGroupMembershipCommands(lookup);
    this.groupLists = new SimIamGroupListCommands(authorizer, lookup);
    this.policies = new SimIamPolicyCommandHandlers({
      accountId: properties.accountId,
      policies: properties.policies,
      users,
      usage: simIamPolicyUsage(() => [
        ...roles.values(),
        ...users.values(),
        ...groups.values(),
      ]),
      background: properties.background,
      authorizer,
    });
  }
}
