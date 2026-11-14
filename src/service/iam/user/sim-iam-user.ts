import type { JSONString } from "../../../util/type-guard/json.js";
import type { Brand } from "../../../util/brand.type.js";
import type { SimArn } from "../../aws/arn.js";
import type { SimIamAccessKey } from "../credential/sim-iam-access-key.js";
import type { SimIamPolicyDocument } from "../policy/sim-iam-policy.js";
import type { SimIamPrincipal } from "../principal/sim-iam-principal.js";
import type { SimIamUserLoginProfile } from "./sim-iam-user-login-profile.js";
import type { SimIamIdentityTags } from "../tag/sim-iam-identity-tags.js";
import type { SimIamGroup, SimIamGroupName } from "../group/sim-iam-group.js";

export type SimIamUsername = Brand<string, "SimIamUsername">;
export type SimIamUserId = Brand<string, "SimIamUserId">;

/**
 * Account-scoped simulated IAM user.
 */
export interface SimIamUser extends SimIamPrincipal {
  readonly principalType: "user";
  readonly userId: SimIamUserId;
  readonly userName: SimIamUsername;
  readonly path: string;
  readonly creationDate: Date;

  /**
   * Long-lived access keys owned by this user.
   */
  readonly accessKeys: Map<string, SimIamAccessKey>;

  /**
   * Inline identity policies stored directly on the user.
   */
  readonly inlinePolicies: Map<string, JSONString<SimIamPolicyDocument>>;

  /**
   * Managed identity policies attached to the user.
   */
  readonly attachedPolicyArns: Set<SimArn>;

  /**
   * ARN of the managed policy that caps what this User's identity policies
   * can grant, where it has one.
   */
  permissionsBoundaryArn?: SimArn | undefined;

  /**
   * The groups this User is in, by name. A User gets the policies of every
   * group it is in as well as its own.
   */
  readonly groups: Map<SimIamGroupName, SimIamGroup>;

  /**
   * The console sign-in profile, once the user has been given one.
   *
   * Mutable because a login profile is created after the user itself, by
   * `CreateLoginProfile` or by an `AWS::IAM::User` carrying a `LoginProfile`.
   */
  loginProfile: SimIamUserLoginProfile | undefined;

  /**
   * The tags on this User, which a policy reads as `aws:PrincipalTag/` when
   * the User makes a request and as `iam:ResourceTag/` when it is acted on.
   */
  readonly tags: SimIamIdentityTags;
}
