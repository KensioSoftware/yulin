/**
 * Updating a deployed stack whenever its template file is synthesized again.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

await simAws.cloudFormation().deployTemplateFile({
  templatePath: path.join(process.cwd(), "cdk.out", "TestStack.template.json"),
  watch: {
    reload: srv,
  },
});
