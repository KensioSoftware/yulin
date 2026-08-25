import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";

/**
 * Read a field a named query request cannot do without.
 */
export function requiredNamedQueryField(
  field: string,
  value: string | undefined,
): string {
  if (value === undefined || value === "") {
    throw new SimAthenaInvalidRequestException(`${field} is required`);
  }

  return value;
}
