/**
 * A pool whose `AWS/Cognito` counts a test can read back.
 *
 * The clock is stopped before anything is created, so every datapoint the pool
 * publishes lands in the one window the readers below ask for.
 */

import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { ExplicitAuthFlowsType } from "@aws-sdk/client-cognito-identity-provider";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../src/service/cognito/sim-cognito-identity-provider.js";

/** The instant every metric test starts from. */
export const simCognitoMetricStart = new Date("2026-08-30T09:00:00.000Z");

export const simCognitoMetricUser = "alice";
export const simCognitoMetricPassword = "Sup3rSecret!";

export interface SimCognitoMetricSetUp {
  readonly simAws: SimAws;
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
}

interface SimCognitoMetricOptions {
  readonly explicitAuthFlows?: ExplicitAuthFlowsType[];
  readonly withUser?: boolean;
}

/**
 * A pool with one app client, and a confirmed user unless asked otherwise.
 */
export async function simCognitoForMetrics(
  options: SimCognitoMetricOptions = {},
): Promise<SimCognitoMetricSetUp> {
  const simAws = new SimAws();
  const cognito = simAws.cognitoIdentityProvider();

  await simAws.clock().setTo(simCognitoMetricStart);

  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const userPoolId = pool.UserPool.Id;
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      ExplicitAuthFlows: options.explicitAuthFlows ?? [
        "ALLOW_USER_PASSWORD_AUTH",
      ],
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  if (options.withUser !== false) {
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: simCognitoMetricUser,
      }),
    );
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: simCognitoMetricUser,
        Password: simCognitoMetricPassword,
        Permanent: true,
      }),
    );
  }

  return {
    simAws,
    cognito,
    userPoolId,
    clientId: client.UserPoolClient.ClientId,
  };
}

/**
 * What one of a pool's metrics reported over the window.
 *
 * `Sum` is how many of the requests succeeded, `SampleCount` how many were
 * made, and `Average` the success rate between them.
 */
export interface SimCognitoMetricReading {
  readonly Sum?: number | undefined;
  readonly SampleCount?: number | undefined;
  readonly Average?: number | undefined;
}

/**
 * The one datapoint a pool's metric holds over the window, if it holds any.
 */
export async function simCognitoMetricDatapoint(
  simAws: SimAws,
  metricName: string,
  userPoolId: string,
  userPoolClient: string,
): Promise<SimCognitoMetricReading | undefined> {
  const statistics = new GetMetricStatisticsCommand({
    Namespace: "AWS/Cognito",
    MetricName: metricName,
    Dimensions: [
      { Name: "UserPool", Value: userPoolId },
      { Name: "UserPoolClient", Value: userPoolClient },
    ],
    StartTime: simCognitoMetricStart,
    EndTime: new Date(simCognitoMetricStart.getTime() + 300_000),
    Period: 300,
    Statistics: ["Sum", "SampleCount", "Average"],
  });
  const { Datapoints } = await simAws
    .cloudWatch()
    .getMetricStatistics(statistics);

  return Datapoints?.at(0);
}
