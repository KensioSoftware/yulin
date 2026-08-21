/**
 * Serving with the text messages left off, and the pool messages still
 * printed.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({
  simAws,
  port: 8787,
  messageLogging: { sns: false },
});

// Serve the pages that sign a user up here.

await srv.close();
