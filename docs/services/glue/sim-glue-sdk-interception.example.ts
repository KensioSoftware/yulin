/**
 * Ordinary Glue SDK code reaching the simulated catalog.
 */

import {
  CreateDatabaseCommand,
  CreateTableCommand,
  GetTablesCommand,
  GlueClient,
} from "@aws-sdk/client-glue";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
simSdk.intercept(GlueClient);

const client = new GlueClient({ region: "eu-west-2" });

await client.send(
  new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
);
await client.send(
  new CreateTableCommand({
    DatabaseName: "site_logs",
    TableInput: { Name: "access_logs" },
  }),
);

const { TableList } = await client.send(
  new GetTablesCommand({ DatabaseName: "site_logs" }),
);

// access_logs
console.log(TableList?.[0]?.Name);
