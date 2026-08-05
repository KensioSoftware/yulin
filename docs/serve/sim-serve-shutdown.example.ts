/**
 * Closing a served environment when the process is asked to stop.
 */

import { serveSimAws } from "@kensio/yulin/serve";

const srv = await serveSimAws({ port: 8787 });

process.on("SIGTERM", () => {
  srv.close();
});
