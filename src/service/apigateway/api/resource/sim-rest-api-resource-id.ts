import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";

/**
 * The id API Gateway allocates for one resource in a REST API's path tree.
 */
export type SimRestApiResourceId = Brand<string, "SimRestApiResourceId">;

/**
 * Allocate a resource id.
 *
 * Real API Gateway ids are opaque short lowercase alphanumeric strings. The
 * exact length is no part of the API contract, so only the shape is matched.
 */
export function makeSimRestApiResourceId(): SimRestApiResourceId {
  return faker.helpers.fromRegExp(/[a-z0-9]{7}/) as SimRestApiResourceId;
}
