import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "../stack/sim-cfn-stack.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import {
  SimCfnTemplateFileLoader,
  type SimCloudFormationDeployTemplateFileProperties,
} from "./sim-cfn-template-file-loader.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import { UpdateStackCommandHandler } from "../command/update-stack/update-stack.handler.js";

/**
 * Applying a template file to the Stack it was deployed as.
 *
 * Named as an interface because a watch only needs the applying, and standing
 * in for it is how the answer to an update that failed is tested without a
 * failure having to be arranged in simulated AWS.
 */
export interface SimCfnTemplateFileUpdating {
  update(
    properties: SimCloudFormationDeployTemplateFileProperties,
  ): Promise<SimCfnStack>;
}

interface SimCfnTemplateFileUpdaterProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background: BackgroundScheduler & BackgroundCompleter;
}

/**
 * Applies a template file to the Stack it was deployed as.
 *
 * The same file, read again. Whatever the deployment was given alongside the
 * path, such as parameters or a Stack name, is given again, so the difference
 * applied is the difference in the file rather than the difference between one
 * call and another.
 *
 * Reading it here rather than in the watch is what makes the deployed Stack and
 * the updated Stack read the same way, including the sibling assets manifest a
 * re-synthesis rewrites beside the template.
 */
export class SimCfnTemplateFileUpdater implements SimCfnTemplateFileUpdating {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  private readonly background: BackgroundScheduler & BackgroundCompleter;
  private readonly templateFileLoader = new SimCfnTemplateFileLoader();

  constructor(properties: SimCfnTemplateFileUpdaterProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.stacks = properties.stacks;
    this.background = properties.background;
  }

  /**
   * Read the template file and apply it to its Stack.
   *
   * Returns once the Resource work has finished, so a caller knows the
   * simulated environment is serving the new template rather than part way to
   * it. An update that fails throws what failed it, and a template that changed
   * nothing throws the ValidationError CloudFormation refuses it with.
   */
  async update(
    properties: SimCloudFormationDeployTemplateFileProperties,
  ): Promise<SimCfnStack> {
    const loaded = await this.templateFileLoader.load(properties);
    const handler = new UpdateStackCommandHandler({
      accountRegionScope: this.accountRegionScope,
      stacks: this.stacks,
      background: this.background,
      cdkOutContext: loaded.cdkOutContext,
    });

    await handler.handle({
      input: {
        StackName: loaded.stackName,
        TemplateBody: jsonStringify(loaded.template),
        Parameters: Object.entries(loaded.parameters ?? {}).map(
          ([parameterKey, parameterValue]) => ({
            ParameterKey: parameterKey,
            ParameterValue: parameterValue,
          }),
        ),
      },
    });

    const stack = this.stacks.get(
      loaded.stackName as SimCloudFormationStackName,
    );
    assertDefined(stack, `Sim CloudFormation Stack named ${loaded.stackName}`);

    await stack.waitForUpdateComplete();

    return stack;
  }
}
