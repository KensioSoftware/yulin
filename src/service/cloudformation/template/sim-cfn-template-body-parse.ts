import { jsonParse, type JSONString } from "../../../util/type-guard/json.js";
import type { CfnTemplateBodyRecord } from "./sim-cfn-template.js";
import { parseSimCfnTemplateYaml } from "./yaml/sim-cfn-template-yaml.js";

interface SimCfnTemplateBodyParseProperties {
  readonly stackName?: string | undefined;
}

/**
 * Parse the `TemplateBody` a Stack command carries.
 *
 * CloudFormation takes that field as JSON or as YAML, and unlike a template
 * file it carries no name to say which. The body is read as JSON, and as YAML
 * when that fails. JSON goes first because it is the format CDK synthesizes,
 * and a JSON template read by the YAML parser costs more for the same result.
 *
 * A body that fails both attempts is refused with what each of them made of
 * it. One reason on its own would send whoever wrote the template looking at
 * the wrong format.
 */
export function parseSimCfnTemplateBody(
  templateBody: string,
  properties: SimCfnTemplateBodyParseProperties = {},
): CfnTemplateBodyRecord {
  let jsonFailure: unknown;

  try {
    return jsonParse(templateBody as JSONString<CfnTemplateBodyRecord>);
  } catch (error) {
    jsonFailure = error;
  }

  try {
    return parseSimCfnTemplateYaml(templateBody);
  } catch (error) {
    throw new Error(
      `Sim CloudFormation Stack ${properties.stackName ?? "unknown"} ` +
        "TemplateBody must be valid JSON or YAML: " +
        `as JSON, ${reasonFor(jsonFailure)}; ` +
        `as YAML, ${reasonFor(error)}`,
      { cause: error },
    );
  }
}

function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
