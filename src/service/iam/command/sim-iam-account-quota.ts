import {
  SimIamEntityAlreadyExists,
  SimIamLimitExceeded,
} from "../error/sim-iam.error.js";
import { simIamRefuseWhen } from "./sim-iam-found.js";

/**
 * The most of each kind of entity one Account holds, at IAM's defaults.
 *
 * https://docs.aws.amazon.com/general/latest/gr/iam-service.html
 */
export const simIamAccountQuotas = {
  Roles: 1000,
  Users: 5000,
  Groups: 300,
  Policies: 1500,
  InstanceProfiles: 1000,
} as const;

export type SimIamAccountQuotaKind = keyof typeof simIamAccountQuotas;

/**
 * Refuse creating an entity in an Account already holding as many of its
 * kind as IAM allows.
 */
export function assertSimIamAccountQuota(
  kind: SimIamAccountQuotaKind,
  held: number,
): void {
  // oxlint-disable-next-line security/detect-object-injection -- kind is one of the fixed keys above.
  const limit = simIamAccountQuotas[kind];

  simIamRefuseWhen(
    held >= limit,
    () =>
      new SimIamLimitExceeded(
        `Cannot exceed quota for ${kind}PerAccount: ${String(limit)}`,
      ),
  );
}

/**
 * Refuse a name another entity of the same kind already has. IAM keeps a
 * name as given, and holds names apart regardless of case.
 */
export function assertSimIamNameFree(
  names: Iterable<string>,
  name: string,
  message: string,
): void {
  const lower = name.toLowerCase();

  simIamRefuseWhen(
    [...names].some((each) => each.toLowerCase() === lower),
    () => new SimIamEntityAlreadyExists(message),
  );
}

/**
 * How IAM refuses a name its kind already holds.
 */
const alreadyExists: Readonly<
  Record<SimIamAccountQuotaKind, (name: string) => string>
> = {
  Roles: (name) => `Role with name ${name} already exists.`,
  Users: (name) => `User with name ${name} already exists.`,
  Groups: (name) => `Group with name ${name} already exists.`,
  Policies: (name) =>
    `A policy called ${name} already exists. Duplicate names are not allowed.`,
  InstanceProfiles: (name) => `Instance Profile ${name} already exists.`,
};

/**
 * Refuse a new entity whose name its kind already holds, or which the
 * Account has no room left for.
 */
export function assertSimIamNewEntity(
  kind: SimIamAccountQuotaKind,
  names: Iterable<string>,
  name: string,
): void {
  const held = [...names];

  // oxlint-disable-next-line security/detect-object-injection -- kind is one of the fixed keys above.
  assertSimIamNameFree(held, name, alreadyExists[kind](name));
  assertSimIamAccountQuota(kind, held.length);
}
