import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimSsmValidationException } from "../../error/sim-ssm.error.js";
import type { SimSsmParameterStore } from "../../parameter/sim-ssm-parameter-store.js";
import type { SimSsmAuthorizer } from "../authorize/sim-ssm-authorizer.js";
import type {
  SimGetParameterCommand,
  SimGetParameterCommandOutput,
  SimGetParametersCommand,
  SimGetParametersCommandOutput,
} from "./query.command.js";
import { requireParameterNames } from "./sim-ssm-parameter-names.js";
import {
  type SimSsmFoundParameter,
  SimSsmParameterReader,
} from "./sim-ssm-parameter-reader.js";

interface SimSsmGetParameterCommandsProperties {
  readonly parameters: SimSsmParameterStore;
  readonly authorizer: SimSsmAuthorizer;
}

interface SimSsmGetParameterCommandsOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that read parameter values.
 *
 * `WithDecryption` is accepted and ignored, as real Parameter Store ignores it
 * for `String` and `StringList` parameters. Nothing else here is encrypted,
 * because `SecureString` is not simulated.
 */
export class SimSsmGetParameterCommands {
  private readonly reader: SimSsmParameterReader;

  constructor(properties: SimSsmGetParameterCommandsProperties) {
    this.reader = new SimSsmParameterReader(properties);
  }

  /**
   * Read one parameter, refusing if it is not there.
   */
  get(
    command: SimGetParameterCommand,
    options?: SimSsmGetParameterCommandsOptions,
  ): SimGetParameterCommandOutput {
    const requested = command.input.Name;

    if (requested === undefined || requested.trim() === "") {
      throw new SimSsmValidationException(
        "GetParameter requires a parameter Name",
      );
    }

    const found = this.reader.read(
      "ssm:GetParameter",
      requested,
      options?.caller,
    );

    return { $metadata: {}, Parameter: found.output };
  }

  /**
   * Read several parameters at once.
   *
   * A name no parameter answers to comes back in `InvalidParameters` rather
   * than failing the request. That is what makes a typo silently return
   * nothing on real AWS, so a test that asserts on `Parameters` alone passes
   * while the application reads no configuration at all.
   */
  getMany(
    command: SimGetParametersCommand,
    options?: SimSsmGetParameterCommandsOptions,
  ): SimGetParametersCommandOutput {
    const names = requireParameterNames(command.input.Names, "GetParameters");
    const found: SimSsmFoundParameter[] = [];
    const invalid: string[] = [];

    for (const name of names) {
      const parameter = this.reader.readOrInvalid(
        "ssm:GetParameters",
        name,
        options?.caller,
      );

      if (parameter === undefined) {
        invalid.push(name);
      } else {
        found.push(parameter);
      }
    }

    return {
      $metadata: {},
      // Real Parameter Store lists these in alphabetical order rather than in
      // the order the request asked for them.
      Parameters: found
        .toSorted((one, other) => one.name.localeCompare(other.name))
        .map((entry) => entry.output),
      InvalidParameters: invalid,
    };
  }
}
