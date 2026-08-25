/**
 * Reading a simulated workgroup's cutoff without an SDK command.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.athena().createWorkGroup({
  input: {
    Name: "rainlytics",
    Configuration: { BytesScannedCutoffPerQuery: 512 },
  },
});

// 512
console.log(
  simAws.athena().findWorkGroup("rainlytics")?.bytesScannedCutoffPerQuery,
);
