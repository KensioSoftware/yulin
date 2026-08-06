import type { Brand } from "../../util/brand.type.js";
import { faker } from "@faker-js/faker";

/**
 * The ID of a simulated AWS Account.
 *
 * Everything that takes an Account ID also takes a plain string, so this is a
 * name for the type rather than a requirement to use it.
 */
export type SimAwsAccountId = Brand<string, "SimAwsAccountId">;

/** An AWS Account ID is twelve digits, with leading zeroes kept. */
const accountIdPattern = /^\d{12}$/u;

/**
 * Thrown for a value that cannot be an AWS Account ID.
 */
export class SimInvalidAwsAccountId extends Error {
  constructor(value: unknown) {
    super(
      `Invalid simulated AWS Account ID "${String(value)}": an AWS Account ID is 12 digits`,
    );
    this.name = "SimInvalidAwsAccountId";
  }
}

/**
 * Narrow a value to an AWS Account ID.
 */
export function isSimAwsAccountId(value: unknown): value is SimAwsAccountId {
  return typeof value === "string" && accountIdPattern.test(value);
}

/**
 * Name an AWS Account ID, refusing anything that is not one.
 */
export function simAwsAccountId(value: string): SimAwsAccountId {
  if (!isSimAwsAccountId(value)) {
    throw new SimInvalidAwsAccountId(value);
  }

  return value;
}

/**
 * Generate a fake AWS Account ID, for a test that wants an arbitrary one.
 */
export function makeSimAwsAccountId(): SimAwsAccountId {
  return simAwsAccountId(faker.string.numeric({ length: 12 }));
}
