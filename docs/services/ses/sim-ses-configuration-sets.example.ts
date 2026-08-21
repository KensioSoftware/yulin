/**
 * Creating a configuration set and reading its settings back.
 */

import {
  CreateConfigurationSetCommand,
  GetConfigurationSetCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

await ses.createConfigurationSet(
  new CreateConfigurationSetCommand({
    ConfigurationSetName: "transactional",
    SuppressionOptions: { SuppressedReasons: ["BOUNCE", "COMPLAINT"] },
    DeliveryOptions: { TlsPolicy: "REQUIRE" },
  }),
);

const read = await ses.getConfigurationSet(
  new GetConfigurationSetCommand({ ConfigurationSetName: "transactional" }),
);

// ["BOUNCE", "COMPLAINT"] true
console.log(
  read.SuppressionOptions?.SuppressedReasons,
  read.SendingOptions?.SendingEnabled,
);

// The simulator's own accessors, for a test that would rather skip a Command
// and its authorization.
const configurationSet = ses.findConfigurationSet("transactional");

// "REQUIRE"
console.log(configurationSet?.deliveryOptions.tlsPolicy);

// ["transactional"]
console.log(ses.allConfigurationSets().map((set) => set.configurationSetName));
