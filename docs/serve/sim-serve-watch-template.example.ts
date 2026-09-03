/**
 * Updating a stack and reloading browsers when its template changes.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const server = await serveSimAws({ simAws, liveReload: true });

await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/TestStack.template.json",
  watch: { reload: server },
});

// Keep serving until the application shuts down.
