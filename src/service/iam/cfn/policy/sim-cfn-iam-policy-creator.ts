import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIam } from "../../sim-iam.js";

interface SimCfnIamPolicyCreatorProperties {
  readonly iam: SimIam;
}

/**
 * Creates simulated IAM inline role policies from AWS::IAM::Policy
 * CloudFormation Resources.
 *
 * AWS::IAM::Policy is an inline policy put onto the referenced principals,
 * which is how CDK grants such as bucket.grantRead(fn) attach permissions to
 * a function's execution role (the "DefaultPolicy" resource). Only Roles are
 * simulated; the policy has no standalone stored resource, so creation
 * returns undefined and Ref resolution uses the default adapter.
 */
export class SimCfnIamPolicyCreator {
  private readonly iam: SimIam;

  constructor(properties: SimCfnIamPolicyCreatorProperties) {
    this.iam = properties.iam;
  }

  /**
   * Put the inline policy onto each referenced Role.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<undefined> {
    this.rejectUnsimulatedPrincipals(resource, properties);

    const policyName = this.policyName(resource, properties);
    const policyDocument = this.policyDocument(resource, properties);
    const roleNames = this.roleNames(resource, properties);

    await Promise.all(
      roleNames.map(async (roleName) =>
        this.iam.putRolePolicy({
          input: {
            RoleName: roleName,
            PolicyName: policyName,
            PolicyDocument: policyDocument,
          },
        }),
      ),
    );

    return undefined;
  }

  private policyName(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const policyName = properties["PolicyName"];

    if (typeof policyName !== "string") {
      throw new TypeError(
        `Invalid AWS::IAM::Policy ${resource.logicalId}: PolicyName must be a string`,
      );
    }

    return policyName;
  }

  private policyDocument(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const policyDocument = properties["PolicyDocument"];

    if (
      policyDocument === undefined ||
      typeof policyDocument !== "object" ||
      policyDocument === null ||
      Array.isArray(policyDocument)
    ) {
      throw new TypeError(
        `Invalid AWS::IAM::Policy ${resource.logicalId}: PolicyDocument must be an object`,
      );
    }

    return JSON.stringify(policyDocument);
  }

  /**
   * The Role names the policy attaches to. Role Refs are resolved to Role
   * names before creation, so entries arrive as plain strings.
   */
  private roleNames(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): readonly string[] {
    const roles = properties["Roles"];

    if (!Array.isArray(roles) || roles.length === 0) {
      throw new TypeError(
        `Invalid AWS::IAM::Policy ${resource.logicalId}: Roles must be a non-empty array`,
      );
    }

    return roles.map((roleName) => {
      if (typeof roleName !== "string") {
        throw new TypeError(
          `Invalid AWS::IAM::Policy ${resource.logicalId}: Roles entries must be strings`,
        );
      }
      return roleName;
    });
  }

  /**
   * IAM Users and Groups are not simulated as CloudFormation policy
   * principals, and silently dropping a grant would be misleading, so their
   * presence fails creation.
   */
  private rejectUnsimulatedPrincipals(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    for (const principalProperty of ["Users", "Groups"]) {
      // oxlint-disable-next-line security/detect-object-injection -- fixed property names.
      if (properties[principalProperty] !== undefined) {
        throw new TypeError(
          `Invalid AWS::IAM::Policy ${resource.logicalId}: ` +
            `${principalProperty} are not simulated`,
        );
      }
    }
  }
}
