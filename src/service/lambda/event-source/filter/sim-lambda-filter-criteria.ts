import { SimEventPattern } from "../../../eventbridge/pattern/sim-event-pattern.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import { isRecord } from "../../../../util/type-guard/record.js";

/**
 * The `FilterCriteria` a CreateEventSourceMapping request carries, as the
 * command takes it.
 */
export interface SimLambdaFilterCriteriaInput {
  readonly Filters?:
    | readonly { readonly Pattern?: string | undefined }[]
    | undefined;
}

/**
 * The one key an SQS mapping may filter on.
 *
 * Real Lambda filters an SQS message on its body alone, where a stream mapping
 * filters on the whole record. A pattern naming anything else is refused here,
 * since accepting one would match nothing and read as a pattern that was
 * simply too specific.
 */
const sqsFilterKey = "body";

/**
 * Read a `FilterCriteria` value of unknown shape, as a template carries one.
 *
 * The same shape check for an SDK request and a CloudFormation Resource, so a
 * mapping a template deployed filters the way an SDK caller's would.
 */
export function simLambdaFilterCriteriaInput(
  value: unknown,
): SimLambdaFilterCriteriaInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  const filters = isRecord(value) ? value["Filters"] : undefined;

  if (!Array.isArray(filters)) {
    throw new SimLambdaInvalidParameterValueException(
      `FilterCriteria carries a Filters list, and this one carries ${JSON.stringify(
        value,
      )}`,
    );
  }

  return { Filters: filters.map((filter) => ({ Pattern: patternIn(filter) })) };
}

/**
 * The pattern one filter of a list carries.
 */
function patternIn(filter: unknown): string | undefined {
  const pattern = isRecord(filter) ? filter["Pattern"] : undefined;

  if (pattern !== undefined && typeof pattern !== "string") {
    throw new SimLambdaInvalidParameterValueException(
      "A filter in FilterCriteria carries a Pattern string, and this one " +
        `carries ${JSON.stringify(pattern)}`,
    );
  }

  return pattern;
}

/**
 * The filters a mapping delivers through, read from what a request asked for.
 *
 * A record is delivered when any one of the filters matches it, which is how
 * real Lambda ORs a list of patterns together. A mapping with no criteria has
 * none of these, and delivers everything.
 *
 * The patterns are EventBridge event patterns. Lambda documents its filter
 * rules as EventBridge's own syntax, so simulated EventBridge's matcher is what
 * evaluates them, down to the operators it refuses.
 */
export class SimLambdaFilterCriteria {
  private readonly patterns: readonly SimEventPattern[];

  private constructor(patterns: readonly SimEventPattern[]) {
    this.patterns = patterns;
  }

  /**
   * Read the criteria a request carries, refusing a pattern this simulation
   * cannot evaluate.
   *
   * The refusal comes before the mapping exists, because a mapping created
   * with a filter it cannot apply would deliver the wrong records rather than
   * none.
   */
  static of(
    criteria: SimLambdaFilterCriteriaInput | undefined,
    eventSourceKind: string,
  ): SimLambdaFilterCriteria | undefined {
    const filters = criteria?.Filters ?? [];

    if (filters.length === 0) {
      return undefined;
    }

    return new this(
      filters.map((filter) => patternOf(filter.Pattern, eventSourceKind)),
    );
  }

  /**
   * The criteria as Create, Get and List report them back.
   */
  configuration(): SimLambdaFilterCriteriaInput {
    return {
      Filters: this.patterns.map((pattern) => ({ Pattern: pattern.source })),
    };
  }

  /**
   * Whether a record, as a pattern reads it, passes any of these filters.
   */
  matches(document: Record<string, unknown>): boolean {
    return this.patterns.some((pattern) => pattern.matches(document));
  }
}

/**
 * One filter's pattern, refused as a Lambda parameter rather than as an
 * EventBridge one.
 *
 * The matcher is EventBridge's and says so when it refuses a pattern, and the
 * caller here sent a Lambda request. The reason survives and the exception type
 * changes.
 */
function patternOf(
  source: string | undefined,
  eventSourceKind: string,
): SimEventPattern {
  if (source === undefined || source === "") {
    throw new SimLambdaInvalidParameterValueException(
      "A filter in FilterCriteria carries a Pattern, and this one carries " +
        "none",
    );
  }

  refuseUnfilterableKeys(source, eventSourceKind);

  try {
    return SimEventPattern.of(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new SimLambdaInvalidParameterValueException(
      `FilterCriteria pattern ${source} cannot be evaluated. ${reason}`,
    );
  }
}

/**
 * Refuse a pattern naming a key the event source does not filter on.
 */
function refuseUnfilterableKeys(source: string, eventSourceKind: string): void {
  if (eventSourceKind !== "sqs") {
    return;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch {
    // An unparseable pattern is the matcher's refusal to make, in its own
    // words, and it is about to make it.
    return;
  }

  const named = isRecord(parsed) ? Object.keys(parsed) : [];
  const unfilterable = named.filter((key) => key !== sqsFilterKey);

  if (unfilterable.length > 0) {
    throw new SimLambdaInvalidParameterValueException(
      `FilterCriteria on an SQS event source mapping filters on ${sqsFilterKey} alone, and this pattern names ${unfilterable.join(", ")}`,
    );
  }
}
