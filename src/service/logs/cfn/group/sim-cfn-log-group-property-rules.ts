import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { unsimulatedPropertyReasons } from "./sim-cfn-log-group-unsimulated-properties.js";

/** The properties a log group Resource is actually created from. */
const actedOnProperties = new Set(["LogGroupName", "RetentionInDays"]);

interface SimCfnLogGroupPropertyRulesProperties {
  readonly properties: SimCfnTemplateValueRecord;
  readonly ignorer: SimCfnPropertyIgnorer;
}

/**
 * What a log group Resource is created without acting on.
 *
 * The name and the retention are the two properties this simulation reads,
 * because they are the two a test asserts on. Everything else, whether
 * CloudWatch Logs has it or not, is recorded so a reader can see what a
 * deployed log group is not doing.
 */
export class SimCfnLogGroupPropertyRules {
  readonly #properties: SimCfnTemplateValueRecord;
  readonly #ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnLogGroupPropertyRulesProperties) {
    this.#properties = properties.properties;
    this.#ignorer = properties.ignorer;
  }

  /**
   * Record every property the log group is created without.
   */
  apply(): void {
    for (const name of Object.keys(this.#properties)) {
      this.applyToProperty(name);
    }
  }

  private applyToProperty(name: string): void {
    if (actedOnProperties.has(name)) {
      return;
    }

    const unsimulatedReason = unsimulatedPropertyReasons.get(name);

    if (unsimulatedReason === undefined) {
      this.#ignorer.ignoreProperty(
        name,
        `${name} is not a property simulated CloudWatch Logs knows about, so ` +
          `the log group is created without it`,
      );

      return;
    }

    this.#ignorer.ignoreProperty(
      name,
      `${name} is a real AWS::Logs::LogGroup property simulated CloudWatch ` +
        `Logs does not act on: ${unsimulatedReason}`,
    );
  }
}
