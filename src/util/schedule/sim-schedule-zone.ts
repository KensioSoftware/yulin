import {
  simScheduleZoneClock,
  type SimScheduleZoneClock,
  type SimScheduleZoneParts,
} from "./sim-schedule-zone-clock.js";

const minuteMs = 60_000;

/**
 * The zone a schedule expression is read in.
 *
 * A cron expression names wall-clock fields, and which instants those are
 * depends on the zone the schedule was created with. Everything a schedule does
 * with a calendar therefore goes through one of these, and a schedule created
 * without a timezone gets the UTC one, which is what every schedule used to
 * get.
 */
export class SimScheduleZone {
  /**
   * The zone name as the request wrote it, which a describe reports back.
   */
  public readonly name: string;

  private readonly clock: SimScheduleZoneClock;

  private constructor(name: string, clock: SimScheduleZoneClock) {
    this.name = name;
    this.clock = clock;
  }

  /**
   * The zone a name calls for, refusing a name no zone answers to.
   */
  static of(name = "UTC"): SimScheduleZone {
    return new this(name, simScheduleZoneClock(name));
  }

  /**
   * What a clock in this zone reads at an instant.
   */
  partsAt(instant: number): SimScheduleZoneParts {
    return this.clock(instant);
  }

  /**
   * The instant a clock in this zone reads a wall-clock time at.
   *
   * Two offsets are in play on the day a zone changes one, so both are tried
   * and the answer is whichever of them the zone actually reads back. A time
   * the clocks read twice has two, and the earlier is the answer, which is the
   * one real Scheduler fires at. A time the clocks skip over has neither, and
   * the answer is the later of the two, which is the first instant after the
   * hour that never happened.
   */
  instantOf(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
  ): number {
    const wanted = Date.UTC(year, month, day, hour, minute);
    const candidates = this.candidatesFor(wanted);
    const read = candidates.filter(
      (candidate) => this.wallClockOf(candidate) === wanted,
    );

    return read.length === 0 ? Math.max(...candidates) : Math.min(...read);
  }

  /**
   * Whether an instant is the one this zone puts its own wall-clock reading at.
   *
   * The second of a repeated hour reads the same as the first and is not the
   * instant that reading resolves to, which is what tells the two apart.
   */
  isCanonical(instant: number): boolean {
    const read = this.clock(instant);

    return (
      this.instantOf(
        read.year,
        read.month,
        read.day,
        read.hour,
        read.minute,
      ) === instant
    );
  }

  /**
   * The instants a wall-clock time could be, under the offsets either side of
   * a change.
   */
  private candidatesFor(wanted: number): readonly number[] {
    const first = wanted - this.offsetAt(wanted);
    const second = wanted - this.offsetAt(first);

    return first === second ? [first] : [first, second];
  }

  /**
   * How far ahead of UTC this zone is at an instant, in milliseconds.
   */
  private offsetAt(instant: number): number {
    return (
      this.wallClockOf(instant) - Math.floor(instant / minuteMs) * minuteMs
    );
  }

  /**
   * What a clock in this zone reads at an instant, as a UTC instant of the same
   * wall-clock fields, which is what makes two readings comparable.
   */
  private wallClockOf(instant: number): number {
    const read = this.clock(instant);

    return Date.UTC(read.year, read.month, read.day, read.hour, read.minute);
  }
}
