import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import { jsonParse, type JSONString } from "../../../util/type-guard/json.js";
import {
  loadSiblingCdkAssetsManifest,
  type SimCdkOutContext,
} from "../cdk/sim-cdk-out-context.js";
import type { SimCfnExecutableResourceBinding } from "../bind/sim-cfn-exec-binding.type.js";

export interface SimCloudFormationDeployTemplateFileProps {
  readonly templatePath: string;
  readonly stackName?: SimCloudFormationStackName | string | undefined;
  readonly parameters?: Record<string, string> | undefined;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
}

export interface SimCfnLoadedTemplateFile {
  readonly stackName: SimCloudFormationStackName | string;
  readonly template: CfnTemplateBodyRecord;
  readonly parameters?: Record<string, string> | undefined;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
}

/**
 * Loads a synthesized CloudFormation template file and gathers adjacent CDK
 * context needed to deploy it.
 */
export class SimCfnTemplateFileLoader {
  /**
   * Normalize a template-file deployment request into a parsed template payload
   * ready for the deployment workflow.
   */
  async load(
    properties: SimCloudFormationDeployTemplateFileProps | string,
  ): Promise<SimCfnLoadedTemplateFile> {
    const templatePath =
      typeof properties === "string" ? properties : properties.templatePath;
    const parameters =
      typeof properties === "string" ? undefined : properties.parameters;
    const bindings =
      typeof properties === "string" ? undefined : properties.bindings;
    const stackName =
      typeof properties === "string"
        ? stackNameFromTemplatePath(templatePath)
        : (properties.stackName ?? stackNameFromTemplatePath(templatePath));

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const templateBody = await readFile(templatePath, "utf8");
    const template = jsonParse(
      templateBody as JSONString<CfnTemplateBodyRecord>,
    );
    const cdkOutContext = await loadSiblingCdkAssetsManifest(templatePath);

    return {
      stackName,
      template,
      parameters,
      bindings,
      cdkOutContext,
    };
  }
}

function stackNameFromTemplatePath(
  templatePath: string,
): SimCloudFormationStackName {
  return path
    .basename(templatePath)
    .replace(/\.template\.json$/u, "") as SimCloudFormationStackName;
}
