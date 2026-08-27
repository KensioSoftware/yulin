import type {
  SimCfnOrganization,
  SimCfnOrganizationsAccount,
  SimCfnOrganizationsPolicy,
} from "../../../../organizations/cfn/sim-cfn-organizations-record.js";
import type { SimOrganizationsOrganizationalUnit } from "../../../../organizations/tree/sim-organizations-node.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

/**
 * Refuse an attribute the AWS Resource reference does not list.
 */
function unknownAttribute(resourceType: string, attributeName: string): never {
  throw new Error(
    `AWS::Organizations::${resourceType} has no attribute ${attributeName}`,
  );
}

/**
 * CloudFormation-facing values for a simulated organization.
 */
export class SimOrganizationCfn implements SimCfnResourceValueAdapter {
  constructor(private readonly organization: SimCfnOrganization) {}

  /**
   * AWS::Organizations::Organization Ref returns the organization id.
   */
  refValue(): SimCfnTemplateValue {
    return this.organization.id;
  }

  /**
   * The attributes the AWS Resource reference lists, less the management
   * account email, which a simulation has no address for.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    const { organization } = this;
    const values = new Map<string, SimCfnTemplateValue>([
      ["Id", organization.id],
      [
        "Arn",
        `arn:aws:organizations::${organization.managementAccountId}:organization/${organization.id}`,
      ],
      ["RootId", organization.rootId],
      ["ManagementAccountId", organization.managementAccountId],
      [
        "ManagementAccountArn",
        `arn:aws:organizations::${organization.managementAccountId}:account/${organization.id}/${organization.managementAccountId}`,
      ],
    ]);

    return (
      values.get(attributeName) ??
      unknownAttribute("Organization", attributeName)
    );
  }
}

/**
 * CloudFormation-facing values for a simulated organizational unit.
 */
export class SimOrganizationalUnitCfn implements SimCfnResourceValueAdapter {
  constructor(private readonly unit: SimOrganizationsOrganizationalUnit) {}

  /**
   * AWS::Organizations::OrganizationalUnit Ref returns the unit id.
   */
  refValue(): SimCfnTemplateValue {
    return this.unit.id;
  }

  /**
   * Id, Arn and Name, as the AWS Resource reference lists.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    const { unit } = this;
    const values = new Map<string, SimCfnTemplateValue>([
      ["Id", unit.id],
      ["Arn", `arn:aws:organizations::organizational-unit/${unit.id}`],
      ["Name", unit.name],
    ]);

    return (
      values.get(attributeName) ??
      unknownAttribute("OrganizationalUnit", attributeName)
    );
  }
}

/**
 * CloudFormation-facing values for an Account a template put in the
 * organization.
 */
export class SimOrganizationsAccountCfn implements SimCfnResourceValueAdapter {
  constructor(private readonly account: SimCfnOrganizationsAccount) {}

  /**
   * AWS::Organizations::Account Ref returns the Account id.
   */
  refValue(): SimCfnTemplateValue {
    return this.account.accountId;
  }

  /**
   * The attributes the AWS Resource reference lists.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    const { account } = this;
    const values = new Map<string, SimCfnTemplateValue>([
      ["AccountId", account.accountId],
      [
        "Arn",
        `arn:aws:organizations::${account.accountId}:account/${account.accountId}`,
      ],
      ["Email", account.email],
      ["AccountName", account.accountName],
      ["JoinedMethod", "CREATED"],
      ["JoinedTimestamp", account.joinedTimestamp.toISOString()],
      ["Status", "ACTIVE"],
    ]);

    return (
      values.get(attributeName) ?? unknownAttribute("Account", attributeName)
    );
  }
}

/**
 * CloudFormation-facing values for a simulated service control policy.
 */
export class SimOrganizationsPolicyCfn implements SimCfnResourceValueAdapter {
  constructor(private readonly policy: SimCfnOrganizationsPolicy) {}

  /**
   * AWS::Organizations::Policy Ref returns the policy id.
   */
  refValue(): SimCfnTemplateValue {
    return this.policy.id;
  }

  /**
   * Id, Arn and AwsManaged, as the AWS Resource reference lists.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    const { policy } = this;
    const values = new Map<string, SimCfnTemplateValue>([
      ["Id", policy.id],
      [
        "Arn",
        `arn:aws:organizations::policy/service_control_policy/${policy.id}`,
      ],
      ["AwsManaged", false],
    ]);

    return (
      values.get(attributeName) ?? unknownAttribute("Policy", attributeName)
    );
  }
}
