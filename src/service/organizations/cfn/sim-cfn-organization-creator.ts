import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCfnOrganization } from "./sim-cfn-organizations-record.js";
import { SimCfnOrganizationsProperties } from "./sim-cfn-organizations-properties.js";

/**
 * Records the organization an `AWS::Organizations::Organization` declares.
 *
 * A SimAws already has one organization, so this brings nothing into being.
 * The Resource earns its place by answering `RootId`, which is what the rest
 * of a template hangs off.
 */
export class SimCfnOrganizationCreator {
  readonly #simAws: SimAws;

  constructor(simAws: SimAws) {
    this.#simAws = simAws;
  }

  /**
   * Record the organization a template declares.
   */
  create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnOrganization {
    const values = new SimCfnOrganizationsProperties(
      resource,
      "AWS::Organizations::Organization",
    );
    const featureSet = properties["FeatureSet"];

    values.ignore(
      featureSet,
      "FeatureSet",
      "Simulated Organizations evaluates service control policies whatever " +
        "the feature set says",
    );

    return new SimCfnOrganization(
      this.#simAws.organizations().root().id,
      values.optionalString(featureSet) ?? "ALL",
      this.#simAws.defaultAccountId,
    );
  }
}
