/**
 * Asserting on the DKIM signing an identity was created with.
 */

import {
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

await ses.createEmailIdentity(
  new CreateEmailIdentityCommand({
    EmailIdentity: "example.com",
    ConfigurationSetName: "transactional",
    Tags: [{ Key: "team", Value: "orders" }],
  }),
);

const identity = await ses.getEmailIdentity(
  new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
);

// true "AWS_SES" 3
console.log(
  identity.DkimAttributes?.SigningEnabled,
  identity.DkimAttributes?.SigningAttributesOrigin,
  identity.DkimAttributes?.Tokens?.length,
);

// "transactional" "orders"
console.log(identity.ConfigurationSetName, identity.Tags?.[0]?.Value);
