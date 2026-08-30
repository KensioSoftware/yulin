/**
 * An alarm on the sign-ins a pool is turning away.
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
    AlarmName: "SignInsThrottling",
    Namespace: "AWS/Cognito",
    MetricName: "SignInThrottles",
    Dimensions: [
      { Name: "UserPool", Value: userPoolId },
      { Name: "UserPoolClient", Value: clientId },
    ],
    Statistic: "Sum",
    Period: 300,
    EvaluationPeriods: 3,
    DatapointsToAlarm: 1,
    Threshold: 0,
    ComparisonOperator: "GreaterThanThreshold",
    TreatMissingData: "notBreaching",
  }),
);

const cognito = simAws.cognitoIdentityProvider();

cognito.userPool(userPoolId).auth.throttle.signIns(1);

try {
  await cognito.initiateAuth(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
    }),
  );
} catch {
  // TooManyRequestsException, counted in SignInThrottles.
}

await simAws.backgroundTasksComplete();
await simAws.clock().advanceBy({ minutes: 6 });

const { MetricAlarms } = await simAws
  .cloudWatch()
  .describeAlarms(
    new DescribeAlarmsCommand({ AlarmNames: ["SignInsThrottling"] }),
  );

// ALARM.
console.log(MetricAlarms?.[0]?.StateValue);
