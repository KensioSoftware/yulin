import { simAthenaDatePatternParts } from "./sim-athena-date-pattern-parts.js";

/** The date fields a projection pattern can carry, finest last. */
export type SimAthenaDateUnit =
  | "YEARS"
  | "MONTHS"
  | "WEEKS"
  | "DAYS"
  | "HOURS"
  | "MINUTES"
  | "SECONDS";

/** One run of the same letter in a pattern, or a run of literal text. */
export interface SimAthenaDatePatternPart {
  readonly letter: string | undefined;
  readonly text: string;
}

const unitOfLetter: Readonly<Record<string, SimAthenaDateUnit>> = {
  y: "YEARS",
  M: "MONTHS",
  d: "DAYS",
  H: "HOURS",
  m: "MINUTES",
  s: "SECONDS",
};

/**
 * How fine each unit is, coarsest first.
 *
 * `WEEKS` is absent because no pattern letter writes one. A table asks for a
 * weekly step through `interval.unit`, never through its format.
 */
const unitOrder: readonly SimAthenaDateUnit[] = [
  "YEARS",
  "MONTHS",
  "DAYS",
  "HOURS",
  "MINUTES",
  "SECONDS",
];

/** Every unit a table may name in `projection.<column>.interval.unit`. */
const namedUnits: readonly SimAthenaDateUnit[] = [...unitOrder, "WEEKS"];

/**
 * The finest field a pattern carries, which is what one interval step moves.
 *
 * A table writing `yyyy/MM` projects a month at a time, and one writing
 * `yyyy-MM-dd` projects a day at a time.
 */
export function simAthenaPatternUnit(
  pattern: string,
): SimAthenaDateUnit | undefined {
  const units = simAthenaDatePatternParts(pattern)
    .map((part) =>
      part.letter === undefined ? undefined : unitOfLetter[part.letter],
    )
    .filter((unit) => unit !== undefined);

  return units.length === 0
    ? undefined
    : units.reduce((finest, unit) =>
        unitOrder.indexOf(unit) > unitOrder.indexOf(finest) ? unit : finest,
      );
}

/** Read the unit a name like `DAYS` or `DAY` refers to. */
export function simAthenaDateUnit(
  name: string | undefined,
): SimAthenaDateUnit | undefined {
  if (name === undefined) {
    return undefined;
  }

  const upper = name.toUpperCase();
  const plural = upper.endsWith("S") ? upper : `${upper}S`;

  return namedUnits.find((unit) => unit === plural);
}
