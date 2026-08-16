import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simCloudWatchAlarmArn } from "./sim-cloudwatch-alarm-arn.js";
import type { SimCloudWatchAlarmDefinition } from "./sim-cloudwatch-alarm-definition.js";
import { SimCloudWatchAlarmHistory } from "./sim-cloudwatch-alarm-history.js";
import type { SimCloudWatchAlarmState } from "./sim-cloudwatch-alarm-state.js";

interface SimCloudWatchAlarmProperties {
  readonly definition: SimCloudWatchAlarmDefinition;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly createdAt: Date;
}

/**
 * What one state change did to an alarm.
 */
export interface SimCloudWatchAlarmTransition {
  readonly previousState: SimCloudWatchAlarmState;
  readonly state: SimCloudWatchAlarmState;
  readonly reason: string;
  readonly at: Date;
}

/**
 * One alarm in a simulated CloudWatch scope: what it watches, where it stands,
 * and how it got there.
 *
 * A new alarm is in INSUFFICIENT_DATA, as it is on real CloudWatch, because it
 * has not evaluated a period yet. That is a real state and not a placeholder,
 * so it is recorded as the state the first transition came from.
 */
export class SimCloudWatchAlarm {
  readonly arn: string;
  readonly history = new SimCloudWatchAlarmHistory();

  #definition: SimCloudWatchAlarmDefinition;
  #state: SimCloudWatchAlarmState = "INSUFFICIENT_DATA";
  #stateReason = "Unchecked: initial alarm creation";
  #stateUpdatedAt: Date;
  #configurationUpdatedAt: Date;

  constructor(properties: SimCloudWatchAlarmProperties) {
    this.#definition = properties.definition;
    this.#stateUpdatedAt = properties.createdAt;
    this.#configurationUpdatedAt = properties.createdAt;
    this.arn = simCloudWatchAlarmArn(
      properties.accountRegionScope,
      properties.definition.alarmName,
    );
  }

  get definition(): SimCloudWatchAlarmDefinition {
    return this.#definition;
  }

  get name(): string {
    return this.#definition.alarmName;
  }

  get state(): SimCloudWatchAlarmState {
    return this.#state;
  }

  get stateReason(): string {
    return this.#stateReason;
  }

  get stateUpdatedAt(): Date {
    return this.#stateUpdatedAt;
  }

  get configurationUpdatedAt(): Date {
    return this.#configurationUpdatedAt;
  }

  /**
   * Take a new configuration, keeping the state and history.
   *
   * Real PutMetricAlarm on an existing name updates the alarm rather than
   * replacing it, and an alarm that was in ALARM stays there until it next
   * evaluates.
   */
  redefine(definition: SimCloudWatchAlarmDefinition, at: Date): void {
    this.#definition = definition;
    this.#configurationUpdatedAt = at;
  }

  /**
   * Move to a state, recording the transition, or do nothing if it is already
   * there.
   *
   * Answering with the transition rather than firing anything keeps this about
   * the alarm's own state: whether the change should reach an SNS topic is a
   * question about actions, and the caller is what knows it.
   */
  moveTo(
    state: SimCloudWatchAlarmState,
    reason: string,
    at: Date,
  ): SimCloudWatchAlarmTransition | undefined {
    if (state === this.#state) {
      return undefined;
    }

    const transition = {
      previousState: this.#state,
      state,
      reason,
      at,
    };

    this.#state = state;
    this.#stateReason = reason;
    this.#stateUpdatedAt = at;
    this.history.record({
      timestamp: at,
      previousState: transition.previousState,
      state,
      reason,
    });

    return transition;
  }
}
