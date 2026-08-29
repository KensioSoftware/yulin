import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnIamPrincipalGeneratedName } from "../name/sim-cfn-iam-generated-name.js";
import { simCfnIamOptionalString } from "../sim-cfn-iam-optional-string.js";
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
    this.rejectGroups(resource, properties);

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
    };
  }

  /**
   * Group membership is not simulated, and silently dropping it would be
   * misleading, so naming a Group fails the Resource. CDK leaves `Groups` out
   * of the template altogether for a User in no group, so an empty list still
   * deploys.
   */
  private rejectGroups(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    const groups = properties["Groups"];

    if (groups === undefined) {
      return;
    }

    if (!Array.isArray(groups)) {
      throw new TypeError(
        `Invalid ${resourceType} ${resource.logicalId}: Groups must be an array`,
      );
    }

    if (groups.length > 0) {
      throw new TypeError(
        `Invalid ${resourceType} ${resource.logicalId}: Groups are not simulated`,
      );
    }
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
