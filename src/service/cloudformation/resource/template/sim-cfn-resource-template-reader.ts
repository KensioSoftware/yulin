import {
  parseSimCfnResourceDependencies,
  parseSimCfnResourceRefDependencies as parseSimCfnResourceReferenceDependencies,
} from "../dependency/sim-cfn-resource-dependencies.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { isCfnTemplateValueRecord } from "./sim-cfn-templ-value-record.js";

/**
 * Reads CloudFormation Resource-level fields from one Resource template object.
 *
 * This is narrower than SimCfnTemplate. SimCfnTemplate represents the whole
 * stack template body: it validates top-level template shape, resolves
 * Parameters, and extracts Resource entries.
 *
 * SimCfnResourceTemplateReader only works after that extraction step. It reads
 * fields from one individual Resource object, such as Type, Properties, and
 * DependsOn, so SimCfnResource can stay focused on Resource lifecycle state.
 */
export class SimCfnResourceTemplateReader {
  constructor(private readonly template: SimCfnTemplateValueRecord) {}

  /**
   * The CloudFormation Resource type, for example AWS::S3::Bucket.
   */
  type(): string | undefined {
    const type = this.template["Type"];

    return typeof type === "string" ? type : undefined;
  }

  /**
   * The CloudFormation DeletionPolicy attribute, for example Retain.
   */
  deletionPolicy(): string | undefined {
    const deletionPolicy = this.template["DeletionPolicy"];

    return typeof deletionPolicy === "string" ? deletionPolicy : undefined;
  }

  /**
   * The CloudFormation Resource properties object.
   *
   * CloudFormation Resources may omit Properties. In that case, and when the
   * field is not an object, the simulator treats it as an empty object.
   */
  properties(): SimCfnTemplateValueRecord {
    const properties = this.template["Properties"];

    if (!isCfnTemplateValueRecord(properties)) {
      return {};
    }

    return properties;
  }

  /**
   * Logical IDs on which this Resource depends.
   *
   * Combines explicit DependsOn entries with implicit dependencies introduced
   * by Ref expressions that point at other Resources. The set of Resource
   * logical IDs distinguishes Resource Refs from Parameter Refs.
   *
   * DependsOn may be absent, a string, or a list of strings. Dependency parsing
   * is delegated so this reader only exposes the normalized string list.
   */
  dependencies(resourceLogicalIds: ReadonlySet<string> = new Set()): string[] {
    const dependsOn = parseSimCfnResourceDependencies(
      this.template["DependsOn"],
    );
    const referenceDependencies = parseSimCfnResourceReferenceDependencies(
      this.template,
      resourceLogicalIds,
    );

    return [...new Set([...dependsOn, ...referenceDependencies])];
  }
}
