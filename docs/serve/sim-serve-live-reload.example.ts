/**
 * Serving with live reload, so a browser reloads itself when the process
 * restarts.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

// Build the simulated environment the pages are served from here.

async function stopServing(): Promise<void> {
  // Waiting means the browsers hear about the restart before the process goes.
  await srv.close();
}

process.on("SIGTERM", () => {
  void stopServing();
});
