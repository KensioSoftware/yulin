import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimIam } from "../sim-iam.js";
import { SimCfnIamManagedPolicyCreator } from "./managed-policy/sim-cfn-iam-managed-policy-creator.js";
import { SimCfnIamRoleCreator } from "./role/sim-cfn-iam-role-creator.js";

/**
 * CloudFormation Resource factory for simulated IAM resources.
 */
export class SimIamCloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  private readonly managedPolicyCreator: SimCfnIamManagedPolicyCreator;
  private readonly roleCreator: SimCfnIamRoleCreator;

  constructor(iam: SimIam) {
    this.managedPolicyCreator = new SimCfnIamManagedPolicyCreator({ iam });
    this.roleCreator = new SimCfnIamRoleCreator({ iam });
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
      case "Role": {
        return await this.roleCreator.create(
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
}
