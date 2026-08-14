import type { SimCronFieldSpec } from "./cron/sim-cron-field-spec.js";

/**
 * One service's rules for reading a schedule expression.
 *
 * `rate(...)` and `cron(...)` look the same across AWS and are not read
 * identically: EventBridge insists a rate's unit agrees with its value, and
 * EventBridge Scheduler does not. Keeping the differences here is what lets one
 * parser serve both, rather than one service's rules being the parser's.
 */
export interface SimScheduleDialect {
  /**
   * The fields of a cron expression, in order.
   */
  readonly cronFields: readonly SimCronFieldSpec[];

  /**
   * Whether a rate's unit has to agree with its value, so that `rate(1 hours)`
   * is refused rather than read as one hour.
   */
  readonly requiresRateAgreement: boolean;
}
