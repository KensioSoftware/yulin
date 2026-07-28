/**
 * Narrows the simulated resource a CloudFormation Resource is backed by to the
 * simulated KMS key it should be.
 *
 * Several KMS CloudFormation test files read the deployed key back off the
 * Resource, and each was carrying the same cast-and-assert. This lives under
 * `test/` for the same reasons as `test/iam/`: eslint rejects a test file that
 * exports helpers alongside its own `describe` calls, and `test/**` is
 * type-checked with everything else, excluded from the published build, not
 * collected as a suite, and not counted in coverage.
 */

import { assertInstanceOf } from "@kensio/smartass";

import { SimKmsKey } from "../../src/service/kms/key/sim-kms-key.js";

/**
 * The simulated KMS key backing a deployed CloudFormation Resource.
 */
export function simKmsCfnKey(simResource: object | undefined): SimKmsKey {
  assertInstanceOf(simResource, SimKmsKey);

  return simResource;
}
