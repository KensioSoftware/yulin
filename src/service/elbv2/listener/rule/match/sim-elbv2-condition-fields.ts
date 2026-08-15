import type { SimElbV2ConditionValues } from "../../../command/rule/rule-condition.command.js";
import {
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "../../../error/sim-elbv2.error.js";
import { SimElbV2ConditionField } from "./sim-elbv2-condition-field.js";
import { SimElbV2HostHeaderMatcher } from "./sim-elbv2-host-header-matcher.js";
import { SimElbV2PathPatternMatcher } from "./sim-elbv2-path-pattern-matcher.js";

/**
 * The condition fields a rule here can be written on.
 *
 * These two cover most real routing, and both are matched when a request
 * arrives rather than only stored.
 */
const simulatedFields = new Map<string, SimElbV2ConditionField>([
  [
    "host-header",
    new SimElbV2ConditionField({
      config: (input): SimElbV2ConditionValues | undefined =>
        input.HostHeaderConfig,
      matcher: (values): SimElbV2HostHeaderMatcher =>
        new SimElbV2HostHeaderMatcher(values),
    }),
  ],
  [
    "path-pattern",
    new SimElbV2ConditionField({
      config: (input): SimElbV2ConditionValues | undefined =>
        input.PathPatternConfig,
      matcher: (values): SimElbV2PathPatternMatcher =>
        new SimElbV2PathPatternMatcher(values),
    }),
  ],
]);

/**
 * The condition fields real ELB has and nothing here matches on.
 *
 * They are held apart from a field ELB does not have at all, because the two
 * mean different things to whoever wrote the rule: one request is wrong, and
 * the other is right and goes further than this simulation does. Either way the
 * rule is refused when it is written, rather than stored and then never
 * claiming a request it was meant to claim.
 */
const unmatchedFields = new Set([
  "http-header",
  "http-request-method",
  "query-string",
  "source-ip",
]);

/**
 * Resolve the field a condition is written on, or refuse.
 */
export function requireSimElbV2ConditionField(
  field: string,
): SimElbV2ConditionField {
  const simulated = simulatedFields.get(field);

  if (simulated !== undefined) {
    return simulated;
  }

  const simulatedNames = simulatedFields.keys().toArray();

  if (unmatchedFields.has(field)) {
    throw new SimElbV2UnsimulatedInputException(
      `Condition field '${field}' is not simulated. Simulated fields are ` +
        `${simulatedNames.join(" and ")}.`,
    );
  }

  throw new SimElbV2ValidationError(
    `'${field}' is not a listener rule condition field. The fields are ` +
      `${[...simulatedNames, ...unmatchedFields].join(", ")}.`,
  );
}
