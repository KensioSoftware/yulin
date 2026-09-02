import type { SimAwsRunAsOwner } from "../../aws/caller/sim-aws-run-as-context.js";
import { simAwsRunAsContext } from "../../aws/caller/sim-aws-run-as-context.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  DEFAULT_SIM_LAMBDA_MEMORY_SIZE_MB,
  SIM_LAMBDA_LATEST_VERSION,
  DEFAULT_SIM_LAMBDA_TIMEOUT_SECONDS,
  type SimLambdaFunctionArn,
  simLambdaFunctionArn,
  type SimLambdaFunctionConfiguration,
  type SimLambdaFunctionState,
} from "./sim-lambda-function-configuration.js";
import { simLambdaFunctionConfigurationOf } from "./sim-lambda-function-configuration.factory.js";
import {
  type SimLambdaExecutableCode,
  SimLambdaHandlerReferenceCode,
} from "./code/sim-lambda-executable-code.js";
import { SimLambdaEnvironment } from "./environment/sim-lambda-environment.js";
import { SimLambdaFunctionLogging } from "./logging/sim-lambda-function-logging.js";
import { SimLambdaFunctionPolicy } from "./policy/sim-lambda-function-policy.js";
import { SimLambdaHandlerRunner } from "./invoke/sim-lambda-handler-runner.js";
import { SimLambdaFunctionMetrics } from "../metric/sim-lambda-function-metrics.js";
import { SimLambdaInvokeContextBuilder } from "./invoke/sim-lambda-invoke-context-builder.js";
import { runSimLambdaInHostScope } from "./invoke/sim-lambda-host-scope.js";
import type { SimLambdaOutboundHttp } from "./outbound/sim-lambda-outbound-http.js";
import { type SimClock, SimRealClock } from "../../../util/clock/sim-clock.js";
import { defaultLambdaHandler } from "./sim-lambda-handler.type.js";
import {
  reconfigureSimLambdaFunction,
  type SimLambdaFunctionConfigurationUpdate,
} from "./sim-lambda-function-reconfiguration.js";
import type {
  SimLambdaFunctionName,
  SimLambdaFunctionProperties,
} from "./sim-lambda-function.type.js";

export type {
  SimLambdaFunctionName,
  SimLambdaFunctionMap,
} from "./sim-lambda-function.type.js";

/**
 * Simulated Lambda function resource.
 *
 * The function executes a real handler function reference in-process. While
 * the handler runs, the function's execution Role is the ambient simulated
 * caller for the owning SimAws instance, so simulated AWS operations the
 * handler performs are attributed to the execution Role, as on real Lambda.
 */
export class SimLambdaFunction {
  public readonly name: SimLambdaFunctionName;
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly version: string;

  /**
   * The settings UpdateFunctionConfiguration changes, which is everything
   * about the function that is neither its identity nor its code.
   *
   * They are read all over the simulation and written in one place, which is
   * updateConfiguration below.
   */
  public roleArn: string;
  public handlerName: string | undefined;
  public runtimeName: string | undefined;
  public description: string | undefined;
  public timeoutSeconds: number;
  public memorySizeMb: number;
  public environment: SimLambdaEnvironment;

  /** Where this function's abandoned asynchronous events go, if anywhere. */
  public deadLetterTargetArn: string | undefined;
  /**
   * This function's resource-based policy, which says who may act on it.
   *
   * It lives on the function because that is what it belongs to: it survives
   * as long as the function does, and it is the only thing that can allow a
   * principal from another Account, whose own policies this Account never
   * sees.
   */
  public readonly resourcePolicy = new SimLambdaFunctionPolicy();

  /** What this function publishes about its own work into `AWS/Lambda`. */
  public readonly metrics: SimLambdaFunctionMetrics;

  #state: SimLambdaFunctionState;
  #code: SimLambdaExecutableCode;
  private readonly properties: SimLambdaFunctionProperties;
  private readonly runAsOwner: SimAwsRunAsOwner;
  private readonly runner = new SimLambdaHandlerRunner();
  private readonly clock: SimClock;
  private readonly logging: SimLambdaFunctionLogging;
  private readonly outboundHttp: SimLambdaOutboundHttp | undefined;

  constructor(properties: SimLambdaFunctionProperties) {
    const {
      name,
      roleArn,
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      handlerFunction = defaultLambdaHandler,
      code,
      state = "Pending",
      handlerName,
      runtimeName,
      description,
      timeoutSeconds = DEFAULT_SIM_LAMBDA_TIMEOUT_SECONDS,
      memorySizeMb = DEFAULT_SIM_LAMBDA_MEMORY_SIZE_MB,
      environment,
      deadLetterTargetArn,
      runAsOwner = this,
      version = SIM_LAMBDA_LATEST_VERSION,
      clock = new SimRealClock(),
      metrics,
      outboundHttp,
    } = properties;
    this.properties = properties;
    this.clock = clock;
    this.version = version;
    this.name = name as SimLambdaFunctionName;
    this.roleArn = roleArn;
    this.accountRegionScope = accountRegionScope;
    this.#code = code ?? new SimLambdaHandlerReferenceCode(handlerFunction);
    this.#state = state;
    this.handlerName = handlerName;
    this.runtimeName = runtimeName;
    this.description = description;
    this.timeoutSeconds = timeoutSeconds;
    this.memorySizeMb = memorySizeMb;
    this.environment =
      environment ??
      new SimLambdaEnvironment({
        functionName: name,
        regionName: accountRegionScope.regionName,
        memorySizeMb,
      });
    this.deadLetterTargetArn = deadLetterTargetArn;
    this.runAsOwner = runAsOwner;
    this.outboundHttp = outboundHttp;
    this.metrics = new SimLambdaFunctionMetrics({ metrics, clock });
    this.logging = new SimLambdaFunctionLogging({
      functionName: name,
      logs: properties.logs,
      output: properties.output,
      clock,
    });
  }

