/**
 * Disabling SNS message output and limiting printed email text.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const server = await serveSimAws({
  simAws,
  messageLogging: {
    sns: false,
    emailTextLimit: 500,
  },
});

await server.close();
