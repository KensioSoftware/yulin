/* oxlint-disable security/detect-object-injection -- each lookup here reads a
   template property under the name this parser asks for by literal. */

import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnIamPrincipalGeneratedName } from "../name/sim-cfn-iam-generated-name.js";
import {
  simCfnIamJsonObject,
  simCfnIamOptionalString,
} from "../sim-cfn-iam-property.js";
import {
  SimCfnIamPoliciesParser,
  type SimCfnIamInlinePolicy,
} from "../sim-cfn-iam-policies-parser.js";

export interface SimCfnIamRoleProperties {
  readonly roleName: string;
  readonly path: string | undefined;
  readonly description: string | undefined;
  readonly assumeRolePolicyDocument: string;
  readonly permissionsBoundary: string | undefined;
  readonly inlinePolicies: readonly SimCfnIamInlinePolicy[];
  readonly managedPolicyArns: readonly string[];
}

const resourceType = "AWS::IAM::Role";

/**
 * Parses and validates AWS::IAM::Role CloudFormation properties into the shape
 * the sim IAM Role creator needs.
 *
 * Keeping the property-shape validation here keeps the creator focused on
 * orchestrating IAM command calls.
 */
export class SimCfnIamRolePropertiesParser {
  private readonly policiesParser = new SimCfnIamPoliciesParser({
    resourceType,
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
        this.optionalString(resource, properties, "RoleName") ??
        simCfnIamPrincipalGeneratedName(resource),
      path: this.optionalString(resource, properties, "Path"),
      description: this.optionalString(resource, properties, "Description"),
      assumeRolePolicyDocument: this.jsonObject(resource, properties),
      permissionsBoundary: this.optionalString(
        resource,
        properties,
        "PermissionsBoundary",
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
    properties: SimCfnTemplateValueRecord,
    label: string,
  ): string | undefined {
    return simCfnIamOptionalString({
      resourceType,
      resource,
      value: properties[label],
      label,
    });
  }

  private jsonObject(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const label = "AssumeRolePolicyDocument";

    return simCfnIamJsonObject({
      resourceType,
      resource,
      value: properties[label],
      label,
    });
  }
}
