import path from "node:path";
import { jsonParse, type JSONString } from "../../../util/type-guard/json.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import { parseSimCfnTemplateYaml } from "../template/yaml/sim-cfn-template-yaml.js";

const YAML_TEMPLATE_FILE_NAME = /\.ya?ml$/u;

/**
 * Parse a template file in the format its name gives it.
 *
 * CloudFormation takes a template as JSON or as YAML, and a file says which of
 * the two it holds by what it is called. A `.yaml` or `.yml` file is read as
 * YAML. Every other name is read as JSON, which is what CDK synthesizes.
 */
export function parseTemplateFileBody(
  templatePath: string,
  templateBody: string,
): CfnTemplateBodyRecord {
  if (!YAML_TEMPLATE_FILE_NAME.test(templatePath)) {
    return jsonParse(templateBody as JSONString<CfnTemplateBodyRecord>);
  }

  try {
    return parseSimCfnTemplateYaml(templateBody);
  } catch (error) {
    // The path is named because a YAML failure reports a line and column, and
    // a line and column with no file to look them up in is no use to anyone
    // deploying more than one template.
    throw new Error(
      `Sim CloudFormation template file at ${path.resolve(templatePath)} ` +
        `is not YAML this simulation can read: ${reasonFor(error)}`,
      { cause: error },
    );
  }
}

function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
