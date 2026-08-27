import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type {
  SimIamServiceControlPolicyLevel,
  SimIamServiceControlPolicySet,
} from "../../iam/authorize/scp/sim-iam-scp-resolver.js";
import type { SimOrganizationsNodeId } from "../tree/sim-organizations-node.js";
import type { SimOrganizationsTree } from "../tree/sim-organizations-tree.js";
import type { SimOrganizationsScpStore } from "./sim-organizations-scp-store.js";

interface SimOrganizationsEffectivePoliciesProperties {
  readonly tree: SimOrganizationsTree;
  readonly scpStore: SimOrganizationsScpStore;
}

/**
 * Works out which service control policies an Account is actually subject to.
 *
 * The tree says which nodes lie above an Account and the store says what hangs
 * on each of them. Putting the two together is the whole of what sim IAM asks
 * an organization, so it lives here rather than in the facade.
 */
export class SimOrganizationsEffectivePolicies {
  private readonly tree: SimOrganizationsTree;
  private readonly scpStore: SimOrganizationsScpStore;

  private managementAccountId?: SimAwsAccountId | undefined;

  constructor(properties: SimOrganizationsEffectivePoliciesProperties) {
    this.tree = properties.tree;
    this.scpStore = properties.scpStore;
  }

  /**
   * Name the Account AWS exempts from every service control policy.
   */
  setManagementAccount(accountId: SimAwsAccountId): void {
    this.managementAccountId = accountId;
  }

  /**
   * The policies in force for an Account, level by level, root first.
   */
  setFor(accountId: SimAwsAccountId): SimIamServiceControlPolicySet {
    if (accountId === this.managementAccountId) {
      return { applies: false, levels: [] };
    }

    const path = this.pathFor(accountId);

    if (path.length === 0) {
      return { applies: false, levels: [] };
    }

    return { applies: true, levels: path.map((node) => this.levelAt(node)) };
  }

  /**
   * The nodes filtering an Account's requests.
   *
   * An Account placed in the organization is filtered by the path down to it.
   * An Account only ever named by having a policy attached to it is filtered
   * by that policy alone, which is what attaching to an Account meant before
   * the organization had a shape.
   */
  private pathFor(
    accountId: SimAwsAccountId,
  ): readonly SimOrganizationsNodeId[] {
    if (this.tree.holds(accountId)) {
      return this.tree.pathTo(accountId);
    }

    return this.scpStore.holds(accountId) ? [accountId] : [];
  }

  /**
   * What one node contributes to an Account's decision.
   */
  private levelAt(
    nodeId: SimOrganizationsNodeId,
  ): SimIamServiceControlPolicyLevel {
    return {
      nodeName: this.tree.nameOf(nodeId),
      policies: this.scpStore.policiesAt(nodeId),
    };
  }
}
