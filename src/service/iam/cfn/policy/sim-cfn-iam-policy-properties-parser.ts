import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

export interface SimCfnIamPolicyProperties {
  readonly policyName: string;
  readonly policyDocument: string;
  readonly roleNames: readonly string[];
  readonly usernames: readonly string[];
}

type SimCfnIamPolicyPrincipalProperty = "Roles" | "Users";

const resourceType = "AWS::IAM::Policy";

/**
 * Parses and validates AWS::IAM::Policy CloudFormation properties into the
 * shape the sim IAM inline policy creator needs.
 *
 * Keeping the property-shape validation here keeps the creator focused on
 * orchestrating IAM command calls.
 */
export class SimCfnIamPolicyPropertiesParser {
  /**
   * Parse the resolved CloudFormation properties for an AWS::IAM::Policy.
   */
  parse(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnIamPolicyProperties {
    this.rejectGroups(resource, properties);

    const roleNames = this.principalNames(resource, properties, "Roles");
    const usernames = this.principalNames(resource, properties, "Users");

    if (roleNames.length === 0 && usernames.length === 0) {
      throw this.invalid(
        resource,
        "Roles or Users must name at least one principal",
      );
    }

    return {
      policyName: this.policyName(resource, properties),
      policyDocument: this.policyDocument(resource, properties),
      roleNames,
      usernames,
    };
  }

  private policyName(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const policyName = properties["PolicyName"];

    if (typeof policyName !== "string") {
      throw this.invalid(resource, "PolicyName must be a string");
    }

    return policyName;
  }

  private policyDocument(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const policyDocument = properties["PolicyDocument"];

    if (
      typeof policyDocument !== "object" ||
      policyDocument === null ||
      Array.isArray(policyDocument)
    ) {
      throw this.invalid(resource, "PolicyDocument must be an object");
    }

    return JSON.stringify(policyDocument);
  }

  /**
   * The principal names one property attaches the policy to. Role and User
   * Refs are resolved to names before creation, so entries arrive as plain
   * strings. An absent property is not an error on its own, because a policy
   * naming only the other kind of principal is the usual CDK shape.
   */
  private principalNames(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    property: SimCfnIamPolicyPrincipalProperty,
  ): readonly string[] {
    // oxlint-disable-next-line security/detect-object-injection -- fixed property names.
    const principals = properties[property];

    if (principals === undefined) {
      return [];
    }

    if (!Array.isArray(principals)) {
      throw this.invalid(resource, `${property} must be an array`);
    }

    return principals.map((name) => {
      if (typeof name !== "string") {
        throw this.invalid(resource, `${property} entries must be strings`);
      }
      return name;
    });
  }

  /**
   * IAM Groups are not simulated as CloudFormation policy principals, and
   * silently dropping a grant would be misleading, so their presence fails
   * creation.
   */
  private rejectGroups(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    if (properties["Groups"] !== undefined) {
      throw this.invalid(resource, "Groups are not simulated");
    }
  }

  private invalid(resource: SimCfnResource, reason: string): TypeError {
    return new TypeError(
      `Invalid ${resourceType} ${resource.logicalId}: ${reason}`,
    );
  }
}
