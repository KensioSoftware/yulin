import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import { SimCfnOrganizationsProperties } from "./sim-cfn-organizations-properties.js";

const SERVICE_CONTROL_POLICY = "SERVICE_CONTROL_POLICY";

/**
 * What an `AWS::Organizations::Policy` Resource asks for.
 *
 * Every property is read here before the creator changes anything, so a
 * Resource that cannot be satisfied fails with the organization untouched.
 */
export class SimCfnOrganizationsPolicyInput {
  public readonly name: string;
  public readonly document: SimIamPolicyDocument;
  public readonly targetIds: readonly string[];

  constructor(resource: SimCfnResource, properties: SimCfnTemplateValueRecord) {
    const values = new SimCfnOrganizationsProperties(
      resource,
      "AWS::Organizations::Policy",
    );
    const policyType = values.requiredString(properties["Type"], "Type");

    if (policyType !== SERVICE_CONTROL_POLICY) {
      throw new Error(
        `Unsupported sim Organizations CloudFormation Resource Policy of ` +
          `type ${policyType}`,
      );
    }

    values.ignore(
      properties["Tags"],
      "Tags",
      "Simulated Organizations reads no policy tags",
    );
    values.ignore(
      properties["Description"],
      "Description",
      "A policy description decides nothing",
    );

    this.name = values.requiredString(properties["Name"], "Name");
    this.document = values.documentValue(properties["Content"], "Content");
    this.targetIds = values.stringList(properties["TargetIds"]);
  }

  /**
   * The policy type this Resource carries, which is the only one simulated
   * Organizations evaluates.
   */
  get policyType(): string {
    return SERVICE_CONTROL_POLICY;
  }
}
