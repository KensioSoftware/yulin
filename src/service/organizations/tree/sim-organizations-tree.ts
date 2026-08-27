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
    parent?: SimOrganizationsOrganizationalUnit,
  ): SimOrganizationsOrganizationalUnit {
    const parentId = parent === undefined ? this.root.id : parent.id;

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
    parent?: SimOrganizationsOrganizationalUnit,
  ): void {
    const parentId = parent === undefined ? this.root.id : parent.id;

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
   * Whether this Account is in the organization.
   */
  holds(accountId: SimAwsAccountId): boolean {
    return this.accountParents.has(accountId);
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
