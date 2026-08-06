/**
 * Closing a served environment when the process is asked to stop.
 */

import { serveSimAws } from "@kensio/yulin/serve";

const srv = await serveSimAws({ port: 8787 });

async function stopServing(): Promise<void> {
  // Waiting means anything the server still had to say has gone before the
  // process does.
  await srv.close();
}

process.on("SIGTERM", () => {
  void stopServing();
});
