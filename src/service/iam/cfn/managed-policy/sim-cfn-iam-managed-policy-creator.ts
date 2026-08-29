import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIam } from "../../sim-iam.js";
import type { SimIamManagedPolicy } from "../../policy/sim-iam-policy.js";
import { SimCfnIamManagedPolicyAttacher } from "./sim-cfn-iam-managed-policy-attacher.js";
import { simCfnIamPolicyGeneratedName } from "../name/sim-cfn-iam-generated-name.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnIamManagedPolicyCreatorProperties {
  readonly iam: SimIam;
}

/**
 * Creates simulated IAM Managed Policies from CloudFormation Resources.
 */
export class SimCfnIamManagedPolicyCreator {
  private readonly iam: SimIam;
  private readonly attacher: SimCfnIamManagedPolicyAttacher;

  constructor(properties: SimCfnIamManagedPolicyCreatorProperties) {
    this.iam = properties.iam;
    this.attacher = new SimCfnIamManagedPolicyAttacher({ iam: properties.iam });
  }

  /**
   * Create a simulated Managed Policy from an AWS::IAM::ManagedPolicy Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimIamManagedPolicy> {
    const roleNames = this.attacher.roleNames(resource, properties);
    const policyName = this.managedPolicyName(resource, properties);
    const path = this.path(resource, properties);
    const description = this.description(resource, properties);
    const policyDocument = this.policyDocument(resource, properties);

    const policyCreation = await this.iam.createPolicy(
      {
        input: {
          PolicyName: policyName,
          Path: path,
          Description: description,
          PolicyDocument: policyDocument,
        },
      },
      options,
    );

    const policy = this.iam.policies.get(policyCreation.Policy.Arn);
    assertDefined(
      policy,
      `Sim IAM Managed Policy ${policyCreation.Policy.Arn} after CloudFormation creation`,
    );

    await this.attacher.attach(policy.arn, roleNames, options);

    return policy;
  }

  private managedPolicyName(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const managedPolicyName = properties["ManagedPolicyName"];

    if (managedPolicyName === undefined) {
      return simCfnIamPolicyGeneratedName(resource);
    }

    if (typeof managedPolicyName !== "string") {
      throw new TypeError(
        `Invalid AWS::IAM::ManagedPolicy ${resource.logicalId}: ManagedPolicyName must be a string`,
      );
    }

    return managedPolicyName;
  }

  private path(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string | undefined {
    const path = properties["Path"];

    if (path === undefined) {
      return undefined;
    }

    if (typeof path !== "string") {
      throw new TypeError(
        `Invalid AWS::IAM::ManagedPolicy ${resource.logicalId}: Path must be a string`,
      );
    }

    return path;
  }

  private description(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string | undefined {
    const description = properties["Description"];

    if (description === undefined) {
      return undefined;
    }

    if (typeof description !== "string") {
      throw new TypeError(
        `Invalid AWS::IAM::ManagedPolicy ${resource.logicalId}: Description must be a string`,
      );
    }

    return description;
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
        `Invalid AWS::IAM::ManagedPolicy ${resource.logicalId}: PolicyDocument must be an object`,
      );
    }

    return JSON.stringify(policyDocument);
  }
}
