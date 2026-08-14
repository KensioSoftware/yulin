import { SimAtExpression } from "./at/sim-at-expression.js";
import { SimCronExpression } from "./cron/sim-cron-expression.js";
import { SimRateExpression } from "./rate/sim-rate-expression.js";
import type { SimScheduleDialect } from "./sim-schedule-dialect.js";
import { SimScheduleExpressionError } from "./sim-schedule.error.js";

/**
 * Something that knows when it next falls due.
 *
 * A rate always has a next occurrence and a cron expression need not, which is
 * why the answer is optional here even though only one of the two ever declines
 * to give one.
 */
interface SimScheduleOccurrences {
  nextAfter(instant: Date): Date | undefined;
}

const expression = /^(?<kind>[a-z]+)\((?<body>.*)\)$/su;

/**
 * One schedule expression, whichever form it was written in.
 *
 * The two forms answer the same question and answer it differently: a rate
 * counts from where it is asked, and a cron expression names absolute instants
 * and ignores where it is asked from beyond needing somewhere to start.
 */
export class SimSchedule {
  /**
   * The expression as it was written, which a describe reports back.
   */
  public readonly source: string;

  private readonly occurrences: SimScheduleOccurrences;

  private constructor(source: string, occurrences: SimScheduleOccurrences) {
    this.source = source;
    this.occurrences = occurrences;
  }

  /**
   * Read a schedule expression under a dialect's rules.
   */
  static of(source: string, dialect: SimScheduleDialect): SimSchedule {
    const read = expression.exec(source.trim())?.groups;

    if (read === undefined) {
      throw new SimScheduleExpressionError(
        `a schedule expression is 'rate(<value> <unit>)' or ` +
          `'cron(<fields>)', and this one is '${source}'`,
      );
    }

    return new this(source, this.occurrencesOf(read, dialect));
  }

  /**
   * Read the body of whichever form the expression was written in.
   */
  private static occurrencesOf(
    read: Partial<Record<string, string>>,
    dialect: SimScheduleDialect,
  ): SimScheduleOccurrences {
    const body = read["body"] ?? "";

    if (read["kind"] === "rate") {
      return SimRateExpression.of(body, dialect.requiresRateAgreement);
    }

    if (read["kind"] === "cron") {
      return SimCronExpression.of(dialect.cronFields, body);
    }

    if (read["kind"] === "at" && dialect.allowsOneTime) {
      return SimAtExpression.of(body);
    }

    throw new SimScheduleExpressionError(
      `a schedule expression is a ${dialect.allowsOneTime ? "'at(...)', a " : ""}` +
        `'rate(...)' or a 'cron(...)', and this one is a ` +
        `'${String(read["kind"])}(...)'`,
    );
  }

  /**
   * The next instant this schedule falls due after an instant, or nothing when
   * it never falls due again.
   */
  nextAfter(instant: Date): Date | undefined {
    return this.occurrences.nextAfter(instant);
  }
}
