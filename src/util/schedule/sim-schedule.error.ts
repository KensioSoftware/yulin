/**
 * A schedule expression the dialect reading it will not take.
 *
 * Parsing lives apart from any one service, so what it throws is generic and
 * whoever asked for the parse turns it into their own API error. That is what
 * lets two services share a parser and still refuse a bad expression the way
 * each of their callers expects.
 */
export class SimScheduleExpressionError extends Error {}

/**
 * A schedule expression that real AWS takes and this simulation does not.
 *
 * Held apart from a plain refusal because the two mean different things to
 * whoever reads them: one says the expression is wrong, and this one says the
 * expression is right and the simulator does not go that far.
 */
export class SimUnsimulatedScheduleExpressionError extends SimScheduleExpressionError {}
