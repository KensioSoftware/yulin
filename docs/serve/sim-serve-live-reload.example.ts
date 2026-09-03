/**
 * Serving HTML with browser reload support.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const server = await serveSimAws({
  simAws,
  port: 8787,
  liveReload: true,
});

// Reload connected browsers after changing simulated content in place.
server.reload();

await server.close();
