import type { SimCfnSkippedPropertyValue } from "../../../cloudformation/resource/ignore/sim-cfn-skipped-property.type.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

const minimumReuseSeconds = 60;
const maximumReuseSeconds = 86_400;

/**
 * The range real SQS accepts for `KmsDataKeyReusePeriodSeconds`.
 *
 * Encryption itself is not simulated. The property is recorded against the
 * Resource and the queue is created without it, and no key is ever asked for.
 * How long the value says to reuse one is still read, because a period outside
 * this range is one real SQS answers with `InvalidAttributeValue`, and
 * CloudFormation fails the stack on it at CreateQueue. A queue that deployed
 * here would report a template AWS refuses as working.
 *
 * The bound is the one the SQS API documents, a minute at the short end and a
 * day at the long one.
 */
export function validateSimCfnSqsKmsDataKeyReusePeriod(
  declared: SimCfnSkippedPropertyValue,
): void {
  const stated = declared.value;
  const seconds =
    typeof stated === "number" || typeof stated === "string"
      ? Number(stated)
      : NaN;

  if (
    Number.isSafeInteger(seconds) &&
    seconds >= minimumReuseSeconds &&
    seconds <= maximumReuseSeconds
  ) {
    return;
  }

  declared.refuse(
    `KmsDataKeyReusePeriodSeconds ${stringified(stated)} is outside the ` +
      `${String(minimumReuseSeconds)} to ${String(maximumReuseSeconds)} ` +
      `seconds real SQS accepts`,
  );
}

/** The value as a refusal names it, whatever shape the template gave it. */
function stringified(value: SimCfnTemplateValue): string {
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
