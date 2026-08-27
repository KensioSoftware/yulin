import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnOrganizationsAccount } from "./sim-cfn-organizations-record.js";
import { SimCfnOrganizationsProperties } from "./sim-cfn-organizations-properties.js";

/**
 * Puts Accounts in the organization from `AWS::Organizations::Account`
 * Resources.
 *
 * AWS creates a new account here and gives it an id nobody chose, so this does
 * the same. A template reads that id back with `Ref` or with
 * `Fn::GetAtt AccountId`.
 */
export class SimCfnOrganizationsAccountCreator {
  readonly #simAws: SimAws;

  constructor(simAws: SimAws) {
    this.#simAws = simAws;
  }

  /**
   * Create an Account under the first node its `ParentIds` names.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnOrganizationsAccount {
    const values = new SimCfnOrganizationsProperties(
      resource,
      "AWS::Organizations::Account",
    );

    values.ignore(
      properties["Tags"],
      "Tags",
      "Simulated Organizations reads no Account tags",
    );
    values.ignore(
      properties["RoleName"],
      "RoleName",
      "Simulated Organizations creates no cross-account access Role",
    );

    const accountId = makeSimAwsAccountId();

    this.#simAws
      .organizations()
      .moveAccount(accountId, values.stringList(properties["ParentIds"])[0]);

    return new SimCfnOrganizationsAccount(
      accountId,
      values.requiredString(properties["AccountName"], "AccountName"),
      values.requiredString(properties["Email"], "Email"),
      this.#simAws.now(),
    );
  }
}
