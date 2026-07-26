import {
  type BackgroundCompleter,
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimClock } from "../../util/clock/sim-clock.js";
import { SimClockControl } from "../../util/clock/sim-clock-control.js";
import { SimControllableClock } from "../../util/clock/sim-controllable-clock.js";

interface SimAwsTimekeepingProperties {
  readonly clock?: SimClock | undefined;
  readonly background?: (BackgroundScheduler & BackgroundCompleter) | undefined;
}

/**
 * Thrown when time control is asked of a simulation that does not own its clock.
 */
export class SimAwsTimeNotControllable extends Error {
  constructor() {
    super(
      "This SimAws cannot control its own time because it was constructed with a background scheduler, which brings its own clock. " +
        "Construct SimAws without a background scheduler, passing a clock instead if it needs a starting instant.",
    );
    this.name = "SimAwsTimeNotControllable";
  }
}

/**
 * How one simulation keeps time: the scheduler its work runs on, and control
 * over the clock that scheduler reads.
 *
 * Normally a simulation builds both, so its time can be moved. A caller who
 * supplies a ready-made background scheduler is supplying its clock too, and
 * that clock is not this simulation's to move, so time control is refused
 * rather than silently doing nothing.
 */
export class SimAwsTimekeeping {
  public readonly background: BackgroundScheduler & BackgroundCompleter;

  private readonly control: SimClockControl | undefined;

  constructor(properties: SimAwsTimekeepingProperties = {}) {
    if (properties.background !== undefined) {
      this.background = properties.background;
      this.control = undefined;

      return;
    }

    // Simulated time is layered over whatever clock was supplied, so a
    // simulation started at a fixed instant is still free to move from there.
    const clock = new SimControllableClock({ base: properties.clock });
    const background = new BackgroundTasks({ clock });

    this.background = background;
    this.control = new SimClockControl({ clock, background });
  }

  /**
   * Get control over this simulation's clock.
   */
  clockControl(): SimClockControl {
    if (this.control === undefined) {
      throw new SimAwsTimeNotControllable();
    }

    return this.control;
  }
}
