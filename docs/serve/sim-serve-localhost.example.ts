/**
 * Serving a simulated environment on a port of your choosing.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787 });

console.log(srv.port); // "8787"

srv.close();
