import { SimEcsSecretResolutionError } from "./sim-ecs-secret.error.js";

/**
 * The one key of a JSON secret a `valueFrom` selects.
 *
 * A Secrets Manager secret is very often a JSON object holding a whole set of
 * connection details, and a container wants one field of it as one variable.
 * Real ECS takes that key from the seventh part of the ARN, which is what CDK
 * writes when a construct is given a field.
 *
 * A key whose value is not a string is refused rather than converted. An
 * environment variable is text, and turning a nested object or a number into
 * text here would be this simulation choosing a representation real ECS has
 * not documented.
 */
export class SimEcsSecretJsonKey {
  private readonly key: string;

  constructor(key: string) {
    this.key = key;
  }

  private static parsed(secretString: string, key: string): unknown {
    try {
      return JSON.parse(secretString);
    } catch {
      throw new SimEcsSecretResolutionError(
        `the secret is not JSON, so it has no ${key} key.`,
      );
    }
  }

  /**
   * The value this key holds in a secret stored as a JSON object.
   */
  valueIn(secretString: string): string {
    const value = this.object(secretString)[this.key];

    if (value === undefined) {
      throw new SimEcsSecretResolutionError(
        `the secret holds no ${this.key} key.`,
      );
    }

    if (typeof value !== "string") {
      throw new SimEcsSecretResolutionError(
        `the ${this.key} key holds a ${typeof value} rather than a string, ` +
          `and an environment variable can only be text.`,
      );
    }

    return value;
  }

  private object(secretString: string): Record<string, unknown> {
    const parsed: unknown = SimEcsSecretJsonKey.parsed(secretString, this.key);

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new SimEcsSecretResolutionError(
        `the secret is not a JSON object, so it has no ${this.key} key.`,
      );
    }

    return parsed as Record<string, unknown>;
  }
}
