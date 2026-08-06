/**
 * Asking for the signal handler rather than writing one.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

// Build the simulated environment the pages are served from here.

// Asking is the whole of it. The handler closes the server and the environment
// it serves, and the process then exits on its own.
const stopListening = srv.closeOnSignal();

// A script that stops wanting the handler before the process ends takes it off
// again:
stopListening();
