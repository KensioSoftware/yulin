import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimSsmParameterNotFound,
  SimSsmParameterVersionNotFound,
} from "../../error/sim-ssm.error.js";
import { SimSsmParameterName } from "../../parameter/sim-ssm-parameter-name.js";
import { SimSsmParameterSelector } from "../../parameter/sim-ssm-parameter-selector.js";
import type { SimSsmParameterStore } from "../../parameter/sim-ssm-parameter-store.js";
import type { SimSsmAuthorizer } from "../authorize/sim-ssm-authorizer.js";
import type { SimSsmParameterOutput } from "./parameter.command.js";
import { SimSsmParameterView } from "./sim-ssm-parameter-view.js";

/**
 * A parameter a read resolved, with the stored name it is ordered by.
 *
 * The name is carried separately rather than read back off the output because
 * a batch read has to sort by it, and the reported shape leaves every field
 * optional.
 */
export interface SimSsmFoundParameter {
  readonly name: string;
  readonly output: SimSsmParameterOutput;
}

interface SimSsmParameterReaderProperties {
  readonly parameters: SimSsmParameterStore;
  readonly authorizer: SimSsmAuthorizer;
}

/**
 * Resolves one requested parameter name to the value a read reports.
 *
 * GetParameter and GetParameters differ only in what they do when a name
 * resolves to nothing, so everything before that point belongs here.
 */
export class SimSsmParameterReader {
  private readonly parameters: SimSsmParameterStore;
  private readonly authorizer: SimSsmAuthorizer;
  private readonly view = new SimSsmParameterView();

  constructor(properties: SimSsmParameterReaderProperties) {
    this.parameters = properties.parameters;
    this.authorizer = properties.authorizer;
  }

  /**
   * Read one requested name, authorizing it before resolving it.
   *
   * Authorization comes first because real IAM evaluates a request before the
   * service sees it: a caller with no permission is refused whether or not the
   * parameter exists, rather than being told it is missing.
   */
  read(
    action: string,
    requested: string,
    caller: SimAwsCaller | undefined,
  ): SimSsmFoundParameter {
    const selector = new SimSsmParameterSelector(requested);

    this.authorizer.authorizeParameterResource(
      action,
      SimSsmParameterName.resourceFor(selector.name),
      caller,
    );

    const parameter = this.parameters.require(selector.name);

    return {
      name: parameter.name.value,
      output: this.view.value(
        parameter,
        selector.versionOf(parameter),
        selector.selector,
      ),
    };
  }

  /**
   * Read one name of a batch, reporting a name that resolves to nothing as
   * invalid rather than failing the whole request.
   *
   * A refused authorization still throws, because one name the caller may not
   * read fails the whole batch on real AWS.
   */
  readOrInvalid(
    action: string,
    requested: string,
    caller: SimAwsCaller | undefined,
  ): SimSsmFoundParameter | undefined {
    try {
      return this.read(action, requested, caller);
    } catch (error: unknown) {
      if (
        error instanceof SimSsmParameterNotFound ||
        error instanceof SimSsmParameterVersionNotFound
      ) {
        return undefined;
      }

      throw error;
    }
  }
}
