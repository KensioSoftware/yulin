import { SimSsmParameterNotFound } from "../error/sim-ssm.error.js";
import type { SimSsmParameter } from "./sim-ssm-parameter.js";
import { SimSsmParameterName } from "./sim-ssm-parameter-name.js";
import type { SimSsmParameterPath } from "./sim-ssm-parameter-path.js";

/**
 * The parameters of one simulated SSM scope, and how a requested name
 * resolves to one of them.
 *
 * Parameters are keyed by the resource part of their ARN rather than by the
 * name as written, so `/db-host` and `db-host` reach the same parameter. They
 * have to: both name the same ARN, so no IAM policy could tell them apart.
 */
export class SimSsmParameterStore {
  private readonly parameters = new Map<string, SimSsmParameter>();

  /**
   * Every parameter in this scope, in creation order.
   */
  get all(): readonly SimSsmParameter[] {
    return this.parameters.values().toArray();
  }

  /**
   * Store a newly created parameter.
   */
  add(parameter: SimSsmParameter): void {
    this.parameters.set(parameter.arn.resource, parameter);
  }

  /**
   * Forget a deleted parameter.
   */
  remove(parameter: SimSsmParameter): void {
    this.parameters.delete(parameter.arn.resource);
  }

  /**
   * Find a parameter by name, with or without its leading slash.
   */
  find(name: string): SimSsmParameter | undefined {
    return this.parameters.get(SimSsmParameterName.resourceFor(name));
  }

  /**
   * Resolve a parameter by name, or refuse.
   */
  require(name: string): SimSsmParameter {
    const found = this.find(name);

    if (found === undefined) {
      throw new SimSsmParameterNotFound(
        `Parameter '${name}' not found: verify the name and try again`,
      );
    }

    return found;
  }

  /**
   * The parameters under one level of the hierarchy, in name order.
   *
   * Real Parameter Store returns a path listing sorted by name rather than in
   * creation order.
   */
  under(
    path: SimSsmParameterPath,
    recursive: boolean,
  ): readonly SimSsmParameter[] {
    return this.sortedByName(
      this.all.filter((parameter) => path.contains(parameter, recursive)),
    );
  }

  /**
   * Every parameter in this scope, in name order.
   */
  get allByName(): readonly SimSsmParameter[] {
    return this.sortedByName(this.all);
  }

  private sortedByName(
    parameters: readonly SimSsmParameter[],
  ): readonly SimSsmParameter[] {
    return parameters.toSorted((one, other) =>
      one.name.value.localeCompare(other.name.value),
    );
  }
}
