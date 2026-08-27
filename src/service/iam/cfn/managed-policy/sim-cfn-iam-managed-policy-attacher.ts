import type { SimArn } from "../../../aws/arn.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIam } from "../../sim-iam.js";
import type { SimIamRoleName } from "../../role/sim-iam-role.js";
import { SimIamNoSuchEntity } from "../../error/sim-iam.error.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnIamManagedPolicyAttacherProperties {
  readonly iam: SimIam;
}

/**
 * Attaches a CloudFormation-created Managed Policy to the principals its
 * Resource names.
 *
 * `Roles` names the Roles the policy is attached to as it is created, which is
 * the attachment AttachRolePolicy records. `Users` and `Groups` name
 * principals with nowhere to hold a managed policy attachment here, and both
 * fail the Resource. Dropping the grant a template asked for without saying so
 * would be misleading.
 */
export class SimCfnIamManagedPolicyAttacher {
  private readonly iam: SimIam;

  constructor(properties: SimCfnIamManagedPolicyAttacherProperties) {
    this.iam = properties.iam;
  }

  /**
   * The Roles an AWS::IAM::ManagedPolicy Resource attaches itself to. Role
   * Refs are resolved to Role names before creation, so entries arrive as
   * plain strings.
   *
   * A name no simulated Role answers to fails the Resource before the policy
   * is created. Checking afterwards would leave a policy behind with nothing
   * attached to it.
   */
  roleNames(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): readonly SimIamRoleName[] {
    this.rejectUnsimulatedPrincipals(resource, properties);

    const roles = properties["Roles"];

    if (roles === undefined) {
      return [];
    }

    if (!Array.isArray(roles)) {
      throw new TypeError(
        `Invalid AWS::IAM::ManagedPolicy ${resource.logicalId}: Roles must be an array`,
      );
    }

    return roles.map((roleName) => this.roleName(resource, roleName));
  }

  /**
   * Attach the created Managed Policy to each of the Roles.
   */
  async attach(
    policyArn: SimArn,
    roleNames: readonly SimIamRoleName[],
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await Promise.all(
      roleNames.map(async (roleName) =>
        this.iam.attachRolePolicy(
          { input: { RoleName: roleName, PolicyArn: policyArn } },
          options,
        ),
      ),
    );
  }

  private roleName(
    resource: SimCfnResource,
    roleName: unknown,
  ): SimIamRoleName {
    if (typeof roleName !== "string") {
      throw new TypeError(
        `Invalid AWS::IAM::ManagedPolicy ${resource.logicalId}: Roles entries must be strings`,
      );
    }

    const simRoleName = roleName as SimIamRoleName;

    if (!this.iam.roles.has(simRoleName)) {
      throw new SimIamNoSuchEntity(`No IAM Role with name ${roleName}`);
    }

    return simRoleName;
  }

  private rejectUnsimulatedPrincipals(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): void {
    for (const principalProperty of ["Users", "Groups"]) {
      // oxlint-disable-next-line security/detect-object-injection -- fixed property names.
      if (properties[principalProperty] !== undefined) {
        throw new TypeError(
          `Invalid AWS::IAM::ManagedPolicy ${resource.logicalId}: ` +
            `${principalProperty} are not simulated`,
        );
      }
    }
  }
}
