import { faker } from "@faker-js/faker";

import type { Brand } from "../../../util/brand.type.js";

/**
 * The id API Gateway allocates for one REST API, which is the leading DNS
 * label of the endpoint it generates.
 */
export type SimRestApiId = Brand<string, "SimRestApiId">;

/**
 * Allocate a REST API id in the shape real API Gateway uses: 10 lowercase
 * alphanumeric characters, forming one DNS label.
 *
 * An HTTP API id has the same shape, because both services issue endpoints
 * under `execute-api` and neither reserves any part of that namespace.
 */
export function makeSimRestApiId(): SimRestApiId {
  return faker.helpers.fromRegExp(/[a-z0-9]{10}/) as SimRestApiId;
}
