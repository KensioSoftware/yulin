/**
 * Creating a Domain dataset group.
 */

import { CreateDatasetGroupCommand } from "@aws-sdk/client-personalize";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws.personalize().createDatasetGroup(
  new CreateDatasetGroupCommand({
    name: "storefront",
    domain: "ECOMMERCE",
  }),
);

// ECOMMERCE
console.log(group.domain);
