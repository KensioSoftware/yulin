/**
 * Closing a local server when the process receives a termination signal.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const server = await serveSimAws({ simAws, port: 8787 });

const removeSignalHandlers = server.closeOnSignal();

// Call this only if the script later takes responsibility for signals itself.
removeSignalHandlers();
await server.close();
