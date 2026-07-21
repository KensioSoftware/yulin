import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  SimCfnIamRolePoliciesParser,
  type SimCfnIamRoleInlinePolicy,
} from "./sim-cfn-iam-role-policies-parser.js";

export interface SimCfnIamRoleProps {
  readonly roleName: string;
  readonly path: string | undefined;
  readonly description: string | undefined;
  readonly assumeRolePolicyDocument: string;
  readonly inlinePolicies: readonly SimCfnIamRoleInlinePolicy[];
  readonly managedPolicyArns: readonly string[];
}

/**
 * Parses and validates AWS::IAM::Role CloudFormation properties into the shape
 * the sim IAM Role creator needs.
 *
 * Keeping the property-shape validation here keeps the creator focused on
 * orchestrating IAM command calls.
 */
export class SimCfnIamRolePropsParser {
  private readonly policiesParser = new SimCfnIamRolePoliciesParser();

  /**
   * Parse the resolved CloudFormation properties for an AWS::IAM::Role.
   */
  parse(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnIamRoleProps {
    return {
      roleName:
        this.optionalString(resource, properties["RoleName"], "RoleName") ??
        resource.logicalId,
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
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw new TypeError(
        `Invalid AWS::IAM::Role ${resource.logicalId}: ${label} must be a string`,
      );
    }

    return value;
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
