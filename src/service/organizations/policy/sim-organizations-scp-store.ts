import type { SimIamServiceControlPolicy } from "../../iam/authorize/scp/sim-iam-scp-resolver.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import type { SimOrganizationsNodeId } from "../tree/sim-organizations-node.js";

/**
 * The AWS-managed policy attached to every organization node by default.
 *
 * Turning service control policies on in an organization leaves every
 * account's permissions as they were, because this policy comes with them. A
 * simulated node gets the same treatment, so attaching one Deny statement
 * denies that one action and leaves the rest working.
 */
export const SIM_ORGANIZATIONS_FULL_AWS_ACCESS: SimIamServiceControlPolicy = {
  policyName: "FullAWSAccess",
  document: {
    Version: "2012-10-17",
    Statement: { Effect: "Allow", Action: "*", Resource: "*" },
  },
};

interface SimOrganizationsNodePolicies {
  readonly attached: SimIamServiceControlPolicy[];
  fullAwsAccess: boolean;
}

/**
 * The service control policies attached to each node of an organization.
 *
 * A node holds FullAWSAccess along with whatever was attached to it, until a
 * test detaches FullAWSAccess to write an allow list at that node. A node
 * nothing was attached to still holds FullAWSAccess, so an organizational unit
 * a test never mentions allows everything through it.
 */
export class SimOrganizationsScpStore {
  private readonly byNodeId = new Map<
    SimOrganizationsNodeId,
    SimOrganizationsNodePolicies
  >();

  /**
   * Attach a service control policy to a node.
   */
  attach(
    nodeId: SimOrganizationsNodeId,
    document: SimIamPolicyDocument,
    policyName?: string,
  ): void {
    this.nodePolicies(nodeId).attached.push({ document, policyName });
  }

  /**
   * Take the AWS-managed FullAWSAccess policy off a node.
   *
   * What remains at that node has to allow an action for a request through it
   * to go ahead, which is how a level is turned into an allow list.
   */
  detachFullAwsAccess(nodeId: SimOrganizationsNodeId): void {
    this.nodePolicies(nodeId).fullAwsAccess = false;
  }

  /**
   * Put a node back to holding FullAWSAccess and nothing else.
   */
  detachAll(nodeId: SimOrganizationsNodeId): void {
    this.byNodeId.delete(nodeId);
  }

  /**
   * The policies in force at one node, FullAWSAccess first.
   */
  policiesAt(
    nodeId: SimOrganizationsNodeId,
  ): readonly SimIamServiceControlPolicy[] {
    const node = this.byNodeId.get(nodeId);

    if (node === undefined) {
      return [SIM_ORGANIZATIONS_FULL_AWS_ACCESS];
    }

    return node.fullAwsAccess
      ? [SIM_ORGANIZATIONS_FULL_AWS_ACCESS, ...node.attached]
      : [...node.attached];
  }

  /**
   * Whether anything has been attached to or detached from a node.
   */
  holds(nodeId: SimOrganizationsNodeId): boolean {
    return this.byNodeId.has(nodeId);
  }

  /**
   * The record for a node, created on first use.
   */
  private nodePolicies(
    nodeId: SimOrganizationsNodeId,
  ): SimOrganizationsNodePolicies {
    const existing = this.byNodeId.get(nodeId);

    if (existing !== undefined) {
      return existing;
    }

    const created: SimOrganizationsNodePolicies = {
      attached: [],
      fullAwsAccess: true,
    };

    this.byNodeId.set(nodeId, created);

    return created;
  }
}
