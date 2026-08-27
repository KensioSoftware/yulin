import {
  makeSimOrganizationsOrganizationalUnitId,
  makeSimOrganizationsRootId,
  SimOrganizationsOrganizationalUnit,
  type SimOrganizationsNodeId,
  SimOrganizationsRoot,
} from "./sim-organizations-node.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";

/**
 * Thrown for an organizational unit this organization has never seen.
 */
export class SimOrganizationsUnknownNode extends Error {
  constructor(nodeId: string) {
    super(`Unknown simulated Organizations node "${nodeId}"`);
    this.name = "SimOrganizationsUnknownNode";
  }
}

/**
 * Where the Accounts and organizational units of one simulated organization
 * sit relative to each other.
 *
 * The tree answers one question for authorization: which nodes lie on the path
 * from the root down to an Account. Every policy on that path applies to the
 * Account, which is what makes an organizational unit worth modelling at all.
 *
 * An Account joins the organization the moment it is named, whether by being
 * moved into a unit or by having a policy attached to it. An Account never
 * named sits outside the organization and is unrestricted.
 */
export class SimOrganizationsTree {
  public readonly root = new SimOrganizationsRoot(makeSimOrganizationsRootId());

  private readonly organizationalUnits = new Map<
    SimOrganizationsNodeId,
    SimOrganizationsOrganizationalUnit
  >();

  private readonly accountParents = new Map<
    SimAwsAccountId,
    SimOrganizationsNodeId
  >();

  /**
   * Create an organizational unit, under the root unless another unit is
   * named as its parent.
   */
  createOrganizationalUnit(
    name: string,
    parentId: SimOrganizationsNodeId = this.root.id,
  ): SimOrganizationsOrganizationalUnit {
    this.requireKnown(parentId);

    const unit = new SimOrganizationsOrganizationalUnit(
      makeSimOrganizationsOrganizationalUnitId(this.root.id),
      name,
      parentId,
    );

    this.organizationalUnits.set(unit.id, unit);

    return unit;
  }

  /**
   * Place an Account under a node, joining the organization if it was outside
   * it.
   */
  placeAccount(
    accountId: SimAwsAccountId,
    parentId: SimOrganizationsNodeId = this.root.id,
  ): void {
    this.requireKnown(parentId);

    this.accountParents.set(accountId, parentId);
  }

  /**
   * Take an Account out of the organization.
   */
  removeAccount(accountId: SimAwsAccountId): void {
    this.accountParents.delete(accountId);
  }

  /**
   * Take an organizational unit out of the organization.
   *
   * Whatever still sits under it moves up to its parent, which is the only
   * answer that leaves every Account on a path back to the root. AWS refuses
   * to delete a unit that still holds anything, and a Stack tears down in
   * reverse dependency order, so nothing should still be there.
   */
  removeOrganizationalUnit(unitId: SimOrganizationsNodeId): void {
    const unit = this.organizationalUnits.get(unitId);

    if (unit === undefined) {
      return;
    }

    this.organizationalUnits.delete(unitId);
    this.reparent(unitId, unit.parentId);
  }

  /**
   * Every Account in the organization.
   */
  accountIds(): readonly SimAwsAccountId[] {
    return this.accountParents.keys().toArray();
  }

  /**
   * Whether this Account is in the organization.
   */
  holds(accountId: SimAwsAccountId): boolean {
    return this.accountParents.has(accountId);
  }

  /**
   * Refuse a root or organizational unit this organization never created.
   *
   * A handle from another simulated organization would otherwise be attached
   * to and then never read, because no Account here has it on its path. A
   * policy that silently applies to nothing is worse than a refusal.
   */
  requireNode(nodeId: SimOrganizationsNodeId): void {
    this.requireKnown(nodeId);
  }

  /**
   * Whether this organization has a root or unit under an id.
   */
  hasNode(nodeId: SimOrganizationsNodeId): boolean {
    return nodeId === this.root.id || this.organizationalUnits.has(nodeId);
  }

  /**
   * The nodes a request against an Account is filtered by, root first.
   *
   * The Account itself is the last of them, because a policy attached to an
   * Account applies alongside the ones it inherits.
   */
  pathTo(accountId: SimAwsAccountId): readonly SimOrganizationsNodeId[] {
    const parentId = this.accountParents.get(accountId);

    if (parentId === undefined) {
      return [];
    }

    return [...this.ancestors(parentId), accountId];
  }

  /**
   * What to call a node in a denial.
   */
  nameOf(nodeId: SimOrganizationsNodeId): string {
    if (nodeId === this.root.id) {
      return this.root.name;
    }

    return this.organizationalUnits.get(nodeId)?.name ?? String(nodeId);
  }

  /**
   * Move everything under one node up to another.
   */
  private reparent(
    fromId: SimOrganizationsNodeId,
    toId: SimOrganizationsNodeId,
  ): void {
    for (const [accountId, parentId] of this.accountParents) {
      if (parentId === fromId) {
        this.accountParents.set(accountId, toId);
      }
    }

    const orphaned = this.organizationalUnits
      .values()
      .filter((unit) => unit.parentId === fromId)
      .toArray();

    for (const unit of orphaned) {
      this.organizationalUnits.set(
        unit.id,
        new SimOrganizationsOrganizationalUnit(unit.id, unit.name, toId),
      );
    }
  }

  /**
   * The nodes from the root down to one node, root first.
   */
  private ancestors(
    nodeId: SimOrganizationsNodeId,
  ): readonly SimOrganizationsNodeId[] {
    const path: SimOrganizationsNodeId[] = [];

    let currentId: SimOrganizationsNodeId | undefined = nodeId;

    while (currentId !== undefined && currentId !== this.root.id) {
      path.unshift(currentId);
      currentId = this.organizationalUnits.get(currentId)?.parentId;
    }

    return [this.root.id, ...path];
  }

  /**
   * Refuse a node this organization never created.
   */
  private requireKnown(nodeId: SimOrganizationsNodeId): void {
    if (nodeId !== this.root.id && !this.organizationalUnits.has(nodeId)) {
      throw new SimOrganizationsUnknownNode(nodeId);
    }
  }
}
