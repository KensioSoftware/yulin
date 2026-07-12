import { faker } from "@faker-js/faker";

export interface SimIamUserCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/**
 * Generates long-lived credentials for a simulated IAM user.
 */
export interface SimIamUserCredentialGenerator {
  generate(): SimIamUserCredentials;
}

/**
 * Default random IAM-user credential generator.
 */
export class SimIamRandomUserCredentialGenerator implements SimIamUserCredentialGenerator {
  /**
   * Generate sim access key ID and secret access key for sim IAM User.
   */
  generate(): SimIamUserCredentials {
    return {
      accessKeyId:
        `AKIA${faker.string.alphanumeric({ length: 16 })}`.toUpperCase(),
      secretAccessKey: faker.string.alphanumeric({ length: 40 }),
    };
  }
}
