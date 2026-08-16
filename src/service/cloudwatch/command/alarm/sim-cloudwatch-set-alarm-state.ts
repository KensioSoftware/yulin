import {
  simCloudWatchAlarmStates,
  type SimCloudWatchAlarmState,
} from "../../alarm/sim-cloudwatch-alarm-state.js";
import { SimCloudWatchInvalidParameterValueException } from "../../error/sim-cloudwatch.error.js";
import { requiredSimCloudWatchName } from "../../metric/sim-cloudwatch-name.js";
import { requiredSimCloudWatchValue } from "./sim-cloudwatch-alarm-numbers.js";
import type { SimCloudWatchRequestOptions } from "../sim-cloudwatch-request-options.js";
import type { SimCloudWatchAlarmContext } from "./sim-cloudwatch-alarm-context.js";
import type {
  SimSetAlarmStateCommand,
  SimSetAlarmStateCommandOutput,
} from "./alarm.command.js";

const setAlarmStateAction = "cloudwatch:SetAlarmState";

/**
 * The command that forces an alarm into a state, firing that state's actions.
 *
 * This is how a test exercises a subscriber without publishing a metric at
 * all, and it is temporary on real CloudWatch too: the next evaluation
 * overwrites whatever was set here.
 */
export class SimCloudWatchSetAlarmState {
  readonly #context: SimCloudWatchAlarmContext;

  constructor(context: SimCloudWatchAlarmContext) {
    this.#context = context;
  }

  /**
   * Move one alarm to a state, whatever its metric says.
   */
  async handle(
    command: SimSetAlarmStateCommand,
    options?: SimCloudWatchRequestOptions,
  ): Promise<SimSetAlarmStateCommandOutput> {
    const alarmName = requiredSimCloudWatchName(
      "AlarmName",
      command.input.AlarmName,
    );
    const state = requiredAlarmState(command.input.StateValue);

    // Real SetAlarmState requires a reason, so an alarm here never carries one
    // this simulation made up on the caller's behalf.
    const stateReason = requiredSimCloudWatchValue(
      "StateReason",
      command.input.StateReason,
    );

    this.#context.authorizer.authorizeAlarm(
      setAlarmStateAction,
      alarmName,
      options?.caller,
    );

    const alarm = this.#context.alarms.find(alarmName);

    if (alarm === undefined) {
      throw new SimCloudWatchInvalidParameterValueException(
        `The alarm ${alarmName} does not exist in this account and region.`,
      );
    }

    const transition = alarm.moveTo(
      state,
      stateReason,
      this.#context.clock.now(),
    );

    if (transition !== undefined) {
      await this.#context.actions.fire(alarm, transition);
    }

    return { $metadata: {} };
  }
}

function requiredAlarmState(state?: string): SimCloudWatchAlarmState {
  const found = simCloudWatchAlarmStates.find((one) => one === state);

  if (found === undefined) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter StateValue must be one of ` +
        `${simCloudWatchAlarmStates.join(", ")}.`,
    );
  }

  return found;
}
