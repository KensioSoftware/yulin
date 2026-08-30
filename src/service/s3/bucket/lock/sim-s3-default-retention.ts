import { SimS3InvalidRequest } from "../../error/sim-s3.error.js";
import {
  simS3ComplianceMode,
  simS3GovernanceMode,
  simS3RetentionModeNames,
} from "./sim-s3-object-retention.js";

/**
 * Read the mode of a default retention, refusing one real S3 refuses.
 *
 * The same two modes a per-version retention takes. They are read here rather
 * than through `SimS3ObjectRetention.parse`, because a default carries a
 * length where a retention carries an instant.
 */
export function simS3RetentionMode(mode: string | undefined): string {
  if (mode === simS3GovernanceMode || mode === simS3ComplianceMode) {
    return mode;
  }

  throw new SimS3InvalidRequest(
    `Object Lock DefaultRetention Mode has to be ${simS3RetentionModeNames}`,
  );
}
