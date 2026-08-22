/**
 * Running a state machine through an intercepted SFNClient.
 */

import {
  CreateStateMachineCommand,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";

import { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

const simAws = new SimAws();
const client = new SFNClient({ region: simAws.defaultRegionName });

using _intercepted = new SimSdk({ simAws }).intercept(client);

const created = await client.send(
  new CreateStateMachineCommand({
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Done",
      States: { Done: { Type: "Succeed" } },
    }),
  }),
);

const started = await client.send(
  new StartExecutionCommand({ stateMachineArn: created.stateMachineArn }),
);

console.log(started.executionArn);
