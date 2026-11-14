import { SimIamValidationError } from "../error/sim-iam.error.js";

/**
 * Refuse a `MaxItems` outside the 1 to 1,000 IAM allows, and answer the page
 * size a listing uses.
 */
export function assertSimIamMaxItems(maxItems: number | undefined): number {
  if (maxItems === undefined) {
    return 100;
  }

  if (!Number.isSafeInteger(maxItems) || maxItems < 1) {
    throw SimIamValidationError.member(
      "maxItems",
      String(maxItems),
      "have value greater than or equal to 1",
    );
  }

  if (maxItems > 1000) {
    throw SimIamValidationError.member(
      "maxItems",
      String(maxItems),
      "have value less than or equal to 1000",
    );
  }

  return maxItems;
}
