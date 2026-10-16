/** One statement translated for SQLite, or why it was not. */
export type SimAthenaTranslatedSql =
  | {
      readonly sql: string;

      /**
       * The decimal places each result column was rounded to, by position.
       *
       * Read here because the syntax tree is the only place that knows, and
       * the tree is gone by the time the answer is rendered.
       */
      readonly scales: ReadonlyMap<number, number>;
      readonly turnedDown: undefined;
      readonly rejected: undefined;
    }
  | {
      readonly sql: undefined;
      readonly scales: undefined;
      readonly turnedDown: string;
      readonly rejected: undefined;
    }
  | {
      readonly sql: undefined;
      readonly scales: undefined;
      readonly turnedDown: undefined;
      readonly rejected: string;
    };

/** One statement written out for SQLite, with the scales read off its tree. */
export function simAthenaTranslated(
  sql: string,
  scales: ReadonlyMap<number, number>,
): SimAthenaTranslatedSql {
  return { sql, scales, turnedDown: undefined, rejected: undefined };
}

/** One statement the engine turned down, and why. */
export function simAthenaTurnedDownSql(
  turnedDown: string,
): SimAthenaTranslatedSql {
  return { sql: undefined, scales: undefined, turnedDown, rejected: undefined };
}

/** One statement Athena refuses, and why. */
export function simAthenaRejectedSql(rejected: string): SimAthenaTranslatedSql {
  return { sql: undefined, scales: undefined, turnedDown: undefined, rejected };
}
