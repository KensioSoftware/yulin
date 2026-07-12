import { faker } from "@faker-js/faker";

import type { SimIamUserId } from "./sim-iam-user.js";

/**
 * Generate an AWS-shaped IAM user ID.
 */
export function makeSimIamUserId(): SimIamUserId {
  return `AIDA${faker.string
    .alphanumeric({ length: 16 })
    .toUpperCase()}` as SimIamUserId;
}
