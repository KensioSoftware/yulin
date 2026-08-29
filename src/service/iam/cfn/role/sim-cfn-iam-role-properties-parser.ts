import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnIamPrincipalGeneratedName } from "../name/sim-cfn-iam-generated-name.js";
import { simCfnIamOptionalString } from "../sim-cfn-iam-optional-string.js";
import {
  SimCfnIamPoliciesParser,
  type SimCfnIamInlinePolicy,
} from "../sim-cfn-iam-policies-parser.js";

export interface SimCfnIamRoleProperties {
  readonly roleName: string;
  readonly path: string | undefined;
  readonly description: string | undefined;
  readonly assumeRolePolicyDocument: string;
  readonly inlinePolicies: readonly SimCfnIamInlinePolicy[];
  readonly managedPolicyArns: readonly string[];
}

/**
 * Parses and validates AWS::IAM::Role CloudFormation properties into the shape
 * the sim IAM Role creator needs.
 *
 * Keeping the property-shape validation here keeps the creator focused on
 * orchestrating IAM command calls.
 */
export class SimCfnIamRolePropertiesParser {
  private readonly policiesParser = new SimCfnIamPoliciesParser({
    resourceType: "AWS::IAM::Role",
  });

  /**
   * Parse the resolved CloudFormation properties for an AWS::IAM::Role.
   */
  parse(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnIamRoleProperties {
    return {
      roleName:
        this.optionalString(resource, properties["RoleName"], "RoleName") ??
        simCfnIamPrincipalGeneratedName(resource),
      path: this.optionalString(resource, properties["Path"], "Path"),
      description: this.optionalString(
        resource,
        properties["Description"],
        "Description",
      ),
      assumeRolePolicyDocument: this.jsonObject(
        resource,
        properties["AssumeRolePolicyDocument"],
        "AssumeRolePolicyDocument",
      ),
      inlinePolicies: this.policiesParser.inlinePolicies(resource, properties),
      managedPolicyArns: this.policiesParser.managedPolicyArns(
        resource,
        properties,
      ),
    };
  }

  private optionalString(
    resource: SimCfnResource,
    value: SimCfnTemplateValueRecord[string] | undefined,
    label: string,
  ): string | undefined {
    return simCfnIamOptionalString({
      resourceType: "AWS::IAM::Role",
      resource,
      value,
      label,
    });
  }

  private jsonObject(
    resource: SimCfnResource,
    value: SimCfnTemplateValueRecord[string] | undefined,
    label: string,
  ): string {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError(
        `Invalid AWS::IAM::Role ${resource.logicalId}: ${label} must be an object`,
      );
    }

    return JSON.stringify(value);
  }
}
