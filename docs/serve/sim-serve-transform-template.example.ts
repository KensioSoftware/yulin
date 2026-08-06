/**
 * Adapting a watched template, so the file being watched is the real one.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/TestStack.template.json",
  transform: (template) => ({
    ...template,
    Resources: Object.fromEntries(
      Object.entries(template.Resources).filter(
        ([logicalId]) => logicalId !== "SiteAliasRecord",
      ),
    ),
  }),
  watch: {
    onUpdated: () => {
      srv.reload();
    },
  },
});
