import { faker } from "@faker-js/faker";

/**
 * Generate a fake ETag, in the shape CloudFront gives one.
 *
 * Every versioned CloudFront resource carries one of these, and a write says
 * which version it is writing over by sending it back as `IfMatch`.
 */
export function makeSimCloudFrontETag(): string {
  return faker.helpers.fromRegExp(/E[0-9A-Z]{13}/);
}
