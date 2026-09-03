/**
 * Serving a simulated AWS environment on localhost.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const server = await serveSimAws({ simAws, port: 8787 });

console.log(server.port); // "8787"
console.log(server.hostname); // "sim-aws.localhost"

await server.close();
