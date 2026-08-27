import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimOrganizationsOrganizationalUnit } from "../tree/sim-organizations-node.js";
import { SimCfnOrganizationsProperties } from "./sim-cfn-organizations-properties.js";

/**
 * Creates organizational units from
 * `AWS::Organizations::OrganizationalUnit` Resources.
 */
export class SimCfnOrganizationalUnitCreator {
  readonly #simAws: SimAws;

  constructor(simAws: SimAws) {
    this.#simAws = simAws;
  }

  /**
   * Create a unit under the node its `ParentId` names.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimOrganizationsOrganizationalUnit {
    const values = new SimCfnOrganizationsProperties(
      resource,
      "AWS::Organizations::OrganizationalUnit",
    );

    values.ignore(
      properties["Tags"],
      "Tags",
      "Simulated Organizations reads no unit tags",
    );

    return this.#simAws
      .organizations()
      .createOrganizationalUnit(
        values.requiredString(properties["Name"], "Name"),
        values.requiredString(properties["ParentId"], "ParentId"),
      );
  }
}
