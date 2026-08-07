/**
 * Sets up a simulation that can sign requests: an IAM user holding an access
 * key, plus the fixed values the SigV4 tests share.
 *
 * This is the other half of the signing setup, alongside sign-aws-request.ts,
 * and lives under `test/` for the same reason: it is shared by several test
 * files, and a module that both exports helpers and declares tests is not
 * allowed. Nothing here needs to ship, and being outside `src/` keeps it out of
 * the published build and out of the coverage numbers while still being
 * type-checked.
 */

import { CreateAccessKeyCommand, CreateUserCommand } from "@aws-sdk/client-iam";

import { SimAws } from "../../src/index.js";
import type { SimIam } from "../../src/service/iam/sim-iam.js";
import type { SignAwsRequestCredentials } from "./sign-aws-request.js";

/*
 * Access key ids that no simulation ever issues, for the cases that need a key
 * to be unknown or unusable. They are shaped like real ones, which trips the
 * secret scanner, so they are kept together here rather than scattering the
 * same exemption across the test files that use them.
 */
/* oxlint-disable no-secrets/no-secrets -- invented access key ids for tests, not credentials. */
export const unknownAccessKeyId = "AKIAINVENTEDKEY00000";
export const deactivatedAccessKeyId = "AKIADEACTIVATED00000";
export const exampleAccessKeyId = "AKIAEXAMPLEKEY000000";
/* eslint-enable no-secrets/no-secrets */

/**
 * A Function URL endpoint, which is a realistic thing for a client to sign for.
 */
export const signerEndpoint = "https://abc123.lambda-url.us-east-1.on.aws/";

export const signerAccountId = "111111111111";

/**
 * Give a simulated IAM an access key belonging to a new user, and return
 * credentials that can sign with it.
 */
export async function createSigner(
  iam: SimIam,
  username = "Signer",
): Promise<SignAwsRequestCredentials> {
  await iam.createUser(new CreateUserCommand({ UserName: username }));

  const created = await iam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: username }),
  );

  return {
    accessKeyId: created.AccessKey.AccessKeyId,
    secretAccessKey: created.AccessKey.SecretAccessKey,
  };
}

export interface SimulationWithSigner {
  readonly simAws: SimAws;
  readonly credentials: SignAwsRequestCredentials;
  readonly userArn: string;
}

/**
 * A simulation holding one signing user, ready to sign requests.
 */
export async function simulationWithSigner(): Promise<SimulationWithSigner> {
  const simAws = new SimAws();

  return {
    simAws,
    credentials: await createSigner(simAws.account(signerAccountId).iam()),
    userArn: `arn:aws:iam::${signerAccountId}:user/Signer`,
  };
}
