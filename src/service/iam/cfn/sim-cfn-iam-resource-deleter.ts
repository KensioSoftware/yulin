import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnIamGroupDeleter } from "./group/sim-cfn-iam-group-deleter.js";
import type { SimCfnIamGroupMembership } from "./group/sim-cfn-iam-group-membership.js";
import { SimCfnIamInstanceProfileDeleter } from "./instance-profile/sim-cfn-iam-instance-profile-deleter.js";
import type { SimIam } from "../sim-iam.js";
import { SimCfnIamRoleDeleter } from "./role/sim-cfn-iam-role-deleter.js";
import { SimCfnIamUserDeleter } from "./user/sim-cfn-iam-user-deleter.js";
import { SimCfnIamPolicyDeleter } from "./sim-cfn-iam-policy-deleter.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnIamResourceDeleterProperties {
  readonly iam: SimIam;
  readonly membership: SimCfnIamGroupMembership;
}

/**
 * Deletes the simulated IAM resources a CloudFormation Stack created.
 */
export class SimCfnIamResourceDeleter {
  private readonly policyDeleter: SimCfnIamPolicyDeleter;
  private readonly roleDeleter: SimCfnIamRoleDeleter;
  private readonly userDeleter: SimCfnIamUserDeleter;
  private readonly groupDeleter: SimCfnIamGroupDeleter;
  private readonly membership: SimCfnIamGroupMembership;
  private readonly instanceProfiles: SimCfnIamInstanceProfileDeleter;

  constructor(properties: SimCfnIamResourceDeleterProperties) {
    this.policyDeleter = new SimCfnIamPolicyDeleter(properties.iam);
    this.roleDeleter = new SimCfnIamRoleDeleter({ iam: properties.iam });
    this.userDeleter = new SimCfnIamUserDeleter({ iam: properties.iam });
    this.groupDeleter = new SimCfnIamGroupDeleter(properties.iam);
    this.membership = properties.membership;
    this.instanceProfiles = new SimCfnIamInstanceProfileDeleter(properties.iam);
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
        await this.policyDeleter.deleteManagedPolicy(resource, options);
        return;
      }
      case "Policy": {
        await this.policyDeleter.deleteInlinePolicy(
          resource,
          properties,
          options,
        );
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
      case "Group": {
        await this.groupDeleter.delete(resource, options);
        return;
      }
      case "InstanceProfile": {
        await this.instanceProfiles.delete(resource, options);
        return;
      }
      case "UserToGroupAddition": {
        await this.membership.membership(resource, properties, {
          join: false,
          options,
        });
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim IAM CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }
}
