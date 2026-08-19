import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import type { AwsCredentialIdentity } from "@smithy/types";

import type { SimAws } from "../../src/service/aws/sim-aws.js";

/**
 * A policy admitting a principal to everything, which is what a test identity
 * gets so that the operations under test are the ones being tested.
 */
const everythingPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "*", Resource: "*" },
});

/**
 * Make a simulated IAM User admitted to everything, and answer with the
 * credentials that sign as it.
 *
 * A served request runs as whoever signed it. A test reaching an endpoint has
 * to be somebody first, and this is where every served API test starts.
 *
 * This lives under `test/` for the same reasons as `test/sns/topic-fixture.ts`.
 * eslint rejects a test file that exports helpers alongside its own `describe`
 * calls, and everything here is type-checked with the rest, excluded from the
 * published build, not collected as a suite, and not counted in coverage.
 */
export async function servedUserCredentials(
  simAws: SimAws,
  username: string,
): Promise<AwsCredentialIdentity> {
  const simIam = simAws.iam();

  await simIam.createUser(new CreateUserCommand({ UserName: username }));
  await simIam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: username,
      PolicyName: "Everything",
      PolicyDocument: everythingPolicy,
    }),
  );

  const created = await simIam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: username }),
  );

  return {
    accessKeyId: created.AccessKey.AccessKeyId,
    secretAccessKey: created.AccessKey.SecretAccessKey,
  };
}
