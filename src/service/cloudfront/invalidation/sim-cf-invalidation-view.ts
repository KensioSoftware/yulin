import type { SimCfInvalidation } from "./sim-cf-invalidation.js";

/**
 * The batch of paths an invalidation was created from, as the API returns it.
 */
export interface SimCfInvalidationBatchView {
  readonly Paths: {
    readonly Quantity: number;
    readonly Items: readonly string[];
  };
  readonly CallerReference: string;
}

/**
 * Minimal structural sim CloudFront invalidation, as the API returns it.
 *
 * CreateInvalidation and GetInvalidation both answer with this shape.
 */
export interface SimCfInvalidationView {
  readonly Id: string;
  readonly Status: string;
  readonly CreateTime: Date;
  readonly InvalidationBatch: SimCfInvalidationBatchView;
}

/**
 * One invalidation as ListInvalidations returns it, which leaves out the
 * batch of paths.
 */
export interface SimCfInvalidationSummaryView {
  readonly Id: string;
  readonly CreateTime: Date;
  readonly Status: string;
}

/**
 * Build the API view of a sim CloudFront invalidation.
 */
export function simCfInvalidationView(
  invalidation: SimCfInvalidation,
): SimCfInvalidationView {
  return {
    Id: invalidation.invalidationId,
    Status: invalidation.status,
    CreateTime: invalidation.createTime,
    InvalidationBatch: {
      Paths: {
        Quantity: invalidation.paths.length,
        Items: invalidation.paths,
      },
      CallerReference: invalidation.callerReference,
    },
  };
}

/**
 * Build the listing view of a sim CloudFront invalidation.
 */
export function simCfInvalidationSummary(
  invalidation: SimCfInvalidation,
): SimCfInvalidationSummaryView {
  return {
    Id: invalidation.invalidationId,
    CreateTime: invalidation.createTime,
    Status: invalidation.status,
  };
}

/**
 * The URL CreateInvalidation reports the new invalidation at.
 */
export function simCfInvalidationLocation(
  distributionId: string,
  invalidationId: string,
): string {
  return `https://cloudfront.amazonaws.com/2020-05-31/distribution/${distributionId}/invalidation/${invalidationId}`;
}
