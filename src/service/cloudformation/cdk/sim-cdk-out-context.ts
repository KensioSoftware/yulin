import path from "node:path";
import { readFile } from "node:fs/promises";
import { jsonParse, type JSONString } from "../../../util/type-guard/json.js";

export interface SimCdkAssetsManifest {
  readonly files?: Record<
    string,
    {
      readonly source?: {
        readonly path?: string | undefined;
        readonly packaging?: string | undefined;
      };
      readonly destinations?: Record<
        string,
        {
          readonly objectKey?: string | undefined;
        }
      >;
    }
  >;
}

export interface SimCdkOutContext {
  readonly templatePath?: string | undefined;
  readonly templateDirectoryPath?: string | undefined;
  readonly assetsManifestPath?: string | undefined;
  readonly assetsManifest?: SimCdkAssetsManifest | undefined;
}

/**
 * Load CDK cloud assembly context for a synthesized Stack template file.
 */
export async function loadSiblingCdkAssetsManifest(
  templatePath: string,
): Promise<SimCdkOutContext> {
  const resolvedTemplatePath = path.resolve(templatePath);
  const templateDirectoryPath = path.dirname(resolvedTemplatePath);
  const templateFileName = path.basename(resolvedTemplatePath);
  const assetsFileName = templateFileName.replace(
    /\.template\.json$/u,
    ".assets.json",
  );

  if (assetsFileName === templateFileName) {
    return {
      templatePath: resolvedTemplatePath,
      templateDirectoryPath,
    };
  }

  const assetsManifestPath = path.join(templateDirectoryPath, assetsFileName);

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const manifestBody = await readFile(assetsManifestPath, "utf8");

  return {
    templatePath: resolvedTemplatePath,
    templateDirectoryPath,
    assetsManifestPath,
    assetsManifest: jsonParse(manifestBody as JSONString<SimCdkAssetsManifest>),
  };
}
