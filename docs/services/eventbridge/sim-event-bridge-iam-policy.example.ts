/**
 * A policy allowing events onto one bus and nothing else.
 */

const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: "events:PutEvents",
      Resource: "arn:aws:events:us-east-1:888888888888:event-bus/orders",
    },
  ],
};

console.log(JSON.stringify(policy).length > 0); // true
