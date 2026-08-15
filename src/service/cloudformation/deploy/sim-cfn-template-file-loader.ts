import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import { jsonParse, type JSONString } from "../../../util/type-guard/json.js";
import {
  loadSiblingCdkAssetsManifest,
  type SimCdkOutContext,
} from "../cdk/sim-cdk-out-context.js";
import type { SimCfnDeployBinding } from "../bind/sim-cfn-deploy-binding.js";
import { simWatch } from "../../../watch/sim-watch-runtime.js";
import type { SimCfnTemplateFileWatchOptions } from "../watch/sim-cfn-template-watch.type.js";
import { simCfnTemplateFileDeployment } from "./sim-cfn-template-file-deployment.js";
import {
  transformedTemplate,
  type SimCfnTemplateFileTransform,
} from "./sim-cfn-template-file-transform.js";

export interface SimCloudFormationDeployTemplateFileProperties {
  readonly templatePath: string;
  readonly stackName?: SimCloudFormationStackName | string | undefined;
  readonly parameters?: Record<string, string> | undefined;
  readonly bindings?: readonly SimCfnDeployBinding[] | undefined;

  /**
   * Adapt the parsed template before it is deployed, and again every time a
   * watched file changes.
   *
   * A synthesized template can carry something a simulation cannot resolve at
   * all, such as an ARN holding a real account or a Hosted Zone ID that came
   * from a lookup. This is where that gets rewritten, so the template being
   * deployed and watched is the one the cloud assembly holds rather than a
   * derived copy of it living somewhere on disk.
   *
   * What it returns is what gets deployed. Staged assets still resolve, since
   * the cloud assembly is found beside `templatePath` rather than read out of
   * the template. A transform that throws fails the deployment, and on a
   * watched change is reported the way a failed update is, leaving the watch
   * to carry on to the next save.
   */
  readonly transform?: SimCfnTemplateFileTransform | undefined;

  /**
   * Keep watching the template file, and apply it to the Stack again whenever
   * it changes, rather than the deployment being the one time it is read.
   *
   * `true` watches with nothing to do afterwards. An options object is where a
   * served page gets reloaded once the update is complete. Watching holds the
   * process open until `stopWatchingTemplateFiles()`, which is what a dev
   * process wants and a test has to remember.
   */
  readonly watch?: boolean | SimCfnTemplateFileWatchOptions | undefined;
}

export interface SimCfnLoadedTemplateFile {
  readonly stackName: SimCloudFormationStackName | string;
  readonly template: CfnTemplateBodyRecord;
  readonly parameters?: Record<string, string> | undefined;
  readonly bindings?: readonly SimCfnDeployBinding[] | undefined;
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
    properties: SimCloudFormationDeployTemplateFileProperties | string,
  ): Promise<SimCfnLoadedTemplateFile> {
    const deployment = simCfnTemplateFileDeployment(properties);
    const { templatePath, parameters, bindings } = deployment;
    const stackName =
      deployment.stackName ?? stackNameFromTemplatePath(templatePath);

    // The template is named to a `yulin watch` supervisor, so re-synthing a
    // stack restarts the process that deployed it. Nothing happens outside
    // watch mode.
    simWatch.reportPath(templatePath);

    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    const templateBody = await readFile(templatePath, "utf8");
    const template = transformedTemplate(
      jsonParse(templateBody as JSONString<CfnTemplateBodyRecord>),
      deployment.transform,
    );
    // Read from the path rather than the template, so what a transform did to
    // the body leaves the staged assets beside it where they were.
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
