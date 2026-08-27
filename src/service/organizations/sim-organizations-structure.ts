import { simAwsAccountId } from "../aws/sim-aws-account.js";
import { SimOrganizationsEffectivePolicies } from "./policy/sim-organizations-effective-policies.js";
import { SimOrganizationsScpStore } from "./policy/sim-organizations-scp-store.js";
import {
  isSimOrganizationsUnitId,
  type SimOrganizationsNodeId,
  type SimOrganizationsOrganizationalUnit,
  type SimOrganizationsRoot,
  type SimOrganizationsTarget,
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
    parent?: SimOrganizationsTarget,
  ): SimOrganizationsOrganizationalUnit {
    return this.tree.createOrganizationalUnit(name, this.parentIdOf(parent));
  }

  /**
   * Put an Account in the organization, under an organizational unit or under
   * the root.
   */
  moveAccount(accountId: string, parent?: SimOrganizationsTarget): void {
    this.tree.placeAccount(simAwsAccountId(accountId), this.parentIdOf(parent));
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
   * Every Account this organization holds.
   *
   * A test tracking down where a denial came from reads this to see which
   * Accounts the organization is filtering at all.
   */
  accountIds(): readonly string[] {
    return this.tree.accountIds();
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
   * Take an organizational unit out of the organization.
   *
   * Anything still under it moves up to its parent, so every Account keeps a
   * path back to the root.
   */
  removeOrganizationalUnit(target: SimOrganizationsTarget): void {
    const nodeId = this.knownNodeIdOf(target);

    if (nodeId !== undefined) {
      this.tree.removeOrganizationalUnit(nodeId);
    }
  }

  /**
   * The node a target names.
   *
   * An Account is named by its twelve-digit id and needs no place in the
   * organization yet, because attaching a policy to one is what puts it there.
   * A root or organizational unit, whether given as a handle or as the `r-` or
   * `ou-` id a template carries, has to be this organization's own. One from
   * another organization is refused rather than attached to and never read.
   */
  protected nodeIdOf(target: SimOrganizationsTarget): SimOrganizationsNodeId {
    if (typeof target !== "string") {
      this.tree.requireNode(target.id);

      return target.id;
    }

    if (!isSimOrganizationsUnitId(target)) {
      return simAwsAccountId(target);
    }

    const nodeId = target as SimOrganizationsNodeId;

    this.tree.requireNode(nodeId);

    return nodeId;
  }

  /**
   * Refuse the whole set unless every target names a node this organization
   * has.
   *
   * Attaching one policy to several nodes is one act, so it either reaches all
   * of them or none. Failing partway would leave a policy attached where
   * nothing knows to take it off.
   */
  requireTargets(targets: readonly SimOrganizationsTarget[]): void {
    for (const target of targets) {
      this.nodeIdOf(target);
    }
  }

  /**
   * The node a target names, or nothing where this organization has no such
   * node.
   *
   * Taking something off a node that has already gone is what a Stack teardown
   * asks for when a unit came down before the policy pointing at it. There is
   * nothing to take off, and refusing would fail a teardown over work already
   * done.
   */
  protected knownNodeIdOf(
    target: SimOrganizationsTarget,
  ): SimOrganizationsNodeId | undefined {
    if (typeof target === "string" && !isSimOrganizationsUnitId(target)) {
      return simAwsAccountId(target);
    }

    const nodeId = (
      typeof target === "string" ? target : target.id
    ) as SimOrganizationsNodeId;

    return this.tree.hasNode(nodeId) ? nodeId : undefined;
  }

  /**
   * The node something sits under, defaulting to the root.
   */
  private parentIdOf(
    parent: SimOrganizationsTarget | undefined,
  ): SimOrganizationsNodeId | undefined {
    return parent === undefined ? undefined : this.nodeIdOf(parent);
  }
}
