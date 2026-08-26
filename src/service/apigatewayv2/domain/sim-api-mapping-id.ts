import { faker } from "@faker-js/faker";

import type { Brand } from "../../../util/brand.type.js";

/**
 * The id API Gateway allocates for one API mapping.
 */
export type SimApiMappingId = Brand<string, "SimApiMappingId">;

/**
 * Allocate an API mapping id in the shape real API Gateway uses: six
 * lowercase alphanumeric characters.
 */
export function makeSimApiMappingId(): SimApiMappingId {
  return faker.helpers.fromRegExp(/[a-z0-9]{6}/) as SimApiMappingId;
}
