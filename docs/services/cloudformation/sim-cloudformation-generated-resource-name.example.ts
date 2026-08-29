/**
 * Reading the name CloudFormation generated for a Resource the template does
 * not name.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersQueue: { Type: "AWS::SQS::Queue" },
    },
    Outputs: {
      QueueName: {
        Value: { "Fn::GetAtt": ["OrdersQueue", "QueueName"] },
      },
    },
  },
});

await stack.waitForDeployComplete();

const queueName = stack.output("QueueName");

console.log(queueName); // "orders-stack-OrdersQueue-1dca4dbe253b"