  /**
   * The log group this function's output is recorded to.
   */
  get logGroupName(): string {
    return this.logging.logGroupName;
  }

  /**
   * Get the current state of this sim Lambda function.
   */
  get state(): SimLambdaFunctionState {
    return this.#state;
  }

  /**
   * Get the ARN for this sim Lambda function, qualified when it is a
   * published version rather than the function itself.
   */
  get arn(): SimLambdaFunctionArn {
    return simLambdaFunctionArn(
      this.accountRegionScope,
      this.name,
      this.version,
    );
  }

  /**
   * A copy of this function as it stands now, published under a version
   * number, with a description of its own where one is given, and keeping the
   * code, handler, timeout, memory and environment it was published with. It
   * is Active from the start, since the code it copied is already resolved.
   */
  publishedAs(version: string, description?: string): SimLambdaFunction {
    return new SimLambdaFunction({
      ...this.properties,
      roleArn: this.roleArn,
      handlerName: this.handlerName,
      runtimeName: this.runtimeName,
      timeoutSeconds: this.timeoutSeconds,
      memorySizeMb: this.memorySizeMb,
      code: this.#code,
      environment: this.environment,
      deadLetterTargetArn: this.deadLetterTargetArn,
      runAsOwner: this.runAsOwner,
      state: "Active",
      description: description ?? this.description,
      version,
    });
  }

  /**
   * Apply a settings change, as UpdateFunctionConfiguration makes one.
   *
   * The function object survives, so its resource-based policy stands and the
   * version, alias and Function URL stores go on finding it under its name. A
   * version published beforehand keeps the settings it was published with.
   */
  updateConfiguration(update: SimLambdaFunctionConfigurationUpdate): void {
    this.#code = reconfigureSimLambdaFunction(this, update, this.#code);
  }

  /**
   * Replace the code this function runs, keeping everything else about it.
   *
   * The function object survives the change. Its resource-based policy lives
   * on the object, and the version, alias and Function URL stores hold it
   * under its name. A version published beforehand keeps its own reference to
   * the code it was published with.
   */
  updateCode(code: SimLambdaExecutableCode): void {
    this.#code = code;
  }

  /**
   * Move this sim Lambda function to the Active state.
   */
  activate(): Promise<void> {
    this.#state = "Active";
    return Promise.resolve();
  }

  /**
   * Get the AWS-like function configuration for this sim Lambda function.
   */
  configuration(): SimLambdaFunctionConfiguration {
    return simLambdaFunctionConfigurationOf(this);
  }

  /**
   * Invoke this sim Lambda function's handler with an invocation event.
   *
   * The handler runs with this function's execution Role as the ambient
   * simulated caller for the run-as owner, which is the owning SimAws
   * instance when the function was created through one, and with this
   * function's own environment variables. Cold-start module imports also run
   * as the execution Role and with the same environment, as on real Lambda.
   *
   * Resolves with the handler result, or rejects with the handler or
   * Runtime.* cold-start error.
   */
  async invoke(event: unknown): Promise<unknown> {
    const contextBuilder = new SimLambdaInvokeContextBuilder({
      functionName: this.name,
      functionVersion: this.version,
      invokedFunctionArn: this.arn,
      timeoutSeconds: this.timeoutSeconds,
      memorySizeMb: this.memorySizeMb,
      clock: this.clock,
      logGroupName: this.logging.logGroupName,
      logStreamName: this.logging.logStreamName(),
    });

    this.logging.recordFrom(this.#code);

    return await this.metrics.around(String(this.name), async () =>
      simAwsRunAsContext.run(
        this.runAsOwner,
        { kind: "arn", arn: this.roleArn },
        async () =>
          await this.environment.runWith(
            async () =>
              await this.runInHostScope(
                async () =>
                  await this.logging.around(
                    async () =>
                      await this.runner.run(
                        this.#code.handlerFunction(),
                        event,
                        contextBuilder,
                      ),
                  ),
              ),
          ),
      ),
    );
  }

  /**
   * Run an invocation with the process globals host-scope code reads bridged
   * to this simulation: the current time, the HTTP clients it reaches for,
   * and the console and streams it prints through.
   */
  private async runInHostScope<T>(run: () => Promise<T>): Promise<T> {
    if (!this.#code.runsInHostScope) {
      return await run();
    }

    const { clock, outboundHttp } = this;
    const scope = { clock, outboundHttp, ...this.logging.outputScope() };

    return await runSimLambdaInHostScope(scope, run);
  }
}
