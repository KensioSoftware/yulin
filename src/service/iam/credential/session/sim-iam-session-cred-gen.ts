import { faker } from "@faker-js/faker";

export interface SimIamTemporaryCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken: string;
}

/**
 * Generates credential values for a temporary simulated IAM session.
 */
export interface SimIamSessionCredentialGenerator {
  generate(): SimIamTemporaryCredentials;
}

/**
 * Default random credential generator for simulated IAM sessions.
 */
export class SimIamRandomSessionCredentialGenerator implements SimIamSessionCredentialGenerator {
  /**
   * Generate random temporary credentials.
   */
  generate(): SimIamTemporaryCredentials {
    return {
      accessKeyId:
        `ASIA${faker.string.alphanumeric({ length: 16 })}`.toUpperCase(),
      secretAccessKey: faker.string.alphanumeric({ length: 40 }),
      sessionToken: faker.string.alphanumeric({ length: 356 }),
    };
  }
}
