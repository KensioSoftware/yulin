import type { SimArn } from "../../../aws/arn.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIam } from "../../sim-iam.js";
import type { SimIamRoleName } from "../../role/sim-iam-role.js";
import type { SimIamUsername } from "../../user/sim-iam-user.js";
import type { SimIamGroupName } from "../../group/sim-iam-group.js";
import { simCfnIamNameList } from "../sim-cfn-iam-property.js";
import type {
  SimIamPolicyHolder,
  SimIamPolicyHolderKind,
} from "../../policy/sim-iam-policy-holder.js";
import { assertSimIamManagedPolicyQuota } from "../../command/entity/sim-iam-policy-holder-quota.js";
import { simIamDefined } from "../../command/sim-iam-found.js";
import { SimIamNoSuchEntity } from "../../error/sim-iam.error.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

/**
 * The template property naming each kind of entity a Managed Policy is
 * attached to.
 */
type SimCfnIamAttachmentProperty = "Roles" | "Users" | "Groups";

/**
 * The names of the Roles, Users and groups one Managed Policy is attached to.
 */
export type SimCfnIamManagedPolicyTargets = Readonly<
  Record<SimCfnIamAttachmentProperty, readonly string[]>
>;

interface SimCfnIamManagedPolicyAttacherProperties {
  readonly iam: SimIam;
}

/**
 * Attaches a CloudFormation-created Managed Policy to the Roles, Users and
 * groups its Resource names, the attachments AttachRolePolicy,
 * AttachUserPolicy and AttachGroupPolicy record.
 */
export class SimCfnIamManagedPolicyAttacher {
  private readonly iam: SimIam;

  constructor(properties: SimCfnIamManagedPolicyAttacherProperties) {
    this.iam = properties.iam;
  }

  /**
   * The entities an AWS::IAM::ManagedPolicy Resource attaches itself to. Refs
   * are resolved to names before creation, so entries arrive as plain
   * strings.
   *
   * A name no simulated entity answers to fails the Resource before the policy
   * is created, and so does an entity already carrying as many managed
   * policies as IAM allows. Checking afterwards would leave a policy behind
   * with nothing attached to it.
   */
  targets(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnIamManagedPolicyTargets {
    const names = (
      property: SimCfnIamAttachmentProperty,
      find: (name: string) => SimIamPolicyHolder | undefined,
    ): readonly string[] =>
      simCfnIamNameList({
        resourceType: "AWS::IAM::ManagedPolicy",
        resource,
        // oxlint-disable-next-line security/detect-object-injection -- fixed property names.
        value: properties[property],
        label: property,
      }).map((name) => {
        const kind = property.slice(0, -1) as SimIamPolicyHolderKind;
        const holder = simIamDefined(
          find(name),
          () => new SimIamNoSuchEntity(`No IAM ${kind} with name ${name}`),
        );
        // The policy is new, so it cannot already be attached to the holder.
        assertSimIamManagedPolicyQuota(holder, kind, "" as SimArn);

        return name;
      });

    return {
      Roles: names("Roles", (name) =>
        this.iam.roles.get(name as SimIamRoleName),
      ),
      Users: names("Users", (name) =>
        this.iam.users.get(name as SimIamUsername),
      ),
      Groups: names("Groups", (name) =>
        this.iam.groups.get(name as SimIamGroupName),
      ),
    };
  }

  /**
   * Attach the created Managed Policy to each of the entities.
   */
  async attach(
    policyArn: SimArn,
    targets: SimCfnIamManagedPolicyTargets,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await Promise.all([
      ...targets.Roles.map(async (RoleName) =>
        this.iam.attachRolePolicy(
          { input: { RoleName, PolicyArn: policyArn } },
          options,
        ),
      ),
      ...targets.Users.map(async (username) =>
        this.iam.attachUserPolicy(
          { input: { UserName: username, PolicyArn: policyArn } },
          options,
        ),
      ),
      ...targets.Groups.map(async (GroupName) =>
        this.iam.attachGroupPolicy(
          { input: { GroupName, PolicyArn: policyArn } },
          options,
        ),
      ),
    ]);
  }
}
