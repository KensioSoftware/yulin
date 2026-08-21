/**
 * Adding an interactions dataset to a dataset group.
 */

import {
  CreateDatasetCommand,
  CreateDatasetGroupCommand,
  CreateSchemaCommand,
} from "@aws-sdk/client-personalize";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws
  .personalize()
  .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));

// The Avro document is held as the string it arrived as. Simulated
// Personalize reads no dataset, and the fields it declares go unused.
const schema = await simAws.personalize().createSchema(
  new CreateSchemaCommand({
    name: "interactions",
    schema: JSON.stringify({
      type: "record",
      name: "Interactions",
      fields: [
        { name: "USER_ID", type: "string" },
        { name: "ITEM_ID", type: "string" },
        { name: "TIMESTAMP", type: "long" },
      ],
    }),
  }),
);

const dataset = await simAws.personalize().createDataset(
  new CreateDatasetCommand({
    name: "views",
    datasetGroupArn: group.datasetGroupArn,
    schemaArn: schema.schemaArn,
    datasetType: "Interactions",
  }),
);

// ...:dataset/catalogue/INTERACTIONS
console.log(dataset.datasetArn);
