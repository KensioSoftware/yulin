import type { SimArn } from "../../aws/arn.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIam } from "../sim-iam.js";
import type { SimIamManagedPolicy } from "../policy/sim-iam-policy.js";
import { SimCfnIamRoleDeleter } from "./role/sim-cfn-iam-role-deleter.js";
import { SimCfnIamUserDeleter } from "./user/sim-cfn-iam-user-deleter.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnIamResourceDeleterProperties {
  readonly iam: SimIam;
}

/**
 * Deletes the simulated IAM resources a CloudFormation Stack created.
 */
export class SimCfnIamResourceDeleter {
  private readonly iam: SimIam;
  private readonly roleDeleter: SimCfnIamRoleDeleter;
  private readonly userDeleter: SimCfnIamUserDeleter;

  constructor(properties: SimCfnIamResourceDeleterProperties) {
    this.iam = properties.iam;
    this.roleDeleter = new SimCfnIamRoleDeleter({ iam: properties.iam });
    this.userDeleter = new SimCfnIamUserDeleter({ iam: properties.iam });
  }

  /**
   * Delete a simulated IAM resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "ManagedPolicy": {
        await this.deleteManagedPolicy(resource, options);
        return;
      }
      case "Policy": {
        await this.deleteInlinePolicy(properties, options);
        return;
      }
      case "Role": {
        await this.roleDeleter.delete(resource, options);
        return;
      }
      case "User": {
        await this.userDeleter.delete(resource, options);
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim IAM CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }

  private async deleteManagedPolicy(
    resource: SimCfnResource,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const policy = resource.simResource as SimIamManagedPolicy | undefined;
    assertDefined(
      policy,
      `sim IAM Managed Policy for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.detachManagedPolicy(policy.arn, options);
    await this.iam.deletePolicy({ input: { PolicyArn: policy.arn } }, options);
  }

  /**
   * Take the Managed Policy off every Role still carrying it.
   *
   * DeletePolicy refuses a policy anything is attached to, and an
   * AWS::IAM::ManagedPolicy attaches itself to the Roles its `Roles` property
   * names. A Role the same Stack created gives the policy up as its own
   * Resource is deleted. A Role declared outside the Stack keeps it. This
   * clears whatever attachments are left either way.
   */
  private async detachManagedPolicy(
    policyArn: SimArn,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await Promise.all(
      this.iam.roles
        .values()
        .filter((role) => role.attachedPolicyArns.has(policyArn))
        .map(async (role) =>
          this.iam.detachRolePolicy(
            { input: { RoleName: role.roleName, PolicyArn: policyArn } },
            options,
          ),
        ),
    );
  }

  /**
   * Take an AWS::IAM::Policy back off the Roles it was put on.
   *
   * The Resource has no stored object of its own, so the Roles are read from
   * the template the same way creation read them. Their Refs still resolve,
   * because a Role is deleted after the policies naming it.
   */
  private async deleteInlinePolicy(
    properties: SimCfnTemplateValueRecord,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const policyName = properties["PolicyName"];
    const roles = properties["Roles"];

    /* v8 ignore if -- creation refused the Resource if either was missing */
    if (typeof policyName !== "string" || !Array.isArray(roles)) {
      return;
    }

    await Promise.all(
      roles
        .filter((roleName): roleName is string => typeof roleName === "string")
        .map(async (roleName) =>
          this.iam.deleteRolePolicy(
            { input: { RoleName: roleName, PolicyName: policyName } },
            options,
          ),
        ),
    );
  }
}
