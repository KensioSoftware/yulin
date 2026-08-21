/**
 * Serving with a shorter limit on the email text that reaches the console.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({
  simAws,
  port: 8787,
  messageLogging: { emailTextLimit: 500 },
});

// Serve the pages that send the email here.

await srv.close();
