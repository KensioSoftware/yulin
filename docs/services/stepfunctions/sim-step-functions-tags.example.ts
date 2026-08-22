/**
 * Tagging a state machine and reading its tags back.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Done",
      States: { Done: { Type: "Succeed" } },
    }),
    tags: [{ key: "team", value: "enrolment" }],
  },
});

await simAws.stepFunctions().tagResource({
  input: {
    resourceArn: created.stateMachineArn,
    tags: [{ key: "term", value: "autumn" }],
  },
});

await simAws.stepFunctions().untagResource({
  input: { resourceArn: created.stateMachineArn, tagKeys: ["team"] },
});

const listed = await simAws
  .stepFunctions()
  .listTagsForResource({ input: { resourceArn: created.stateMachineArn } });

console.log(listed.tags); // [ { key: 'term', value: 'autumn' } ]
