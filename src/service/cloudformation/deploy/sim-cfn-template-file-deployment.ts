import type { SimCloudFormationDeployTemplateFileProperties } from "./sim-cfn-template-file-loader.js";

/**
 * The deployment of a template file, however it was asked for.
 *
 * A path on its own is the same deployment as an object naming only the path.
 * Holding one shape means a watch can deploy the file again with everything the
 * deployment was given, rather than with only the path it came from.
 */
export function simCfnTemplateFileDeployment(
  properties: SimCloudFormationDeployTemplateFileProperties | string,
): SimCloudFormationDeployTemplateFileProperties {
  if (typeof properties === "string") {
    return { templatePath: properties };
  }

  return properties;
}
