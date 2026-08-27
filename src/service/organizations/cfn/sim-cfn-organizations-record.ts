import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type {
  SimOrganizationsNodeId,
  SimOrganizationsRootId,
} from "../tree/sim-organizations-node.js";

/**
 * What a template's `AWS::Organizations::Organization` produced.
 *
 * A simulated organization exists as soon as a SimAws does, so this records
 * the one already there rather than making another. What the Resource is for
 * is the values a template reads back off it, `RootId` above all, since that
 * is how an organizational unit says where it hangs.
 */
export class SimCfnOrganization {
  constructor(
    public readonly rootId: SimOrganizationsRootId,
    public readonly featureSet: string,
    public readonly managementAccountId: SimAwsAccountId,
  ) {}

  /**
   * AWS gives an organization an `o-` id of its own, apart from its root's.
   */
  get id(): string {
    return `o-${this.rootId.slice(2)}`;
  }
}

/**
 * What a template's `AWS::Organizations::Account` produced.
 */
export class SimCfnOrganizationsAccount {
  constructor(
    public readonly accountId: SimAwsAccountId,
    public readonly accountName: string,
    public readonly email: string,
    public readonly joinedTimestamp: Date,
  ) {}
}

/**
 * What a template's `AWS::Organizations::Policy` produced.
 */
export class SimCfnOrganizationsPolicy {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly policyType: string,
    public readonly targetIds: readonly SimOrganizationsNodeId[],
  ) {}
}
