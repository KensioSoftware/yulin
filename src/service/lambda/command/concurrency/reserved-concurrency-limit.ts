import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";

/**
 * The concurrent executions an account has in a Region by default.
 */
const regionalConcurrencyLimit = 1000;

/**
 * The concurrency real Lambda keeps unreserved for the functions that reserve
 * none.
 */
const minimumUnreserved = 100;

/**
 * The reservation a PutFunctionConcurrency request asks for, refusing one
 * that is not a whole number, or that would leave the account less than the
 * unreserved concurrency real Lambda keeps back.
 *
 * The functions of this Account and Region are what the reservations are
 * counted across, and the function being changed is counted at its new value.
 */
export function simLambdaReservedConcurrencyIn(
  requested: number | undefined,
  simFunction: SimLambdaFunction,
  functions: Iterable<SimLambdaFunction>,
): number {
  if (
    requested === undefined ||
    !Number.isSafeInteger(requested) ||
    requested < 0
  ) {
    throw new SimLambdaInvalidParameterValueException(
      "ReservedConcurrentExecutions must be a whole number of at least 0, " +
        `and the request carried ${String(requested)}`,
    );
  }

  const reservedElsewhere = [...functions]
    .filter((other) => other !== simFunction)
    .reduce((sum, other) => sum + (other.concurrency.reserved ?? 0), 0);

  if (
    regionalConcurrencyLimit - reservedElsewhere - requested <
    minimumUnreserved
  ) {
    throw new SimLambdaInvalidParameterValueException(
      `Specified ReservedConcurrentExecutions for function decreases account's ` +
        `UnreservedConcurrentExecution below its minimum value of ` +
        `[${String(minimumUnreserved)}].`,
    );
  }

  return requested;
}

/**
 * The Region's concurrency limit, and what the functions' reservations leave
 * of it for the functions that reserve none.
 */
export function simLambdaUnreservedConcurrency(
  functions: Iterable<SimLambdaFunction>,
): { readonly limit: number; readonly unreserved: number } {
  const reserved = [...functions].reduce(
    (sum, simFunction) => sum + (simFunction.concurrency.reserved ?? 0),
    0,
  );

  return {
    limit: regionalConcurrencyLimit,
    unreserved: regionalConcurrencyLimit - reserved,
  };
}
