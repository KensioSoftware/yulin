/**
 * A catalog name folded on its way in.
 */

import {
  CreateDatabaseCommand,
  GetDatabaseCommand,
} from "@aws-sdk/client-glue";

import { SimAws } from "@kensio/yulin";

const glue = new SimAws().glue();

glue.createDatabase(
  new CreateDatabaseCommand({ DatabaseInput: { Name: "Rainlytics" } }),
);

const { Database } = glue.getDatabase(
  new GetDatabaseCommand({ Name: "Rainlytics" }),
);

// rainlytics
console.log(Database.Name);
