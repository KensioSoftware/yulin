import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import type { SimOrganizationsNodeId } from "../tree/sim-organizations-node.js";
import { SimCfnOrganizationsPolicy } from "./sim-cfn-organizations-record.js";
import { SimCfnOrganizationsProperties } from "./sim-cfn-organizations-properties.js";

const SERVICE_CONTROL_POLICY = "SERVICE_CONTROL_POLICY";

/**
 * Attaches service control policies from `AWS::Organizations::Policy`
 * Resources to the nodes they target.
 *
 * A policy of any other type is refused as an unsupported Resource, so the
 * Stack records it and deploys on. Simulated Organizations evaluates service
 * control policies and nothing else, and a tag policy stored here would look
 * like one that does something.
 */
export class SimCfnOrganizationsPolicyCreator {
  readonly #simAws: SimAws;

  constructor(simAws: SimAws) {
    this.#simAws = simAws;
  }

  /**
   * Attach a policy to every node its `TargetIds` names.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnOrganizationsPolicy {
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

    const name = values.requiredString(properties["Name"], "Name");
    const document = values.documentValue(
      properties["Content"],
      "Content",
    ) as SimIamPolicyDocument;
    const targetIds = values.stringList(properties["TargetIds"]);

    for (const targetId of targetIds) {
      this.#simAws
        .organizations()
        .attachServiceControlPolicy(targetId, document, { policyName: name });
    }

    return new SimCfnOrganizationsPolicy(
      `p-${resource.logicalId.toLowerCase()}`,
      name,
      policyType,
      targetIds as readonly SimOrganizationsNodeId[],
    );
  }
}
