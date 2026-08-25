import type { SimAthenaWorkGroup } from "../../../../athena/workgroup/sim-athena-work-group.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimAthenaWorkGroupCfnProperties {
  readonly workGroup: SimAthenaWorkGroup;
}

/**
 * CloudFormation-facing values for a simulated Athena workgroup.
 */
export class SimAthenaWorkGroupCfn implements SimCfnResourceValueAdapter {
  private readonly workGroup: SimAthenaWorkGroup;

  constructor(properties: SimAthenaWorkGroupCfnProperties) {
    this.workGroup = properties.workGroup;
  }

  /**
   * AWS::Athena::WorkGroup Ref returns the workgroup name.
   */
  refValue(): SimCfnTemplateValue {
    return this.workGroup.name;
  }

  /**
   * AWS::Athena::WorkGroup attributes.
   *
   * `CreationTime` is the only one the resource has, and CloudFormation
   * reports it as a string.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "CreationTime") {
      return this.workGroup.createdAt.toISOString();
    }

    throw new Error(
      `Unsupported AWS::Athena::WorkGroup attribute ${attributeName}`,
    );
  }
}
