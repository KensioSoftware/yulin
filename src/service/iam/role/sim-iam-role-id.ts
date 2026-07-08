import type { Brand } from "../../../util/brand.type.js";
import { faker } from "@faker-js/faker";

export type SimIamRoleId = Brand<string, "SimIamRoleId">;

/**
 * Generate a fake IAM Role ID.
 */
export function makeSimIamRoleId(): SimIamRoleId {
  return `AROA${faker.string.alphanumeric({ length: 17 })}` as SimIamRoleId;
}
