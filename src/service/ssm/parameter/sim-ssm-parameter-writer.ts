import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  SimSsmHierarchyTypeMismatchException,
  SimSsmParameterAlreadyExists,
} from "../error/sim-ssm.error.js";
import { SimSsmParameter } from "./sim-ssm-parameter.js";
import type { SimSsmParameterName } from "./sim-ssm-parameter-name.js";
import type { SimSsmParameterStore } from "./sim-ssm-parameter-store.js";
import { SimSsmParameterType } from "./sim-ssm-parameter-type.js";
import { SimSsmParameterValue } from "./sim-ssm-parameter-value.js";
import type {
  SimSsmParameterVersion,
  SimSsmParameterVersionDetails,
} from "./sim-ssm-parameter-version.js";

/**
 * One write of a parameter, as PutParameter describes it.
 */
export interface SimSsmParameterWrite extends SimSsmParameterVersionDetails {
  readonly name: SimSsmParameterName;
  readonly value: string | undefined;
  readonly type: string | undefined;
  readonly overwrite: boolean | undefined;
}

interface SimSsmParameterWriterProperties {
  readonly parameters: SimSsmParameterStore;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

/**
 * The single path by which a simulated parameter is created or updated.
 *
 * Keeping creation and overwrite in one collaborator is what stops the two
 * drifting apart on the rules that only show up when they meet: a name that is
 * already taken, and a type that cannot change once the parameter exists.
 */
export class SimSsmParameterWriter {
  private readonly parameters: SimSsmParameterStore;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: SimClock;

  constructor(properties: SimSsmParameterWriterProperties) {
    this.parameters = properties.parameters;
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
  }

  /**
   * Write a new version of a parameter, creating it if it is new.
   *
   * Everything is validated before anything is stored, so a request refused
   * for its value leaves no half-made parameter behind.
   */
  write(request: SimSsmParameterWrite): SimSsmParameterVersion {
    const value = new SimSsmParameterValue(request.value);
    const parameter = this.parameterFor(request);

    return parameter.addVersion(value, this.clock.now(), {
      description: request.description,
      dataType: request.dataType,
      lastModifiedUser: request.lastModifiedUser,
    });
  }

  private parameterFor(request: SimSsmParameterWrite): SimSsmParameter {
    const existing = this.parameters.find(request.name.value);

    if (existing === undefined) {
      return this.created(request);
    }

    this.requireOverwriteAllowed(request, existing);

    return existing;
  }

  private created(request: SimSsmParameterWrite): SimSsmParameter {
    const parameter = new SimSsmParameter({
      name: request.name,
      type: SimSsmParameterType.forNewParameter(request.type),
      accountRegionScope: this.accountRegionScope,
    });

    this.parameters.add(parameter);

    return parameter;
  }

  /**
   * Refuse an overwrite that real Parameter Store refuses.
   *
   * A request that leaves out Overwrite is a create, so a name already in use
   * fails rather than quietly replacing what is there. A request naming a
   * different type fails too: Parameter Store has no way to convert a stored
   * parameter, so the caller has to delete it and make a new one.
   */
  private requireOverwriteAllowed(
    request: SimSsmParameterWrite,
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
