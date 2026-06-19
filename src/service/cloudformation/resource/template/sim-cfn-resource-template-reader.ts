import { isRecord } from "../../../../util/type-guard/record.js";
import { parseSimCfnResourceDependencies } from "../dependency/sim-cfn-resource-dependencies.js";

/**
 * Reads CloudFormation Resource-level fields from one Resource template object.
 *
 * This is intentionally narrower than SimCfnTemplate. SimCfnTemplate represents
 * the whole stack template body: it validates top-level template shape, resolves
 * Parameters, and extracts Resource entries.
 *
 * SimCfnResourceTemplateReader only works after that extraction step. It reads
 * fields from one individual Resource object, such as Type, Properties, and
 * DependsOn, so SimCfnResource can stay focused on Resource lifecycle state.
 */
export class SimCfnResourceTemplateReader {
  constructor(private readonly template: Record<string, unknown>) {}

  /**
   * The CloudFormation Resource type, for example AWS::S3::Bucket.
   */
  type(): string | undefined {
    const type = this.template["Type"];

    return typeof type === "string" ? type : undefined;
  }

  /**
   * The CloudFormation Resource properties object.
   *
   * CloudFormation Resources may omit Properties. In that case, and when the
   * field is not an object, the simulator treats it as an empty object.
   */
  properties(): Record<string, unknown> {
    const properties = this.template["Properties"];

    if (isRecord(properties)) {
      return properties;
    }

    return {};
  }

  /**
   * Logical IDs this Resource depends on.
   *
   * DependsOn may be absent, a string, or a list of strings. Dependency parsing
   * is delegated so this reader only exposes the normalized string list.
   */
  dependencies(): string[] {
    return parseSimCfnResourceDependencies(this.template["DependsOn"]);
  }
}
