import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunctionVersionStore } from "../../function/version/sim-lambda-function-version-store.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { ListVersionsByFunctionCommandHandler } from "../list-versions-by-function/list-versions-by-function.handler.js";
import type {
  SimListVersionsByFunctionCommand,
  SimListVersionsByFunctionCommandOutput,
} from "../list-versions-by-function/list-versions-by-function.command.js";
import { PublishVersionCommandHandler } from "../publish-version/publish-version.handler.js";
import type {
  SimPublishVersionCommand,
  SimPublishVersionCommandOutput,
} from "../publish-version/publish-version.command.js";

interface SimLambdaVersionCommandsProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly versions: SimLambdaFunctionVersionStore;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface SimLambdaVersionCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The published version commands of one simulated Lambda scope.
 *
 * These two share the same collaborators and differ only in the handler they
 * run, so grouping them keeps the SimLambda facade a thin delegation rather
 * than two near-identical wiring blocks.
 */
export class SimLambdaVersionCommands {
  private readonly properties: SimLambdaVersionCommandsProperties;

  constructor(properties: SimLambdaVersionCommandsProperties) {
    this.properties = properties;
  }

  /**
   * Publish a function as it stands as its next version.
   */
  async publish(
    command: SimPublishVersionCommand,
    options?: SimLambdaVersionCommandOptions,
  ): Promise<SimPublishVersionCommandOutput> {
    return await new PublishVersionCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * List a function's versions.
   */
  async list(
    command: SimListVersionsByFunctionCommand,
    options?: SimLambdaVersionCommandOptions,
  ): Promise<SimListVersionsByFunctionCommandOutput> {
    return await new ListVersionsByFunctionCommandHandler(
      this.properties,
    ).handle(command, options);
  }
}
