/**
 * Exempting the management account.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const organizations = simAws.organizations();

organizations.attachServiceControlPolicy(organizations.root(), {
  Version: "2012-10-17",
  Statement: { Effect: "Deny", Action: "*", Resource: "*" },
});
organizations.setManagementAccount("111111111111");

const decision = simAws.account("111111111111").iam().authorize({
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::reports-bucket",
});

console.log(decision.isAllowed); // true
console.log(decision.serviceControlPolicy.isApplied); // false
