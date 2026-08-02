import { faker } from "@faker-js/faker";

import type { Brand } from "../../../util/brand.type.js";

/**
 * The id API Gateway allocates for one API, which is the leading DNS label of
 * the endpoint it generates.
 */
export type SimHttpApiId = Brand<string, "SimHttpApiId">;

/**
 * Allocate an API id in the shape real API Gateway uses: 10 lowercase
 * alphanumeric characters, forming one DNS label.
 */
export function makeSimHttpApiId(): SimHttpApiId {
  return faker.helpers.fromRegExp(/[a-z0-9]{10}/) as SimHttpApiId;
}
