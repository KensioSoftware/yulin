import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";
import type { SimCloudFormationStackName } from "../sim-cfn-stack.type.js";
import type { SimCfnStackOutput } from "./sim-cfn-stack-output.js";

interface SimCfnStackOutputLookupProperties {
  readonly stackName: SimCloudFormationStackName;
  readonly outputs: ReadonlyMap<string, SimCfnStackOutput>;
}

/**
 * Reads one Stack Output as the string CloudFormation answers with.
 *
 * DescribeStacks types an OutputValue as a string, and a template's Output
 * Value is a string field. A resolved Output holding anything else came from a
 * template CloudFormation would itself refuse, and both that and an Output the
 * template never declared are reported here. The Stack then answers one string
 * per Output, and each caller is spared writing the same narrowing and the same
 * failure message for itself.
 */
export class SimCfnStackOutputLookup {
  private readonly stackName: SimCloudFormationStackName;
  private readonly outputs: ReadonlyMap<string, SimCfnStackOutput>;

  constructor(properties: SimCfnStackOutputLookupProperties) {
    this.stackName = properties.stackName;
    this.outputs = properties.outputs;
  }

  /**
   * The string this Output resolved to.
   *
   * Throws where the template declares no such Output, and where the Output
   * resolved to something a CloudFormation Output cannot hold.
   */
  value(outputKey: string): string {
    const output = this.outputs.get(outputKey);

    if (output === undefined) {
      throw new TypeError(
        `Sim CloudFormation Stack ${this.stackName} has no Output ${outputKey}. ` +
          `It declares ${this.declaredOutputs()}.`,
      );
    }

    if (typeof output.value !== "string") {
      throw new TypeError(
        `Sim CloudFormation Stack ${this.stackName} Output ${outputKey} resolved to ` +
          `${describeValue(output.value)}. A CloudFormation Output is a string.`,
      );
    }

    return output.value;
  }

  private declaredOutputs(): string {
    const outputKeys = this.outputs.keys().toArray();

    if (outputKeys.length === 0) {
      return "no Outputs";
    }

    return outputKeys.join(", ");
  }
}

/** What a resolved Output turned out to hold, for a failure to report. */
function describeValue(value: SimCfnTemplateValue): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `a list (${JSON.stringify(value)})`;
  }

  if (typeof value === "object") {
    return `a record (${JSON.stringify(value)})`;
  }

  return `a ${typeof value} (${JSON.stringify(value)})`;
}
