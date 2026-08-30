import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import type {
  SimCfnSkippedPropertyConstraint,
  SimCfnSkippedPropertyRules,
} from "./sim-cfn-skipped-property.type.js";

interface SimCfnSkippedPropertiesProperties {
  readonly rules: SimCfnSkippedPropertyRules;
  readonly properties: SimCfnTemplateValueRecord;
  readonly error: (reason: string) => Error;
}

/**
 * What one Resource's skipped properties say, and what they still have to
 * satisfy.
 *
 * Simulated CloudFormation deploys what it can, so a property a service cannot
 * act on is recorded against the Resource rather than taking it down. That
 * leaves a gap. A skipped property can carry a value real AWS answers with a
 * 400 as readily as a simulated one can, and deploying it here reports a
 * template AWS refuses as working, which is the one failure a local deploy of
 * a real template exists to catch.
 *
 * This is where a service closes that gap. The constraint sits beside the
 * reason in the same map, and every service reaches it the same way, so the
 * next one to need it has nothing to build.
 */
export class SimCfnSkippedProperties {
  private readonly rules: SimCfnSkippedPropertyRules;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly error: (reason: string) => Error;

  constructor(properties: SimCfnSkippedPropertiesProperties) {
    this.rules = properties.rules;
    this.properties = properties.properties;
    this.error = properties.error;
  }

  /**
   * Refuse the Resource where a skipped value is one real AWS would answer
   * with a 400.
   *
   * Every constraint runs before anything is recorded, so a Resource that
   * fails one leaves no half-written list of what it was created without.
   */
  assertConstraints(): void {
    for (const [name, value] of Object.entries(this.properties)) {
      this.constraintOn(name)?.({
        value,
        properties: this.properties,
        refuse: (reason) => {
          throw this.error(reason);
        },
      });
    }
  }

  /**
   * Why a property is skipped, or nothing where this service has no entry for
   * it.
   */
  reasonFor(name: string): string | undefined {
    const rule = this.rules.get(name);

    return typeof rule === "string" ? rule : rule?.reason;
  }

  private constraintOn(
    name: string,
  ): SimCfnSkippedPropertyConstraint | undefined {
    const rule = this.rules.get(name);

    return typeof rule === "string" ? undefined : rule?.constraint;
  }
}
