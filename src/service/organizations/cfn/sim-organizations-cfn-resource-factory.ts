import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
  SimCloudFormationResourceDeleteContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnOrganizationCreator } from "./sim-cfn-organization-creator.js";
import { SimCfnOrganizationalUnitCreator } from "./sim-cfn-organizational-unit-creator.js";
import { SimCfnOrganizationsAccountCreator } from "./sim-cfn-organizations-account-creator.js";
import { SimCfnOrganizationsPolicyCreator } from "./sim-cfn-organizations-policy-creator.js";
import { SimCfnOrganizationsRemover } from "./sim-cfn-organizations-remover.js";

/**
 * CloudFormation Resource factory for simulated Organizations resources.
 *
 * An organization belongs to a whole SimAws rather than to the Account and
 * Region scope a Stack deploys into, so this reads the organization off the
 * creation context instead of being handed one. That leaves the factory with
 * no state and lets one serve every scope.
 *
 * `AWS::Organizations::ResourcePolicy` is left out, along with every policy
 * type but `SERVICE_CONTROL_POLICY`, and a template declaring either is
 * recorded as a skipped Resource.
 */
export class SimOrganizationsCfnResourceFactory implements SimCfnServiceResourceFactory {
  /**
   * Create a simulated Organizations resource from a CloudFormation Resource.
   */
  create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;
    const { simAws } = context;

    switch (resourceTypeName) {
      case "Organization": {
        return Promise.resolve(
          new SimCfnOrganizationCreator(simAws).create(resource, properties),
        );
      }
      case "OrganizationalUnit": {
        return Promise.resolve(
          new SimCfnOrganizationalUnitCreator(simAws).create(
            resource,
            properties,
          ),
        );
      }
      case "Account": {
        return Promise.resolve(
          new SimCfnOrganizationsAccountCreator(simAws).create(
            resource,
            properties,
          ),
        );
      }
      case "Policy": {
        return Promise.resolve(
          new SimCfnOrganizationsPolicyCreator(simAws).create(
            resource,
            properties,
          ),
        );
      }
      default: {
        throw new Error(
          `Unsupported sim Organizations CloudFormation Resource ${
            resourceTypeName
          }`,
        );
      }
    }
  }

  /**
   * Remove a simulated Organizations resource a Stack created.
   */
  delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    new SimCfnOrganizationsRemover(context.simAws).remove(
      resourceTypeName,
      resource,
    );

    return Promise.resolve();
  }
}
