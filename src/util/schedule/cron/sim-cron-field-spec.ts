/**
 * What one field of a cron expression takes.
 *
 * A dialect is a list of these, in field order, which is what keeps the parser
 * from having any one service's cron rules baked into it. The ranges are the
 * same in most dialects and which wildcards a field allows is not, so both are
 * described here rather than assumed.
 */
export interface SimCronFieldSpec {
  /**
   * What to call this field in a refusal, as its own documentation names it.
   */
  readonly name: string;

  readonly minimum: number;
  readonly maximum: number;

  /**
   * The names this field takes in place of numbers, such as `JAN` for 1.
   */
  readonly aliases: ReadonlyMap<string, number>;

  /**
   * Whether `?`, meaning "any", may be written in this field.
   */
  readonly allowsAny: boolean;

  /**
   * Whether `/`, meaning "in steps of", may be written in this field.
   */
  readonly allowsStep: boolean;
}

const monthNames = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/**
 * Sunday first, so `1` is Sunday and `7` is Saturday, which is how AWS numbers
 * the day-of-week field. Unix cron numbers it from zero, and a rule written for
 * one and read by the other is off by a day.
 */
const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * The names a field takes, numbered from one.
 */
function aliasesFor(names: readonly string[]): ReadonlyMap<string, number> {
  return new Map(names.map((name, index) => [name, index + 1]));
}

/**
 * The six fields of an AWS cron expression: minutes, hours, day-of-month,
 * month, day-of-week and year.
 *
 * This is the shape both EventBridge and EventBridge Scheduler use. A dialect
 * that wanted different ranges would write its own list rather than change this
 * one.
 */
export const awsCronFieldSpecs: readonly SimCronFieldSpec[] = [
  {
    name: "minutes",
    minimum: 0,
    maximum: 59,
    aliases: new Map(),
    allowsAny: false,
    allowsStep: true,
  },
  {
    name: "hours",
    minimum: 0,
    maximum: 23,
    aliases: new Map(),
    allowsAny: false,
    allowsStep: true,
  },
  {
    name: "day-of-month",
    minimum: 1,
    maximum: 31,
    aliases: new Map(),
    allowsAny: true,
    allowsStep: true,
  },
  {
    name: "month",
    minimum: 1,
    maximum: 12,
    aliases: aliasesFor(monthNames),
    allowsAny: false,
    allowsStep: true,
  },
  {
    name: "day-of-week",
    minimum: 1,
    maximum: 7,
    aliases: aliasesFor(dayNames),
    allowsAny: true,
    allowsStep: false,
  },
  {
    name: "year",
    minimum: 1970,
    maximum: 2199,
    aliases: new Map(),
    allowsAny: false,
    allowsStep: true,
  },
];
