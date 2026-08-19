import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimLambdaFunctionAliasStore } from "../../function/version/sim-lambda-function-alias-store.js";
import type { SimLambdaFunctionLookup } from "../../function/url/sim-lambda-function-lookup.js";
import { CreateAliasCommandHandler } from "../create-alias/create-alias.handler.js";
import type {
  SimCreateAliasCommand,
  SimCreateAliasCommandOutput,
} from "../create-alias/create-alias.command.js";
import { DeleteAliasCommandHandler } from "../delete-alias/delete-alias.handler.js";
import type {
  SimDeleteAliasCommand,
  SimDeleteAliasCommandOutput,
} from "../delete-alias/delete-alias.command.js";
import { GetAliasCommandHandler } from "../get-alias/get-alias.handler.js";
import type {
  SimGetAliasCommand,
  SimGetAliasCommandOutput,
} from "../get-alias/get-alias.command.js";
import { ListAliasesCommandHandler } from "../list-aliases/list-aliases.handler.js";
import type {
  SimListAliasesCommand,
  SimListAliasesCommandOutput,
} from "../list-aliases/list-aliases.command.js";
import { UpdateAliasCommandHandler } from "../update-alias/update-alias.handler.js";
import type {
  SimUpdateAliasCommand,
  SimUpdateAliasCommandOutput,
} from "../update-alias/update-alias.command.js";

interface SimLambdaAliasCommandsProperties {
  readonly functions: SimLambdaFunctionLookup;
  readonly aliases: SimLambdaFunctionAliasStore;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

interface SimLambdaAliasCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The alias commands of one simulated Lambda scope.
 *
 * These five share the same collaborators and differ only in the handler they
 * run, so grouping them keeps the SimLambda facade a thin delegation rather
 * than five near-identical wiring blocks.
 */
export class SimLambdaAliasCommands {
  private readonly properties: SimLambdaAliasCommandsProperties;

  constructor(properties: SimLambdaAliasCommandsProperties) {
    this.properties = properties;
  }

  /**
   * Point a new alias at a published version.
   */
  async create(
    command: SimCreateAliasCommand,
    options?: SimLambdaAliasCommandOptions,
  ): Promise<SimCreateAliasCommandOutput> {
    return await new CreateAliasCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Point an existing alias at another version.
   */
  async update(
    command: SimUpdateAliasCommand,
    options?: SimLambdaAliasCommandOptions,
  ): Promise<SimUpdateAliasCommandOutput> {
    return await new UpdateAliasCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Read one alias of a function.
   */
  async get(
    command: SimGetAliasCommand,
    options?: SimLambdaAliasCommandOptions,
  ): Promise<SimGetAliasCommandOutput> {
    return await new GetAliasCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * List a function's aliases.
   */
  async list(
    command: SimListAliasesCommand,
    options?: SimLambdaAliasCommandOptions,
  ): Promise<SimListAliasesCommandOutput> {
    return await new ListAliasesCommandHandler(this.properties).handle(
      command,
      options,
    );
  }

  /**
   * Drop one alias of a function.
   */
  async delete(
    command: SimDeleteAliasCommand,
    options?: SimLambdaAliasCommandOptions,
  ): Promise<SimDeleteAliasCommandOutput> {
    return await new DeleteAliasCommandHandler(this.properties).handle(
      command,
      options,
    );
  }
}
