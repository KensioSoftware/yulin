import type { SimArn } from "../../aws/arn.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimIamManagedPolicy } from "../policy/sim-iam-policy.js";
import type { SimIam } from "../sim-iam.js";
import { simCfnIamNameList } from "./sim-cfn-iam-property.js";

/**
 * Deletes the Managed Policies and inline policies a CloudFormation Stack
 * created, taking each off the Roles, Users and groups carrying it.
 */
export class SimCfnIamPolicyDeleter {
  constructor(private readonly iam: SimIam) {}

  /**
   * Delete a Managed Policy the Stack created, once nothing carries it.
   *
   * DeletePolicy refuses a policy holding versions other than its default, so
   * those are deleted first, the way CloudFormation's own handler does. That
   * happens before anything is detached, and a refused version deletion
   * leaves the attachments in place.
   */
  async deleteManagedPolicy(
    resource: SimCfnResource,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const policy = resource.simResource as SimIamManagedPolicy | undefined;
    assertDefined(
      policy,
      `sim IAM Managed Policy for CloudFormation Resource ${resource.logicalId}`,
    );

    const PolicyArn = policy.arn;
    const { Versions } = await this.iam.listPolicyVersions(
      { input: { PolicyArn } },
      options,
    );
    await Promise.all(
      Versions.filter((version) => !version.IsDefaultVersion).map(
        async ({ VersionId }) =>
          this.iam.deletePolicyVersion(
            { input: { PolicyArn, VersionId } },
            options,
          ),
      ),
    );
    await this.detachManagedPolicy(policy.arn, options);
    await this.iam.deletePolicy({ input: { PolicyArn: policy.arn } }, options);
  }

  /**
   * Take an AWS::IAM::Policy back off the Roles, Users and groups it was put
   * on.
   *
   * The Resource has no stored object of its own, so the Roles are read from
   * the template the same way creation read them. Their Refs still resolve,
   * because an entity is deleted after the policies naming it.
   */
  async deleteInlinePolicy(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    // Creation refused the Resource without a name or with a malformed list.
    const PolicyName = properties["PolicyName"] as string;
    const names = (property: string): readonly string[] =>
      simCfnIamNameList({
        resourceType: "AWS::IAM::Policy",
        resource,
        // oxlint-disable-next-line security/detect-object-injection -- fixed property names.
        value: properties[property],
        label: property,
      });

    await Promise.all([
      ...names("Roles").map(async (RoleName) =>
        this.iam.deleteRolePolicy({ input: { RoleName, PolicyName } }, options),
      ),
      ...names("Users").map(async (username) =>
        this.iam.deleteUserPolicy(
          { input: { UserName: username, PolicyName } },
          options,
        ),
      ),
      ...names("Groups").map(async (GroupName) =>
        this.iam.deleteGroupPolicy(
          { input: { GroupName, PolicyName } },
          options,
        ),
      ),
    ]);
  }

  /**
   * Take the Managed Policy off every Role, User and group still carrying it.
   *
   * DeletePolicy refuses a policy anything is attached to, and an
   * AWS::IAM::ManagedPolicy attaches itself to the entities its `Roles`,
   * `Users` and `Groups` properties name. An entity the same Stack created
   * gives the policy up as its own Resource is deleted. One declared outside
   * the Stack keeps it. This clears whatever attachments are left either way.
   */
  private async detachManagedPolicy(
    policyArn: SimArn,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const carrying = <T extends { readonly attachedPolicyArns: Set<SimArn> }>(
      entities: Map<string, T>,
    ): T[] =>
      entities
        .values()
        .filter((entity) => entity.attachedPolicyArns.has(policyArn))
        .toArray();
    const PolicyArn = policyArn;

    await Promise.all([
      ...carrying(this.iam.roles).map(async ({ roleName: RoleName }) =>
        this.iam.detachRolePolicy({ input: { RoleName, PolicyArn } }, options),
      ),
      ...carrying(this.iam.users).map(async ({ userName }) =>
        this.iam.detachUserPolicy(
          { input: { UserName: userName, PolicyArn } },
          options,
        ),
      ),
      ...carrying(this.iam.groups).map(async ({ groupName: GroupName }) =>
        this.iam.detachGroupPolicy(
          { input: { GroupName, PolicyArn } },
          options,
        ),
      ),
    ]);
  }
}
