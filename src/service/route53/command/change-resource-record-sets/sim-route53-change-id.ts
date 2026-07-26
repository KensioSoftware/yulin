import { faker } from "@faker-js/faker";

/**
 * Make an opaque change id for one ChangeResourceRecordSets request.
 *
 * Real Route53 change ids are opaque tokens, unique per request. Deriving one
 * from the submission time would make two changes submitted at the same
 * simulated instant share an id, which a stopped clock guarantees rather than
 * merely risks.
 */
export function makeSimRoute53ChangeId(): string {
  return faker.string.alphanumeric({ length: 14 }).toUpperCase();
}
