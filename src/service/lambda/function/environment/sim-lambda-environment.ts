import { simLambdaProcessEnvironment } from "./sim-lambda-process-environment.js";

/**
 * The function details the AWS-provided runtime environment variables are
 * built from.
 */
export interface SimLambdaEnvironmentDetails {
  readonly functionName: string;
  readonly regionName: string;
  readonly memorySizeMb: number;
}

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
   * A function with no declared variables needs no environment of its own, so
   * callers can leave the host process environment alone entirely.
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
   * A function that declares nothing is left reading the host process
   * environment, exactly as before: there is nothing of its own to give it,
   * so there is no reason to touch process.env at all. Zip code running in a
   * vm context takes its variables from the sandbox instead, and is
   * unaffected either way.
   */
  async runWith<T>(run: () => Promise<T>): Promise<T> {
    if (!this.hasDeclaredVariables) {
      return await run();
    }

    return await simLambdaProcessEnvironment.run(this.variables(), run);
  }

  /**
   * The complete process.env-shaped variables the function code sees.
   */
  variables(): Record<string, string> {
    this.#variables ??= {
      ...this.runtimeVariables(),
      ...Object.fromEntries(this.declared),
    };
    return this.#variables;
  }

  /**
   * The AWS-like standard runtime environment variables.
   */
  private runtimeVariables(): Record<string, string> {
    const { functionName, regionName, memorySizeMb } = this.details;
    // Built from entries rather than an object literal because AWS
    // environment variable names are not code identifier names, and the
    // project's naming rules treat object literal keys as if they were.
    return Object.fromEntries([
      ["AWS_REGION", regionName],
      ["AWS_DEFAULT_REGION", regionName],
      ["AWS_LAMBDA_FUNCTION_NAME", functionName],
      ["AWS_LAMBDA_FUNCTION_MEMORY_SIZE", String(memorySizeMb)],
      ["AWS_LAMBDA_FUNCTION_VERSION", "$LATEST"],
    ]);
  }
}
