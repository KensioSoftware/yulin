import { SimIamNoSuchEntity } from "../error/sim-iam.error.js";

/**
 * Answer a value a command needs, or refuse the command with the error IAM
 * gives when it is absent.
 */
export function simIamDefined<T>(
  value: T | undefined,
  refusal: () => Error,
): T {
  if (value === undefined) {
    throw refusal();
  }

  return value;
}

/**
 * Refuse a command with the error IAM gives when a condition holds.
 */
export function simIamRefuseWhen(
  condition: boolean,
  refusal: () => Error,
): void {
  if (condition) {
    throw refusal();
  }
}

/**
 * Answer the entity a command named, or refuse the command the way IAM does
 * when it names one that is not there.
 */
export function simIamFound<T>(
  entity: T | undefined,
  kind: string,
  name: string,
): T {
  return simIamDefined(
    entity,
    () =>
      new SimIamNoSuchEntity(`The ${kind} with name ${name} cannot be found.`),
  );
}
