import { simProcessEnvironment } from "../../../../util/process/sim-process-environment.js";
import type { SimEcsKeyValuePair } from "../../task-definition/container/sim-ecs-container-parts.js";

interface SimEcsContainerEnvironmentProperties {
  readonly regionName: string;
  readonly declared: readonly SimEcsKeyValuePair[];
  readonly secrets: Record<string, string>;
  readonly overridden: readonly SimEcsKeyValuePair[];
}

/**
 * The environment one container of a simulated task runs with.
 *
 * It is the container definition's `environment`, with the values its `secrets`
 * resolved to and then any `RunTask` container override applied over the top,
 * and the Region variables a real task agent adds, so code that reads
 * `AWS_REGION` to build a client finds one.
 *
 * A secret and a declared variable of the same name is not something real ECS
 * documents an answer for. The secret wins here, since a plaintext variable of
 * the same name is the thing a secret was introduced to replace, and a
 * `RunTask` override wins over both, since an override is what a caller asked
 * for at the moment the task was started.
 *
 * The variables are applied to `process.env` for the length of the run, in the
 * same way a sim Lambda function's are: a bound handler is an ordinary closure
 * with no sandbox of its own, so asynchronous context tracking is what gives
 * it an environment. A container declaring nothing is left reading the host
 * environment untouched.
 */
export class SimEcsContainerEnvironment {
  private readonly regionName: string;
  private readonly declared: readonly SimEcsKeyValuePair[];
  private readonly secrets: Record<string, string>;
  private readonly overridden: readonly SimEcsKeyValuePair[];

  #variables: Record<string, string> | undefined;

  constructor(properties: SimEcsContainerEnvironmentProperties) {
    this.regionName = properties.regionName;
    this.declared = properties.declared;
    this.secrets = properties.secrets;
    this.overridden = properties.overridden;
  }

  /**
   * The pairs that named a variable, as process.env holds them.
   *
   * A pair with no name is left out rather than refused, since ECS takes the
   * declaration as it comes and there is nothing to set without a name.
   */
  private static namedValues(
    pairs: readonly SimEcsKeyValuePair[],
  ): Record<string, string> {
    const named: [string, string][] = pairs
      .filter((pair) => pair.name !== undefined && pair.name !== "")
      .map((pair) => [pair.name ?? "", pair.value ?? ""]);

    return Object.fromEntries(named);
  }

  /**
   * Whether this container has an environment of its own at all.
   */
  get hasVariables(): boolean {
    return (
      this.declared.length > 0 ||
      this.overridden.length > 0 ||
      Object.keys(this.secrets).length > 0
    );
  }

  /**
   * Run a container's handler with this environment applied to process.env.
   *
   * A container with nothing of its own is left reading the host environment
   * untouched, Region variables included. Giving it only the Region ones would
   * take away everything the test process set, which is where an in-process
   * handler's configuration usually comes from.
   */
  async runWith<T>(run: () => Promise<T>): Promise<T> {
    if (!this.hasVariables) {
      return await run();
    }

    return await simProcessEnvironment.run(this.variables(), run);
  }

  /**
   * The complete process.env-shaped variables the container code sees.
   */
  variables(): Record<string, string> {
    this.#variables ??= {
      ...this.regionVariables(),
      ...SimEcsContainerEnvironment.namedValues(this.declared),
      ...this.secrets,
      ...SimEcsContainerEnvironment.namedValues(this.overridden),
    };

    return this.#variables;
  }

  /**
   * The variables a real task agent puts in every container.
   *
   * Only the Region ones. The metadata endpoint and the credentials URI a real
   * agent also sets both name an address nothing here answers on, so setting
   * them would send code that reads them somewhere that does not exist.
   */
  private regionVariables(): Record<string, string> {
    // Built from entries rather than an object literal because AWS environment
    // variable names are not code identifier names, and the project's naming
    // rules treat object literal keys as if they were.
    return Object.fromEntries([
      ["AWS_REGION", this.regionName],
      ["AWS_DEFAULT_REGION", this.regionName],
    ]);
  }
}
