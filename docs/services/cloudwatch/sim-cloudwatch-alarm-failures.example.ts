/**
 * Finding out that an alarm action reached nothing.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// ...after an alarm with a bad action ARN has fired:
for (const failure of simAws.cloudWatch().alarmActionFailures) {
  console.log(failure.alarmName, failure.actionArn, failure.reason);
}
