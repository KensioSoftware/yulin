import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import { SimCognitoUnsimulatedInput } from "../../command/sim-cognito-unsimulated-input.js";
import {
  simCognitoTriggerNames,
  simCognitoUnsimulatedTriggers,
  type SimCognitoTriggerName,
} from "./sim-cognito-trigger-name.js";

/**
 * The `LambdaConfig` a pool was created with, as a described pool reports it.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_LambdaConfigType.html
 */
export interface SimCognitoLambdaConfigType {
  readonly PreSignUp?: string | undefined;
  readonly PostConfirmation?: string | undefined;
  readonly PreAuthentication?: string | undefined;
  readonly PostAuthentication?: string | undefined;
  readonly PreTokenGeneration?: string | undefined;
  readonly CustomMessage?: string | undefined;
}

/**
 * The Lambda triggers one simulated user pool runs.
 *
 * A trigger is held as the function ARN the request named, and nothing is
 * looked up here: the function is resolved when the trigger fires, so a pool
 * can be created before the function it names and a function deleted
 * afterwards fails the request rather than the pool.
 *
 * Every other `LambdaConfig` key real Cognito has is refused, naming the
 * trigger and saying why, so a pool never quietly drops one. That is the whole
 * reason this reads the config rather than storing it: a pool that accepted a
 * `PreTokenGeneration` trigger and never called it would issue different tokens
 * here and on real AWS.
 */
export class SimCognitoLambdaConfig {
  private readonly operation: string;
  private readonly unsimulated: SimCognitoUnsimulatedInput;
  private readonly triggers = new Map<SimCognitoTriggerName, string>();
  private readonly configured: boolean;

  constructor(config: object | undefined, operation: string) {
    const entries = Object.entries(config ?? {});

    this.operation = operation;
    this.unsimulated = new SimCognitoUnsimulatedInput(operation);
    this.configured = config !== undefined;

    for (const [key, value] of entries) {
      this.read(key, value);
    }
  }

  /**
   * The function ARN a trigger names, or nothing when the pool has no such
   * trigger.
   */
  find(trigger: SimCognitoTriggerName): string | undefined {
    return this.triggers.get(trigger);
  }

  /**
   * This config as a described pool reports it.
   *
   * A pool created without a `LambdaConfig` at all reports none, rather than
   * reporting an empty one, so a describe answers what the request said.
   */
  toOutput(): SimCognitoLambdaConfigType | undefined {
    if (!this.configured) {
      return undefined;
    }

    return Object.fromEntries(this.triggers);
  }

  /**
   * Read one `LambdaConfig` entry, refusing a trigger this simulation does not
   * run.
   *
   * A key real Cognito does not have at all is refused too, in the same words
   * as one it has: either way the pool would behave differently for having
   * accepted it.
   */
  private read(key: string, value: unknown): void {
    if (value === undefined) {
      return;
    }

    if (!simCognitoTriggerNames.includes(key as SimCognitoTriggerName)) {
      this.unsimulated.refuse(
        `LambdaConfig ${key}`,
        value,
        simCognitoUnsimulatedTriggers.get(key) ??
          "a Lambda trigger this simulation does not know",
      );
    }

    this.triggers.set(
      key as SimCognitoTriggerName,
      this.requireFunctionArn(key, value),
    );
  }

  private requireFunctionArn(key: string, value: unknown): string {
    if (typeof value !== "string" || value === "") {
      throw new SimCognitoInvalidParameterException(
        `${this.operation} LambdaConfig ${key} must be the ARN of the ` +
          `function the trigger invokes`,
      );
    }

    return value;
  }
}
