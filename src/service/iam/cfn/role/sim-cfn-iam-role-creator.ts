import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIam } from "../../sim-iam.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimCfnIamRolePropertiesParser as SimCfnIamRolePropertiesParser,
  type SimCfnIamRoleProperties as SimCfnIamRoleProperties,
} from "./sim-cfn-iam-role-properties-parser.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnIamRoleCreatorProperties {
  readonly iam: SimIam;
}

/**
 * Creates simulated IAM Roles from CloudFormation Resources.
 */
export class SimCfnIamRoleCreator {
  private readonly iam: SimIam;
  private readonly propsParser = new SimCfnIamRolePropertiesParser();

  constructor(properties: SimCfnIamRoleCreatorProperties) {
    this.iam = properties.iam;
  }

  /**
   * Create a simulated Role from an AWS::IAM::Role Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimIamRole> {
    const roleProperties = this.propsParser.parse(resource, properties);

    await this.iam.createRole(
      {
        input: {
          RoleName: roleProperties.roleName,
          Path: roleProperties.path,
          Description: roleProperties.description,
          AssumeRolePolicyDocument: roleProperties.assumeRolePolicyDocument,
        },
      },
      options,
    );

    await Promise.all([
      this.putInlinePolicies(roleProperties, options),
      this.attachManagedPolicies(roleProperties, options),
    ]);

    const role = this.iam.roles.get(roleProperties.roleName as SimIamRoleName);
    assertDefined(
      role,
      `Sim IAM Role ${roleProperties.roleName} after CloudFormation creation`,
    );

    return role;
  }

  private async putInlinePolicies(
    roleProperties: SimCfnIamRoleProperties,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await Promise.all(
      roleProperties.inlinePolicies.map(async (inlinePolicy) =>
        this.iam.putRolePolicy(
          {
            input: {
              RoleName: roleProperties.roleName,
              PolicyName: inlinePolicy.policyName,
              PolicyDocument: inlinePolicy.policyDocument,
            },
          },
          options,
        ),
      ),
    );
  }

  private async attachManagedPolicies(
    roleProperties: SimCfnIamRoleProperties,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await Promise.all(
      roleProperties.managedPolicyArns.map(async (policyArn) =>
        this.iam.attachRolePolicy(
          {
            input: {
              RoleName: roleProperties.roleName,
              PolicyArn: policyArn,
            },
          },
          options,
        ),
      ),
    );
  }
}
