/**
 * Deploying a SAM AWS::Serverless::Function into simulated AWS.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "rates-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Globals: {
      Function: {
        Runtime: "nodejs22.x",
        Timeout: 10,
      },
    },
    Resources: {
      Rates: {
        Type: "AWS::Serverless::Function",
        Properties: {
          FunctionName: "rates",
          CodeUri: "src/rates/",
          Handler: "index.handler",
          Environment: {
            Variables: { TABLE_NAME: "rates-table" },
          },
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "Rates",
      handler: (event: { currency: string }): string =>
        `rate for ${event.currency}`,
    },
  ],
});

console.log(stack.getResource("Rates")?.type);

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "rates",
    Payload: JSON.stringify({ currency: "GBP" }),
  }),
);

console.log(new TextDecoder().decode(output.Payload));
