/**
 * Simulated IAM date conditions read the simulated clock.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
await simAws.clock().setTo(new Date("2026-12-31T23:00:00Z"));

simAws.organizations().attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: {
    Effect: "Deny",
    Action: "s3:CreateBucket",
    Resource: "*",
    Condition: {
      DateGreaterThanEquals: { "aws:CurrentTime": "2027-01-01T00:00:00Z" },
    },
  },
});

const iam = simAws.account("123456789012").iam();
const request = {
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::123456789012-reports",
};

console.log(iam.authorize(request).isAllowed); // true

await simAws.clock().advanceBy({ hours: 2 });

console.log(iam.authorize(request).isAllowed); // false
