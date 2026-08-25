import { SimAthenaInvalidRequestException } from "../error/sim-athena.error.js";

const maximumNameLength = 128;

/**
 * The characters Athena takes in a workgroup name.
 */
const allowedName = /^[0-9a-zA-Z._-]+$/u;

/**
 * The workgroup every Account has without creating one.
 *
 * A request naming no workgroup runs in `primary`, and a named query created
 * without one belongs to it. Real Athena makes it with the Account, so this
 * simulation makes it with the scope.
 */
export const primaryWorkGroupName = "primary";

/**
 * Read and validate a workgroup name.
 */
export function requiredWorkGroupName(
  field: string,
  value: string | undefined,
): string {
  if (value === undefined || value === "") {
    throw new SimAthenaInvalidRequestException(`${field} is required`);
  }

  if (value.length > maximumNameLength) {
    throw new SimAthenaInvalidRequestException(
      `${field} is at most ${String(maximumNameLength)} characters, and this ` +
        `one is ${String(value.length)}`,
    );
  }

  if (!allowedName.test(value)) {
    throw new SimAthenaInvalidRequestException(
      `${field} '${value}' is not valid. A workgroup name is letters, ` +
        `digits, and the characters . _ and -`,
    );
  }

  return value;
}

/**
 * The workgroup a request runs against, which is `primary` when it names none.
 */
export function requestedWorkGroupName(value: string | undefined): string {
  if (value === undefined) {
    return primaryWorkGroupName;
  }

  return requiredWorkGroupName("WorkGroup", value);
}
