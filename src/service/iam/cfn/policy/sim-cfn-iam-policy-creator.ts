import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIam } from "../../sim-iam.js";
import {
  SimCfnIamPolicyPropertiesParser,
  type SimCfnIamPolicyProperties,
} from "./sim-cfn-iam-policy-properties-parser.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnIamPolicyCreatorProperties {
  readonly iam: SimIam;
}

/**
 * Creates simulated IAM inline policies from AWS::IAM::Policy CloudFormation
 * Resources.
 *
 * AWS::IAM::Policy is an inline policy put onto the referenced principals,
 * which is how CDK grants such as bucket.grantRead(fn) attach permissions to a
 * function's execution role, and bucket.grantRead(user) to a user (the
 * "DefaultPolicy" resource). Roles and Users are simulated. The policy has no
 * standalone stored resource, so creation returns undefined and Ref resolution
 * uses the default adapter.
 */
export class SimCfnIamPolicyCreator {
  private readonly iam: SimIam;
  private readonly propsParser = new SimCfnIamPolicyPropertiesParser();

  constructor(properties: SimCfnIamPolicyCreatorProperties) {
    this.iam = properties.iam;
  }

  /**
   * Put the inline policy onto each referenced Role and User.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<undefined> {
    const policyProperties = this.propsParser.parse(resource, properties);

    await Promise.all([
      this.putRolePolicies(policyProperties, options),
      this.putUserPolicies(policyProperties, options),
    ]);

    return undefined;
  }

  private async putRolePolicies(
    policyProperties: SimCfnIamPolicyProperties,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await Promise.all(
      policyProperties.roleNames.map(async (roleName) =>
        this.iam.putRolePolicy(
          {
            input: {
              RoleName: roleName,
              PolicyName: policyProperties.policyName,
              PolicyDocument: policyProperties.policyDocument,
            },
          },
          options,
        ),
      ),
    );
  }

  private async putUserPolicies(
    policyProperties: SimCfnIamPolicyProperties,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await Promise.all(
      policyProperties.usernames.map(async (username) =>
        this.iam.putUserPolicy(
          {
            input: {
              UserName: username,
              PolicyName: policyProperties.policyName,
              PolicyDocument: policyProperties.policyDocument,
            },
          },
          options,
        ),
      ),
    );
  }
}
