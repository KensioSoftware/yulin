import type { SimArn } from "../../../aws/arn.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import type {
  SimIamGroup,
  SimIamGroupName,
} from "../../group/sim-iam-group.js";
import type {
  SimIamInstanceProfile,
  SimIamInstanceProfileName,
} from "../../instance-profile/sim-iam-instance-profile.js";
import { simIamPolicyHolderQuotas } from "../../policy/sim-iam-policy-holder.js";
import {
  maxSimIamPolicyVersions,
  simIamPolicyVersions,
} from "../../policy/sim-iam-policy-versions.js";
import type { SimIamManagedPolicy } from "../../policy/sim-iam-policy.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import type { SimIamUser, SimIamUsername } from "../../user/sim-iam-user.js";
import {
  maxSimIamManagedPolicyCharacters,
  maxSimIamTrustPolicyCharacters,
} from "../../validate/size/sim-iam-policy-document-size.js";
import type { SimIamCommand } from "../entity/sim-iam-entity-policy.command.js";
import { maxSimIamGroupsPerUser } from "../group/sim-iam-group-membership-commands.js";
import { simIamAccountQuotas } from "../sim-iam-account-quota.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { maxSimIamAccessKeysPerUser } from "../user/create-access-key/create-access-key.handler.js";

export type SimGetAccountSummaryCommand = SimIamCommand<object>;
/**
 * What IAM reports an Account holds, and the quotas on it, by IAM's names.
 */
export type SimIamAccountSummaryMap = Readonly<
  Record<
    | keyof typeof fixedSummary
    | "Roles"
    | "Users"
    | "Groups"
    | "Policies"
    | "InstanceProfiles"
    | "PolicyVersionsInUse",
    number
  >
>;
export interface SimGetAccountSummaryCommandOutput {
  readonly SummaryMap: SimIamAccountSummaryMap;
}

export interface SimIamAccountSummaryProperties {
  readonly policies: ReadonlyMap<SimArn, SimIamManagedPolicy>;
  readonly roles: ReadonlyMap<SimIamRoleName, SimIamRole>;
  readonly users: ReadonlyMap<SimIamUsername, SimIamUser>;
  readonly groups: ReadonlyMap<SimIamGroupName, SimIamGroup>;
  readonly instanceProfiles: ReadonlyMap<
    SimIamInstanceProfileName,
    SimIamInstanceProfile
  >;
  readonly authorizer: SimIamActionAuthorizer;
  readonly background: BackgroundScheduler;
}

/**
 * The quotas IAM reports that the simulator holds at their defaults and
 * never changes. The things they count, such as MFA devices and server
 * certificates, are absent from the simulator, so each count is zero.
 */
const fixedSummary = {
  AccountMFAEnabled: 0,
  AccountAccessKeysPresent: 0,
  AccountPasswordPresent: 0,
  AccountSigningCertificatesPresent: 0,
  MFADevices: 0,
  MFADevicesInUse: 0,
  Providers: 0,
  ServerCertificates: 0,
  ServerCertificatesQuota: 20,
  SigningCertificatesPerUserQuota: 2,
  PolicyVersionsInUseQuota: 10_000,
  GlobalEndpointTokenVersion: 1,
  AccessKeysPerUserQuota: maxSimIamAccessKeysPerUser,
  GroupsPerUserQuota: maxSimIamGroupsPerUser,
  VersionsPerPolicyQuota: maxSimIamPolicyVersions,
  PolicySizeQuota: maxSimIamManagedPolicyCharacters,
  AssumeRolePolicySizeQuota: maxSimIamTrustPolicyCharacters,
  AttachedPoliciesPerRoleQuota: simIamPolicyHolderQuotas.Role.managedPolicies,
  AttachedPoliciesPerUserQuota: simIamPolicyHolderQuotas.User.managedPolicies,
  AttachedPoliciesPerGroupQuota: simIamPolicyHolderQuotas.Group.managedPolicies,
  RolePolicySizeQuota: simIamPolicyHolderQuotas.Role.inlineCharacters,
  UserPolicySizeQuota: simIamPolicyHolderQuotas.User.inlineCharacters,
  GroupPolicySizeQuota: simIamPolicyHolderQuotas.Group.inlineCharacters,
  RolesQuota: simIamAccountQuotas.Roles,
  UsersQuota: simIamAccountQuotas.Users,
  GroupsQuota: simIamAccountQuotas.Groups,
  PoliciesQuota: simIamAccountQuotas.Policies,
  InstanceProfilesQuota: simIamAccountQuotas.InstanceProfiles,
} as const;

/**
 * The command reporting what an Account holds against IAM's quotas.
 */
export class SimIamAccountSummaryCommands {
  constructor(private readonly properties: SimIamAccountSummaryProperties) {}

  /**
   * Count the Account's entities, alongside the quotas on them.
   */
  async getAccountSummary(
    _command: SimGetAccountSummaryCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimGetAccountSummaryCommandOutput> {
    const { authorizer, background, ...held } = this.properties;
    await background.sequence();
    authorizer.authorize("iam:GetAccountSummary", "*", options?.caller);

    return {
      SummaryMap: {
        ...fixedSummary,
        Roles: held.roles.size,
        Users: held.users.size,
        Groups: held.groups.size,
        Policies: held.policies.size,
        InstanceProfiles: held.instanceProfiles.size,
        PolicyVersionsInUse: held.policies
          .values()
          .reduce(
            (sum, policy) => sum + simIamPolicyVersions(policy).length,
            0,
          ),
      },
    };
  }
}
