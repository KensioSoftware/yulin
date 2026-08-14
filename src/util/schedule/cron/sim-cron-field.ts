import { boundsOf, stepOf } from "./sim-cron-field-bounds.js";
import type { SimCronFieldSpec } from "./sim-cron-field-spec.js";
import { cronRepeatedStep, cronUnexpectedAny } from "./sim-cron-refusals.js";

/**
 * Every value a range covers, counting around the end of the field.
 *
 * A range whose start is after its end wraps, so hours `20-2` is ten at night
 * through two in the morning rather than nothing at all.
 */
function rangeValues(
  spec: SimCronFieldSpec,
  [from, to]: readonly [number, number],
  step: number,
): number[] {
  const span = spec.maximum - spec.minimum + 1;
  const covered = from <= to ? to - from : span - (from - to);
  const values: number[] = [];

  for (let offset = 0; offset <= covered; offset += step) {
    values.push(spec.minimum + ((from - spec.minimum + offset) % span));
  }

  return values;
}

/**
 * Every value one comma separated part of a field covers.
 */
function partValues(spec: SimCronFieldSpec, part: string): readonly number[] {
  const [written = "", step, ...extra] = part.split("/");

  if (extra.length > 0) {
    throw cronRepeatedStep(spec, part);
  }

  return rangeValues(
    spec,
    boundsOf(spec, written, step !== undefined),
    step === undefined ? 1 : stepOf(spec, step),
  );
}

/**
 * Every value a whole field covers.
 */
function fieldValues(spec: SimCronFieldSpec, source: string): Set<number> {
  const allowed = new Set<number>();

  for (const part of source.split(",")) {
    for (const value of partValues(spec, part)) {
      allowed.add(value);
    }
  }

  return allowed;
}

/**
 * One field of a cron expression, read into the values it allows.
 *
 * Whether a field was written as `?` is kept, because that is not a fact about
 * which values it allows: `?` and `*` allow the same ones, and only `?` says
 * "this field is not the one deciding the day".
 */
export class SimCronField {
  /**
   * Whether this field was written as `?`, meaning "any".
   */
  public readonly isAny: boolean;

  /**
   * The highest value this field's position takes, whether or not it is
   * allowed. A search for the next occurrence stops once it has run past the
   * highest year, so it needs to know what that is.
   */
  public readonly maximum: number;

  private readonly allowed: ReadonlySet<number>;

  private constructor(
    isAny: boolean,
    maximum: number,
    allowed: ReadonlySet<number>,
  ) {
    this.isAny = isAny;
    this.maximum = maximum;
    this.allowed = allowed;
  }

  /**
   * Read one field of an expression against what its position takes.
   */
  static of(spec: SimCronFieldSpec, source: string): SimCronField {
    if (source !== "?") {
      return new this(false, spec.maximum, fieldValues(spec, source));
    }

    if (!spec.allowsAny) {
      throw cronUnexpectedAny(spec);
    }

    return new this(
      true,
      spec.maximum,
      new Set(rangeValues(spec, [spec.minimum, spec.maximum], 1)),
    );
  }

  /**
   * Whether this field allows a value.
   */
  allows(value: number): boolean {
    return this.allowed.has(value);
  }
}
