/**
 * Resolving a simulated Route53 record with Node's DNS resolver.
 */

import { Resolver } from "node:dns/promises";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

const resolver = new Resolver({ timeout: 1000, tries: 1 });
resolver.setServers([`127.0.0.1:${srv.dnsPort}`]);

// resolver.resolve4("www.example.test") now answers from simulated Route53.
