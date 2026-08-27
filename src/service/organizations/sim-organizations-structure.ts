import { simAwsAccountId } from "../aws/sim-aws-account.js";
import { SimOrganizationsEffectivePolicies } from "./policy/sim-organizations-effective-policies.js";
import { SimOrganizationsScpStore } from "./policy/sim-organizations-scp-store.js";
import type {
  SimOrganizationsNodeId,
  SimOrganizationsOrganizationalUnit,
  SimOrganizationsRoot,
  SimOrganizationsTarget,
} from "./tree/sim-organizations-node.js";
import { SimOrganizationsTree } from "./tree/sim-organizations-tree.js";

/**
 * The shape of one simulated organization: its root, the organizational units
 * under it, and where its Accounts sit.
 *
 * SimOrganizations is the facade a test reaches through, and this is the half
 * of it concerned with structure. The policies that hang on that structure are
 * the other half.
 */
export abstract class SimOrganizationsStructure {
  protected readonly scpStore = new SimOrganizationsScpStore();
  protected readonly tree = new SimOrganizationsTree();
  protected readonly effectivePolicies = new SimOrganizationsEffectivePolicies({
    tree: this.tree,
    scpStore: this.scpStore,
  });

  /**
   * The root of this organization, which every Account sits under.
   */
  root(): SimOrganizationsRoot {
    return this.tree.root;
  }

  /**
   * Create an organizational unit, under the root unless a parent unit is
   * given.
   */
  createOrganizationalUnit(
    name: string,
    parent?: SimOrganizationsOrganizationalUnit,
  ): SimOrganizationsOrganizationalUnit {
    return this.tree.createOrganizationalUnit(name, parent);
  }

  /**
   * Put an Account in the organization, under an organizational unit or under
   * the root.
   */
  moveAccount(
    accountId: string,
    parent?: SimOrganizationsOrganizationalUnit,
  ): void {
    this.tree.placeAccount(simAwsAccountId(accountId), parent);
  }

  /**
   * Name the Account that pays the organization's bills.
   *
   * AWS exempts the management account from every service control policy, and
   * so does this. An Account named here is decided by its identity and
   * resource policies alone, whatever is attached above it.
   */
  setManagementAccount(accountId: string): void {
    const account = simAwsAccountId(accountId);

    this.effectivePolicies.setManagementAccount(account);
    this.tree.placeAccount(account);
  }

  /**
   * Take an Account out of the organization.
   *
   * Nothing then filters its requests, whatever is attached above where it
   * sat. This is how an Account leaves an organization, and it is a different
   * thing from taking the policies off it.
   */
  removeAccount(accountId: string): void {
    this.tree.removeAccount(simAwsAccountId(accountId));
  }

  /**
   * The node a target names.
   *
   * An Account is named by its id and needs no place in the organization yet,
   * because attaching a policy to one is what puts it there. A root or
   * organizational unit has to be this organization's own, so a handle from
   * another one is refused rather than attached to and never read.
   */
  protected nodeIdOf(target: SimOrganizationsTarget): SimOrganizationsNodeId {
    if (typeof target === "string") {
      return simAwsAccountId(target);
    }

    this.tree.requireNode(target.id);

    return target.id;
  }
}
