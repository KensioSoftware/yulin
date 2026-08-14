/**
 * A rule in one Account sending to a queue in another.
 */

const queuePolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "events.amazonaws.com" },
      Action: "sqs:SendMessage",
      Resource: "arn:aws:sqs:us-east-1:222222222222:orders",
      Condition: {
        ArnLike: {
          "aws:SourceArn": "arn:aws:events:us-east-1:111111111111:rule/orders",
        },
      },
    },
  ],
};

console.log(JSON.stringify(queuePolicy).length > 0); // true
