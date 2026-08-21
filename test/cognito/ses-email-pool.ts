/**
 * The pool arrangements the Cognito-through-SES test files share.
 *
 * The behaviour splits into what a working configuration does and what a
 * broken one reports, which is two suites over one set of fixtures. This lives
 * under `test/` for the same reasons `test/cognito/cfn-deploy.ts` does: a test
 * file exporting helpers alongside its own `describe` calls is rejected, and
 * `test/**` is type-checked with everything else, excluded from the published
 * build, not collected as a suite, and not counted in coverage.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { PutAccountDetailsCommand } from "@aws-sdk/client-sesv2";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { AwsRegionName } from "../../src/service/aws/sim-aws-region.js";
import type { SimCognitoIdentityProvider } from "../../src/service/cognito/index.js";
import type { SimSesV2 } from "../../src/service/ses/index.js";

export const signUpPassword = "Sup3rSecret!";

/**
 * The applicant's address is on a different domain from the sender's, so the
 * verified sending domain covers the sender and never the recipient. That is
 * what leaves the sandbox rule with something to decide.
 */
export const applicant = "alice@example.org";

/**
 * A SourceArn written the way CDK synthesizes one, with the real Account the
 * stack deploys to in it. No simulation runs under that Account, which is the
 * point of the fixture: the pool has to resolve the identity anyway.
 */
export function sesSourceArn(regionName: AwsRegionName): string {
  return `arn:aws:ses:${regionName}:111122223333:identity/example.com`;
}

export interface SignUpPool {
  readonly simAws: SimAws;
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
}

/**
 * A pool users may sign themselves up in, verifying their email address, with
 * whatever email configuration the test is about.
 */
export async function poolSending(
  emailConfiguration: Readonly<Record<string, string>> | undefined,
): Promise<SignUpPool> {
  const simAws = new SimAws();
  const cognito = simAws.cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      AutoVerifiedAttributes: ["email"],
      EmailConfiguration: emailConfiguration,
    }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: pool.UserPool.Id,
      ClientName: "web",
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  return {
    simAws,
    cognito,
    userPoolId: pool.UserPool.Id,
    clientId: client.UserPoolClient.ClientId,
  };
}

/**
 * A pool sending through SES in one region, with nothing verified yet.
 */
export async function poolSendingThroughSes(
  regionName: AwsRegionName = "us-east-1",
  extra: Readonly<Record<string, string>> = {},
): Promise<SignUpPool> {
  return await poolSending({
    EmailSendingAccount: "DEVELOPER",
    From: "Example <no-reply@example.com>",
    SourceArn: sesSourceArn(regionName),
    ...extra,
  });
}

/** The simulated SES of one region in the pool's own account. */
export function sesIn(pool: SignUpPool, regionName: AwsRegionName): SimSesV2 {
  return pool.simAws
    .accountRegionScope(pool.simAws.defaultAccountId, regionName)
    .sesV2();
}

/** Put the account into production access, where only the sender is checked. */
export async function leaveTheSandbox(ses: SimSesV2): Promise<void> {
  await ses.putAccountDetails(
    new PutAccountDetailsCommand({
      MailType: "TRANSACTIONAL",
      WebsiteURL: "https://example.com",
      ProductionAccessEnabled: true,
    }),
  );
}

/** Sign the applicant up through the pool's app client. */
export async function signUp(pool: SignUpPool): Promise<void> {
  await pool.cognito.signUp(
    new SignUpCommand({
      ClientId: pool.clientId,
      Username: "alice",
      Password: signUpPassword,
      UserAttributes: [{ Name: "email", Value: applicant }],
    }),
  );
}
