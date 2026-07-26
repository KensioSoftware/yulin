import { SimIamCredentialScopeMismatch } from "./error/sim-iam-sigv4.error.js";
import type { SimIamSigV4CredentialScope } from "./sim-iam-sigv4-credential-scope.js";

/**
 * The service and Region a signature is expected to have been scoped to.
 *
 * The Region is optional because not every simulated endpoint is
 * Region-specific: a CloudFront hostname names no Region, so there is nothing
 * to disagree with.
 */
export interface SimIamSigV4ExpectedScope {
  readonly serviceName: string;
  readonly regionName?: string | undefined;
}

/**
 * Check a signature's scope against the endpoint it reached, when that
 * endpoint is known.
 *
 * Verification is also done standalone, by a test asking only whether a
 * signature is sound, and then there is no endpoint to compare against.
 */
export function simIamSigV4CheckExpectedScope(
  expected: SimIamSigV4ExpectedScope | undefined,
  scope: SimIamSigV4CredentialScope,
): void {
  if (expected !== undefined) {
    new SimIamSigV4ScopeExpectation(expected).check(scope);
  }
}

/**
 * Checks that a signature was made for the endpoint it arrived at.
 *
 * Real AWS makes this check too, and the reason it is worth making here is
 * diagnostic. A wrong service or Region changes the signing key, so without
 * this the only symptom is a signature that does not match, with no hint that
 * the credentials and the request body were fine all along.
 */
export class SimIamSigV4ScopeExpectation {
  private readonly expected: SimIamSigV4ExpectedScope;

  constructor(expected: SimIamSigV4ExpectedScope) {
    this.expected = expected;
  }

  /**
   * Refuse a scope naming a service or Region other than the expected one.
   */
  check(scope: SimIamSigV4CredentialScope): void {
    this.checkServiceName(scope.serviceName);
    this.checkRegionName(scope.regionName);
  }

  private checkServiceName(signed: string): void {
    if (signed === this.expected.serviceName) {
      return;
    }

    throw new SimIamCredentialScopeMismatch(
      `Request is signed for service ${signed}, but reached simulated ` +
        `${this.expected.serviceName}. Its credential scope should name ` +
        `service ${this.expected.serviceName}.`,
    );
  }

  private checkRegionName(signed: string): void {
    const expected = this.expected.regionName;

    if (expected === undefined || signed === expected) {
      return;
    }

    throw new SimIamCredentialScopeMismatch(
      `Request is signed for Region ${signed}, but reached simulated ` +
        `${this.expected.serviceName} in ${expected}. Its credential scope ` +
        `should name Region ${expected}.`,
    );
  }
}
