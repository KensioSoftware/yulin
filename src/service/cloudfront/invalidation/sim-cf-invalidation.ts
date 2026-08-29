import { faker } from "@faker-js/faker";

import type { Brand } from "../../../util/brand.type.js";
import { simCfInvalidationPath } from "./sim-cf-invalidation-path.js";

export type SimCfInvalidationId = Brand<string, "SimCfInvalidationId">;

/**
 * How far an invalidation has got.
 *
 * CloudFront answers CreateInvalidation with `InProgress` and moves the
 * invalidation to `Completed` once every edge has been told, the way a
 * Distribution reaches `Deployed`.
 */
export type SimCfInvalidationStatus = "InProgress" | "Completed";

interface SimCfInvalidationProperties {
  readonly invalidationId: SimCfInvalidationId;
  readonly callerReference: string;
  readonly paths: readonly string[];
  readonly createTime: Date;
}

/**
 * One simulated CloudFront invalidation.
 *
 * An invalidation is the batch of paths a caller asked to be cleared, plus
 * where clearing them has got to. It belongs to the Distribution it was
 * created against, which is what GetInvalidation and ListInvalidations read it
 * back from.
 */
export class SimCfInvalidation {
  public readonly invalidationId: SimCfInvalidationId;
  public readonly callerReference: string;
  public readonly paths: readonly string[];
  public readonly createTime: Date;

  #status: SimCfInvalidationStatus = "InProgress";

  constructor(properties: SimCfInvalidationProperties) {
    this.invalidationId = properties.invalidationId;
    this.callerReference = properties.callerReference;
    this.paths = properties.paths;
    this.createTime = properties.createTime;
  }

  /**
   * Whether this invalidation is still running.
   */
  get status(): SimCfInvalidationStatus {
    return this.#status;
  }

  /**
   * Move this invalidation into Completed status.
   */
  completeInvalidation(): Promise<void> {
    this.#status = "Completed";

    return Promise.resolve();
  }

  /**
   * Whether a batch names the same paths as this one did.
   *
   * This is what decides whether a repeated `CallerReference` answers with the
   * invalidation already created or is refused. The paths are compared in the
   * order they were sent, since that is the batch CloudFront was given, and
   * each one is read the way an invalidation reads it, so `*` and `/*` are the
   * same batch.
   */
  namesSamePaths(paths: readonly string[]): boolean {
    const named = paths.map((path) => simCfInvalidationPath(path));

    return (
      this.paths.length === named.length &&
      this.paths.every(
        (path, index) => simCfInvalidationPath(path) === named.at(index),
      )
    );
  }
}

/**
 * Generate a fake sim CloudFront invalidation ID.
 */
export function makeSimCfInvalidationId(): SimCfInvalidationId {
  return faker.helpers.fromRegExp(/I[0-9A-Z]{13}/) as SimCfInvalidationId;
}
