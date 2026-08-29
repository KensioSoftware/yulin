import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimCfInvalidationSummaryView,
  SimCfInvalidationView,
} from "../../invalidation/sim-cf-invalidation-view.js";

/**
 * Minimal structural sim CloudFront invalidation batch, as a caller sends it.
 */
export interface SimCfInvalidationBatchInput {
  readonly CallerReference?: string | undefined;
  readonly Paths?:
    | {
        readonly Quantity?: number | undefined;
        readonly Items?: readonly string[] | undefined;
      }
    | undefined;
}

/**
 * Minimal structural sim CloudFront CreateInvalidation command.
 */
export interface SimCreateInvalidationCommand {
  readonly input: SimCreateInvalidationCommandInput;
}

/**
 * Minimal structural sim CloudFront CreateInvalidation input.
 */
export interface SimCreateInvalidationCommandInput {
  readonly DistributionId?: string | undefined;
  readonly InvalidationBatch?: SimCfInvalidationBatchInput | undefined;
}

/**
 * Minimal structural sim CloudFront CreateInvalidation output.
 */
export interface SimCreateInvalidationCommandOutput {
  readonly Location?: string | undefined;
  readonly Invalidation?: SimCfInvalidationView | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudFront GetInvalidation command.
 */
export interface SimGetInvalidationCommand {
  readonly input: SimGetInvalidationCommandInput;
}

/**
 * Minimal structural sim CloudFront GetInvalidation input.
 */
export interface SimGetInvalidationCommandInput {
  readonly DistributionId?: string | undefined;
  readonly Id?: string | undefined;
}

/**
 * Minimal structural sim CloudFront GetInvalidation output.
 */
export interface SimGetInvalidationCommandOutput {
  readonly Invalidation?: SimCfInvalidationView | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim CloudFront ListInvalidations command.
 */
export interface SimListInvalidationsCommand {
  readonly input: SimListInvalidationsCommandInput;
}

/**
 * Minimal structural sim CloudFront ListInvalidations input.
 */
export interface SimListInvalidationsCommandInput {
  readonly DistributionId?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxItems?: number | undefined;
}

/**
 * Minimal structural sim CloudFront ListInvalidations output.
 */
export interface SimListInvalidationsCommandOutput {
  readonly InvalidationList?:
    | {
        readonly Marker: string;
        readonly MaxItems: number;
        readonly IsTruncated: boolean;
        readonly Quantity: number;
        readonly Items: readonly SimCfInvalidationSummaryView[];
      }
    | undefined;
  readonly $metadata: SimResponseMetadata;
}
