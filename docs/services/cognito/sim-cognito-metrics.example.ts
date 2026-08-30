/**
 * An alarm on the rate at which a pool is turning sign-ins away.
 */

import {
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
} from "@aws-sdk/client-cloudwatch";
import { InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const userPoolId: string;
declare const clientId: string;

await simAws.cloudWatch().putMetricAlarm(
  new PutMetricAlarmCommand({
    AlarmName: "SignInsFailing",
    Namespace: "AWS/Cognito",
    MetricName: "SignInSuccesses",
    Dimensions: [
      { Name: "UserPool", Value: userPoolId },
      { Name: "UserPoolClient", Value: clientId },
    ],
    Statistic: "Average",
    Period: 300,
    EvaluationPeriods: 3,
    DatapointsToAlarm: 1,
    Threshold: 0.5,
    ComparisonOperator: "LessThanThreshold",
    TreatMissingData: "notBreaching",
  }),
);

// Two of these three fail, so the average falls under the threshold.
for (const password of ["Wr0ng!", "AlsoWr0ng!", "Sup3rSecret!"]) {
  const attempt = new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: password },
  });

  try {
    await simAws.cognitoIdentityProvider().initiateAuth(attempt);
  } catch {
    // A refused sign-in is counted as a zero rather than going uncounted.
  }
}

await simAws.backgroundTasksComplete();
await simAws.clock().advanceBy({ minutes: 6 });

const { MetricAlarms } = await simAws
  .cloudWatch()
  .describeAlarms(
    new DescribeAlarmsCommand({ AlarmNames: ["SignInsFailing"] }),
  );

// ALARM.
console.log(MetricAlarms?.[0]?.StateValue);
