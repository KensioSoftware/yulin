import { SimSchedulerValidationException } from "../error/sim-scheduler.error.js";

const enabled = "ENABLED";

const disabled = "DISABLED";

/**
 * Whether a schedule is invoking its target.
 */
export class SimSchedulerScheduleState {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * The state a schedule has when a request names none. AWS enables a new
   * schedule by default.
   */
  static default(): SimSchedulerScheduleState {
    return new this(enabled);
  }

  /**
   * Read the state a request names.
   */
  static of(value: string | undefined): SimSchedulerScheduleState {
    if (value === undefined) {
      return this.default();
    }

    if (value !== enabled && value !== disabled) {
      throw new SimSchedulerValidationException(
        `Invalid parameter: State Reason: '${value}' is not a schedule ` +
          `state. A schedule is ${enabled} or ${disabled}.`,
      );
    }

    return new this(value);
  }

  /**
   * Whether a schedule in this state invokes its target.
   */
  get isEnabled(): boolean {
    return this.value === enabled;
  }
}
