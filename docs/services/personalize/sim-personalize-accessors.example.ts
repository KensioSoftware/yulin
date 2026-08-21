/**
 * Reading a created resource back through the simulator's own accessor.
 */

import { CreateDatasetGroupCommand } from "@aws-sdk/client-personalize";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .personalize()
  .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));

const group = simAws.personalize().findDatasetGroup("catalogue");

// catalogue ACTIVE
console.log(group?.name, group?.status);
