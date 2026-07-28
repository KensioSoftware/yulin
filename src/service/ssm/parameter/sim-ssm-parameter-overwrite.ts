import {
  SimSsmHierarchyTypeMismatchException,
  SimSsmParameterAlreadyExists,
} from "../error/sim-ssm.error.js";
import type { SimSsmParameter } from "./sim-ssm-parameter.js";
import { SimSsmParameterType } from "./sim-ssm-parameter-type.js";

/**
 * What a write says about the type it wants and whether it may replace what
 * is already there.
 */
export interface SimSsmParameterOverwriteRequest {
  readonly type: string | undefined;
  readonly overwrite: boolean | undefined;
}

/**
 * The rules that only exist where a create and an overwrite meet.
 *
 * A name already in use and a type that cannot change are both about the
 * relationship between a request and a stored parameter, rather than about
 * either on its own, so they live together and away from the write itself.
 */
export class SimSsmParameterOverwrite {
  /**
   * The type the written version will belong to, refusing a request that may
   * not replace the parameter it names.
   */
  typeFor(
    request: SimSsmParameterOverwriteRequest,
    existing: SimSsmParameter | undefined,
  ): SimSsmParameterType {
    if (existing === undefined) {
      return SimSsmParameterType.forNewParameter(request.type);
    }

    this.requireAllowed(request, existing);

    return existing.type;
  }

  /**
   * Refuse an overwrite that real Parameter Store refuses.
   *
   * A request that leaves out Overwrite is a create, so a name already in use
   * fails rather than quietly replacing what is there. A request naming a
   * different type fails too: Parameter Store has no way to convert a stored
   * parameter, so the caller has to delete it and make a new one.
   */
  private requireAllowed(
    request: SimSsmParameterOverwriteRequest,
    existing: SimSsmParameter,
  ): void {
    if (request.overwrite !== true) {
      throw new SimSsmParameterAlreadyExists(
        `The parameter '${existing.name.value}' already exists. To overwrite ` +
          `this value, set the Overwrite option in the request to true.`,
      );
    }

    if (request.type === undefined) {
      return;
    }

    const requested = new SimSsmParameterType(request.type);

    if (requested.value === existing.type.value) {
      return;
    }

    throw new SimSsmHierarchyTypeMismatchException(
      `Parameter '${existing.name.value}' is a ${existing.type.value} ` +
        `parameter and cannot be changed to ${requested.value}. Parameter ` +
        `Store does not support changing a parameter type: create a new, ` +
        `unique parameter instead.`,
    );
  }
}
