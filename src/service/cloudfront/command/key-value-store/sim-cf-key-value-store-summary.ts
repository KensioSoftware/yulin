import type { SimCloudFrontKeyValueStore } from "../../key-value-store/sim-cf-key-value-store.js";
import type { SimCfKeyValueStoreSummary } from "./sim-cf-key-value-store-command.types.js";

/**
 * Describe a key value store the way every CloudFront client command does.
 *
 * Create, Describe, List and Update all answer with the same summary shape, so
 * it is built in one place rather than four.
 */
export function simCfKeyValueStoreSummary(
  store: SimCloudFrontKeyValueStore,
): SimCfKeyValueStoreSummary {
  return {
    Id: store.id,
    Name: store.name,
    Comment: store.comment,
    ARN: store.arn,
    Status: store.status,
    LastModifiedTime: store.lastModifiedTime,
  };
}
