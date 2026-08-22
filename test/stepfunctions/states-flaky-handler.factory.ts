import { MappedFactory } from "@kensio/part-factory";

import type { SimLambdaHandler } from "../../src/service/lambda/function/sim-lambda-handler.type.js";

/**
 * What a `Retry` test asks for when it wants a function that fails and then
 * comes good.
 */
export interface StatesFlakyHandlerInput {
  /**
   * How many of the first calls raise. A handler given more failures than the
   * retriers allow attempts never answers at all.
   */
  readonly failures: number;

  /**
   * What one of those calls raises, given which call it is counting from one.
   * A function failing two ways in turn is written here.
   */
  readonly raises: (call: number) => Error;

  /**
   * What the first call that does not raise answers with.
   */
  readonly answers: unknown;
}

/**
 * Creates a Lambda handler that raises a number of times before it answers.
 *
 * ```typescript
 * const handler = statesFlakyHandlerFactory.make({ failures: 2 });
 * ```
 *
 * Each handler counts its own calls, so two tests sharing this factory are not
 * sharing a count.
 */
export const statesFlakyHandlerFactory = new MappedFactory<
  StatesFlakyHandlerInput,
  SimLambdaHandler
>(
  () => ({
    failures: 1,
    raises: (): Error => new Error("the enrolment service is down"),
    answers: { eligible: true },
  }),
  (input) => {
    let called = 0;

    return (): unknown => {
      called += 1;

      if (called <= input.failures) {
        throw input.raises(called);
      }

      return input.answers;
    };
  },
);
