import type { DatabaseSync } from "node:sqlite";

import { assertDefined } from "../../../util/type-guard/defined.js";
import { SimAthenaSetUpError } from "../error/sim-athena.error.js";
import {
  isDateUnit,
  simAthenaDateAdded,
  simAthenaDateDifference,
} from "./sim-athena-date-units.js";
import {
  shimNumber,
  shimText,
  simAthenaScalarShim,
} from "./sim-athena-shim-registry.js";
import {
  simAthenaInstant,
  simAthenaRenderLike,
} from "./sim-athena-timestamp-text.js";

/**
 * Trino's date arithmetic, over ISO-8601 text.
 *
 * Each of these raises rather than guessing where it cannot answer faithfully.
 * A unit outside the ones Trino names and a value that is no ISO-8601 timestamp
 * both land there, and the engine turns the query down and lets the declared
 * result answer. A shim answering a null instead would be a wrong answer
 * wearing the shape of a right one.
 */
export function simAthenaInstallDateArithmeticShims(
  database: DatabaseSync,
): void {
  simAthenaScalarShim(database, "date_add", (unit, value, timestamp) => {
    const at = instantOf(timestamp);
    const moved = shimNumber(value);

    if (at === undefined || moved === undefined) {
      return null;
    }

    return simAthenaRenderLike(
      simAthenaDateAdded(unitOf(unit), moved, at.instant),
      at.text,
    );
  });

  simAthenaScalarShim(database, "date_diff", (unit, from, to) => {
    const start = instantOf(from);
    const end = instantOf(to);

    if (start === undefined || end === undefined) {
      return null;
    }

    return simAthenaDateDifference(unitOf(unit), start.instant, end.instant);
  });

  simAthenaScalarShim(database, "at_timezone", (timestamp, zone) =>
    inZone(instantOf(timestamp), shimText(zone)),
  );
}

/** One argument as an instant, with the text it was written as. */
function instantOf(
  value: unknown,
): { instant: number; text: string } | undefined {
  const text = shimText(value as never);

  if (text === undefined) {
    return undefined;
  }

  const instant = simAthenaInstant(text);

  assertDefined(instant, `${text} is no ISO-8601 timestamp`);

  return { instant, text };
}

function unitOf(value: unknown): string {
  const unit = shimText(value as never)?.toLowerCase() ?? "";

  return isDateUnit(unit)
    ? unit
    : raise(`${unit} is no date unit the engine reads`);
}

/**
 * Turn the query down.
 *
 * A shim that cannot answer faithfully raises, and the engine catches it and
 * lets the declared result answer. Answering a null instead would be a wrong
 * answer wearing the shape of a right one.
 */
function raise(reason: string): never {
  throw new SimAthenaSetUpError(reason);
}

/**
 * One instant read as the wall clock of another zone.
 *
 * Trino answers with a timestamp carrying the zone. There is nowhere to put one
 * here, so the answer is the wall clock alone, with any `Z` the value arrived
 * with taken off. A `Z` left on would say UTC over a time that is no longer in
 * it. A zone nobody has heard of raises out of `Intl`, and the query falls
 * back.
 */
function inZone(
  at: { instant: number; text: string } | undefined,
  zone: string | undefined,
): string | null {
  if (at === undefined || zone === undefined) {
    return null;
  }

  const shifted = new Date(at.instant).toLocaleString("sv-SE", {
    timeZone: zone,
    hour12: false,
  });

  return simAthenaRenderLike(
    Date.parse(`${shifted.replace(" ", "T")}Z`),
    at.text.replace(/Z$/u, ""),
  );
}
