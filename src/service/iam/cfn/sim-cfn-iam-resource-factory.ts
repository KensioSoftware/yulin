import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimIam } from "../sim-iam.js";
import { SimCfnIamManagedPolicyCreator } from "./managed-policy/sim-cfn-iam-managed-policy-creator.js";
import { SimCfnIamPolicyCreator } from "./policy/sim-cfn-iam-policy-creator.js";
import { SimCfnIamRoleCreator } from "./role/sim-cfn-iam-role-creator.js";
import { SimCfnIamUserCreator } from "./user/sim-cfn-iam-user-creator.js";
import { SimCfnIamResourceDeleter } from "./sim-cfn-iam-resource-deleter.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";

/**
 * CloudFormation Resource factory for simulated IAM resources.
 */
export class SimIamCloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  private readonly managedPolicyCreator: SimCfnIamManagedPolicyCreator;
  private readonly policyCreator: SimCfnIamPolicyCreator;
  private readonly roleCreator: SimCfnIamRoleCreator;
  private readonly userCreator: SimCfnIamUserCreator;
  private readonly deleter: SimCfnIamResourceDeleter;

  constructor(iam: SimIam) {
    this.managedPolicyCreator = new SimCfnIamManagedPolicyCreator({ iam });
    this.policyCreator = new SimCfnIamPolicyCreator({ iam });
    this.roleCreator = new SimCfnIamRoleCreator({ iam });
    this.userCreator = new SimCfnIamUserCreator({ iam });
    this.deleter = new SimCfnIamResourceDeleter({ iam });
  }

  /**
   * Create a simulated IAM resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    switch (resourceTypeName) {
      case "ManagedPolicy": {
        return await this.managedPolicyCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      case "Policy": {
        await this.policyCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
        return;
      }
      case "Role": {
        return await this.roleCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      case "User": {
        return await this.userCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim IAM CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  /**
   * Delete a simulated IAM resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.deleter.delete(
      resourceTypeName,
      resource,
      context.resolvedProperties ?? resource.properties,
    );
  }
}
