import path from "node:path";
import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import {
  loadSiblingCdkAssetsManifest,
  type SimCdkOutContext,
} from "../cdk/sim-cdk-out-context.js";
import type { SimCfnBinding } from "../bind/sim-cfn-binding.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { simWatch } from "../../../watch/sim-watch-runtime.js";
import type { SimCfnTemplateFileWatchOptions } from "../watch/sim-cfn-template-watch.type.js";
import { simCfnTemplateFileDeployment } from "./sim-cfn-template-file-deployment.js";
import {
  transformedTemplate,
  type SimCfnTemplateFileTransform,
} from "./sim-cfn-template-file-transform.js";
import { readTemplateFile } from "./sim-cfn-template-file-read.js";
import { parseTemplateFileBody } from "./sim-cfn-template-file-parse.js";
import type { SimCfnResourceOrder } from "../stack/deploy/sim-cfn-resource-order.js";

export interface SimCloudFormationDeployTemplateFileProperties {
  readonly templatePath: string;
  readonly stackName?: SimCloudFormationStackName | string | undefined;
  readonly parameters?: Record<string, string> | undefined;
  readonly bindings?: readonly SimCfnBinding[] | undefined;

  /**
   * The principal the deployment runs as.
   *
   * Every Resource is created, updated and deleted through the command an SDK
   * caller would reach, and this is who those commands are authorized as. Left
   * out, they are decided as the Account root, which is what a service control
   * policy denying an Account's root principal then denies.
   */
  readonly caller?: SimAwsCaller | undefined;

  /**
   * The order Resources with no dependency between them are created in.
   *
   * CloudFormation is free to create them either way round, and the template's
   * own order is what a deployment does by default. `reversed` starts each
   * dependency batch from its last Resource, so a Stack that only deploys in
   * the order its template happens to be written fails here rather than in the
   * account. Declared dependencies and `DependsOn` are honoured either way.
   */
  readonly resourceOrder?: SimCfnResourceOrder | undefined;

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
  readonly bindings?: readonly SimCfnBinding[] | undefined;
  readonly caller?: SimAwsCaller | undefined;
  readonly resourceOrder?: SimCfnResourceOrder | undefined;
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
    const { templatePath, parameters, bindings, caller, resourceOrder } =
      deployment;
    const stackName =
      deployment.stackName ?? stackNameFromTemplatePath(templatePath);

    // The template is named to a `yulin watch` supervisor, so re-synthing a
    // stack restarts the process that deployed it. Nothing happens outside
    // watch mode.
    simWatch.reportPath(templatePath);

    const template = transformedTemplate(
      parseTemplateFileBody(templatePath, await readTemplateFile(templatePath)),
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
      caller,
      resourceOrder,
      cdkOutContext,
    };
  }
}

function stackNameFromTemplatePath(
  templatePath: string,
): SimCloudFormationStackName {
  return path
    .basename(templatePath)
    .replace(
      /\.template\.json$|(?:\.template)?\.ya?ml$/u,
      "",
    ) as SimCloudFormationStackName;
}
