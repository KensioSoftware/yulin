import { simProcessEnvironment } from "../../../../util/process/sim-process-environment.js";
import { SimLambdaHostBackedVariables } from "./sim-lambda-host-backed-variables.js";
import {
  type SimLambdaEnvironmentDetails,
  simLambdaRuntimeVariables,
} from "./sim-lambda-runtime-variables.js";

interface SimLambdaEnvironmentProperties extends SimLambdaEnvironmentDetails {
  readonly declaredVariables?: ReadonlyMap<string, string> | undefined;
}

/**
 * The environment a sim Lambda function runs with.
 *
 * Combines the AWS-provided runtime variables with the variables declared for
 * the function through Environment.Variables. Declared variables cannot
 * shadow the runtime ones: real Lambda rejects the reserved names at
 * CreateFunction, so the two sets never collide by the time they get here.
 */
export class SimLambdaEnvironment {
  private readonly details: SimLambdaEnvironmentDetails;
  private readonly declared: ReadonlyMap<string, string>;

  /**
   * The environment a function declaring nothing of its own runs with, which
   * keeps the host process environment underneath the AWS-provided variables.
   */
  private readonly hostBacked = new SimLambdaHostBackedVariables();

  /**
   * The merged variables, built once and then reused.
   *
   * Reusing one object gives the warm execution environment semantics of real
   * Lambda: a write to process.env inside a handler is still visible to the
   * next invocation of the same function, and is discarded when the function
   * goes away.
   */
  #variables: Record<string, string> | undefined;

  constructor(properties: SimLambdaEnvironmentProperties) {
    const { declaredVariables, ...details } = properties;
    this.details = details;
    this.declared = declaredVariables ?? new Map();
  }

  /**
   * Whether any variables were declared for this function.
   *
   * A function with no declared variables runs with the host process
   * environment under the AWS-provided runtime variables, and reports no
   * Environment in its configuration.
   */
  get hasDeclaredVariables(): boolean {
    return this.declared.size > 0;
  }

  /**
   * The variables declared for this function, without the AWS-provided ones.
   */
  get declaredVariables(): ReadonlyMap<string, string> {
    return this.declared;
  }

  /**
   * The name of the function this environment belongs to.
   */
  get functionName(): string {
    return this.details.functionName;
  }

  /**
   * The declared variables as AWS reports them in function configuration.
   *
   * Real Lambda leaves Environment off the configuration entirely for a
   * function that declares none.
   */
  configuration(): { Variables: Record<string, string> } | undefined {
    if (!this.hasDeclaredVariables) {
      return undefined;
    }

    return { Variables: Object.fromEntries(this.declared) };
  }

  /**
   * Run function code with this environment applied to process.env.
   *
   * Every invocation runs with the AWS-provided runtime variables, as every
   * real Lambda invocation does, whatever the function declared. An AWS SDK
   * client built inside the handler reads its Region from AWS_REGION there,
   * and reads credentials the invocation is already attributed to.
   *
   * A function that declares nothing of its own keeps the host process
   * environment underneath them. Taking that away would take away everything
   * the test process set, which is where an in-process handler's
   * configuration comes from when the function declares none. A function
   * declaring variables gets only its own, as before.
   *
   * Zip code running in a vm context takes its variables from the sandbox
   * instead, and is unaffected either way.
   */
  async runWith<T>(run: () => Promise<T>): Promise<T> {
    if (this.hasDeclaredVariables) {
      return await simProcessEnvironment.run(this.variables(), run);
    }

    return await this.hostBacked.runWith(this.variables(), run);
  }

  /**
   * The complete process.env-shaped variables the function code sees.
   */
  variables(): Record<string, string> {
    this.#variables ??= {
      ...simLambdaRuntimeVariables(this.details),
      ...Object.fromEntries(this.declared),
    };
    return this.#variables;
  }
}
