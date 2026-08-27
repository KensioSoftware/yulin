import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  makeSimOrganizationsPolicyId,
  type SimOrganizationsNodeId,
} from "../tree/sim-organizations-node.js";
import { SimCfnOrganizationsPolicy } from "./sim-cfn-organizations-record.js";
import { SimCfnOrganizationsPolicyInput } from "./sim-cfn-organizations-policy-input.js";

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
    const input = new SimCfnOrganizationsPolicyInput(resource, properties);
    const organizations = this.#simAws.organizations();

    // Every target is resolved before any of them is attached to. Refusing one
    // partway through would leave the earlier targets holding a policy no
    // teardown knows about.
    organizations.requireTargets(input.targetIds);

    // An id of its own, rather than one derived from the logical id. Two
    // Stacks can each declare a Policy called the same thing, and a shared id
    // would let one Stack's teardown take the other's policy off.
    const policyId = makeSimOrganizationsPolicyId();

    for (const targetId of input.targetIds) {
      organizations.attachServiceControlPolicy(targetId, input.document, {
        policyName: input.name,
        policyId,
      });
    }

    return new SimCfnOrganizationsPolicy(
      policyId,
      input.name,
      input.policyType,
      input.targetIds as readonly SimOrganizationsNodeId[],
    );
  }
}
