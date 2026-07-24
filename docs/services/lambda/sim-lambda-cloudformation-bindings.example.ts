/**
 * Binding a real in-process handler to a CloudFormation Lambda function.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const observedEvents: unknown[] = [];

await simAws.cloudFormation().deployTemplate({
  stackName: "bound-greeter-stack",
  template: {
    Resources: {
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "bound-greeter",
          Role: "arn:aws:iam::111111111111:role/BoundGreeterRole",
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "GreeterFunction",
      handler: (event: { name: string }): string => {
        observedEvents.push(event);
        return `Hello ${event.name} from the bound handler`;
      },
    },
  ],
});

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "bound-greeter",
    Payload: JSON.stringify({ name: "Yulin" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());
console.log(observedEvents.length);

await simAws.backgroundTasksComplete();
