import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIam } from "../../sim-iam.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimCfnIamRolePropsParser,
  type SimCfnIamRoleProps,
} from "./sim-cfn-iam-role-props-parser.js";

interface SimCfnIamRoleCreatorProps {
  readonly iam: SimIam;
}

/**
 * Creates simulated IAM Roles from CloudFormation Resources.
 */
export class SimCfnIamRoleCreator {
  private readonly iam: SimIam;
  private readonly propsParser = new SimCfnIamRolePropsParser();

  constructor(props: SimCfnIamRoleCreatorProps) {
    this.iam = props.iam;
  }

  /**
   * Create a simulated Role from an AWS::IAM::Role Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimIamRole> {
    const roleProps = this.propsParser.parse(resource, properties);

    await this.iam.createRole({
      input: {
        RoleName: roleProps.roleName,
        Path: roleProps.path,
        Description: roleProps.description,
        AssumeRolePolicyDocument: roleProps.assumeRolePolicyDocument,
      },
    });

    await Promise.all([
      this.putInlinePolicies(roleProps),
      this.attachManagedPolicies(roleProps),
    ]);

    const role = this.iam.roles.get(roleProps.roleName as SimIamRoleName);
    assertDefined(
      role,
      `Sim IAM Role ${roleProps.roleName} after CloudFormation creation`,
    );

    return role;
  }

  private async putInlinePolicies(
    roleProps: SimCfnIamRoleProps,
  ): Promise<void> {
    await Promise.all(
      roleProps.inlinePolicies.map(async (inlinePolicy) =>
        this.iam.putRolePolicy({
          input: {
            RoleName: roleProps.roleName,
            PolicyName: inlinePolicy.policyName,
            PolicyDocument: inlinePolicy.policyDocument,
          },
        }),
      ),
    );
  }

  private async attachManagedPolicies(
    roleProps: SimCfnIamRoleProps,
  ): Promise<void> {
    await Promise.all(
      roleProps.managedPolicyArns.map(async (policyArn) =>
        this.iam.attachRolePolicy({
          input: {
            RoleName: roleProps.roleName,
            PolicyArn: policyArn,
          },
        }),
      ),
    );
  }
}
