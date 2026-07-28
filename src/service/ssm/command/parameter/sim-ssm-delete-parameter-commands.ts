import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimSsmValidationException } from "../../error/sim-ssm.error.js";
import { SimSsmParameterName } from "../../parameter/sim-ssm-parameter-name.js";
import type { SimSsmParameterStore } from "../../parameter/sim-ssm-parameter-store.js";
import type { SimSsmAuthorizer } from "../authorize/sim-ssm-authorizer.js";
import type {
  SimDeleteParameterCommand,
  SimDeleteParameterCommandOutput,
  SimDeleteParametersCommand,
  SimDeleteParametersCommandOutput,
} from "./parameter.command.js";
import { requireParameterNames } from "./sim-ssm-parameter-names.js";

interface SimSsmDeleteParameterCommandsProperties {
  readonly parameters: SimSsmParameterStore;
  readonly authorizer: SimSsmAuthorizer;
}

interface SimSsmDeleteParameterCommandsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that delete parameters.
 *
 * A parameter is gone as soon as it is deleted: Parameter Store has no
 * recovery window, so its whole version history goes with it and the name is
 * free again.
 */
export class SimSsmDeleteParameterCommands {
  private readonly parameters: SimSsmParameterStore;
  private readonly authorizer: SimSsmAuthorizer;

  constructor(properties: SimSsmDeleteParameterCommandsProperties) {
    this.parameters = properties.parameters;
    this.authorizer = properties.authorizer;
  }

  /**
   * Delete one parameter, refusing if it is not there.
   */
  delete(
    command: SimDeleteParameterCommand,
    options?: SimSsmDeleteParameterCommandsOptions,
  ): SimDeleteParameterCommandOutput {
    const requested = command.input.Name;

    if (requested === undefined || requested.trim() === "") {
      throw new SimSsmValidationException(
        "DeleteParameter requires a parameter Name",
      );
    }

    this.authorize("ssm:DeleteParameter", requested, options?.caller);
    this.parameters.remove(this.parameters.require(requested));

    return { $metadata: {} };
  }

  /**
   * Delete several parameters at once.
   *
   * A name no parameter answers to comes back in `InvalidParameters` rather
   * than failing the request, so the parameters that were found are still
   * deleted.
   */
  deleteMany(
    command: SimDeleteParametersCommand,
    options?: SimSsmDeleteParameterCommandsOptions,
  ): SimDeleteParametersCommandOutput {
    const names = requireParameterNames(
      command.input.Names,
      "DeleteParameters",
    );
    const deleted: string[] = [];
    const invalid: string[] = [];

    for (const name of names) {
      this.authorize("ssm:DeleteParameters", name, options?.caller);

      const parameter = this.parameters.find(name);

      if (parameter === undefined) {
        invalid.push(name);
      } else {
        this.parameters.remove(parameter);
        deleted.push(name);
      }
    }

    return {
      $metadata: {},
      DeletedParameters: deleted.toSorted((one, other) =>
        one.localeCompare(other),
      ),
      InvalidParameters: invalid.toSorted((one, other) =>
        one.localeCompare(other),
      ),
    };
  }

  private authorize(
    action: string,
    requested: string,
    caller: SimAwsCaller | undefined,
  ): void {
    this.authorizer.authorizeParameterResource(
      action,
      SimSsmParameterName.resourceFor(requested),
      caller,
    );
  }
}
