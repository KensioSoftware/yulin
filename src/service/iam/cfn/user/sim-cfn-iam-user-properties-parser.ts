import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnIamPrincipalGeneratedName } from "../name/sim-cfn-iam-generated-name.js";
import {
  simCfnIamNameList,
  simCfnIamOptionalString,
} from "../sim-cfn-iam-property.js";
import {
  SimCfnIamPoliciesParser,
  type SimCfnIamInlinePolicy,
} from "../sim-cfn-iam-policies-parser.js";

export interface SimCfnIamUserLoginProfile {
  readonly password: string;
  readonly passwordResetRequired: boolean;
}

export interface SimCfnIamUserProperties {
  readonly userName: string;
  readonly path: string | undefined;
  readonly inlinePolicies: readonly SimCfnIamInlinePolicy[];
  readonly managedPolicyArns: readonly string[];
  readonly loginProfile: SimCfnIamUserLoginProfile | undefined;

  /**
   * The groups the User joins as it is created.
   */
  readonly groups: readonly string[];
}

const resourceType = "AWS::IAM::User";

/**
 * Parses and validates AWS::IAM::User CloudFormation properties into the shape
 * the sim IAM User creator needs.
 *
 * Keeping the property-shape validation here keeps the creator focused on
 * orchestrating IAM command calls.
 */
export class SimCfnIamUserPropertiesParser {
  private readonly policiesParser = new SimCfnIamPoliciesParser({
    resourceType,
  });

  /**
   * Parse the resolved CloudFormation properties for an AWS::IAM::User.
   */
  parse(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnIamUserProperties {
    return {
      userName:
        this.optionalString(resource, properties["UserName"], "UserName") ??
        simCfnIamPrincipalGeneratedName(resource),
      path: this.optionalString(resource, properties["Path"], "Path"),
      inlinePolicies: this.policiesParser.inlinePolicies(resource, properties),
      managedPolicyArns: this.policiesParser.managedPolicyArns(
        resource,
        properties,
      ),
      loginProfile: this.loginProfile(resource, properties),
      groups: simCfnIamNameList({
        resourceType,
        resource,
        value: properties["Groups"],
        label: "Groups",
      }),
    };
  }

  private loginProfile(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnIamUserLoginProfile | undefined {
    const loginProfile = properties["LoginProfile"];

    if (loginProfile === undefined) {
      return undefined;
    }

    if (
      typeof loginProfile !== "object" ||
      loginProfile === null ||
      Array.isArray(loginProfile)
    ) {
      throw new TypeError(
        `Invalid ${resourceType} ${resource.logicalId}: LoginProfile must be an object`,
      );
    }

    const password = loginProfile["Password"];

    if (typeof password !== "string") {
      throw new TypeError(
        `Invalid ${resourceType} ${resource.logicalId}: LoginProfile Password must be a string`,
      );
    }

    const passwordResetRequired = loginProfile["PasswordResetRequired"];

    if (
      passwordResetRequired !== undefined &&
      typeof passwordResetRequired !== "boolean"
    ) {
      throw new TypeError(
        `Invalid ${resourceType} ${resource.logicalId}: LoginProfile PasswordResetRequired must be a boolean`,
      );
    }

    return {
      password,
      passwordResetRequired: passwordResetRequired ?? false,
    };
  }

  private optionalString(
    resource: SimCfnResource,
    value: SimCfnTemplateValueRecord[string] | undefined,
    label: string,
  ): string | undefined {
    return simCfnIamOptionalString({ resourceType, resource, value, label });
  }
}
