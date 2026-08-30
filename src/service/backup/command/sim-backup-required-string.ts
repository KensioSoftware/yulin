import { SimBackupMissingParameterValueException } from "../error/sim-backup.error.js";

/** Reads a required non-empty string from an AWS Backup request. */
export function requiredString(
  value: string | undefined,
  name: string,
): string {
  if (value === undefined || value.length === 0) {
    throw new SimBackupMissingParameterValueException(`${name} is required`);
  }

  return value;
}
