/**
 * Creating an email identity, and verifying it the way only a simulator can.
 */

import {
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
} from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const ses = new SimAws().sesV2();

await ses.createEmailIdentity(
  new CreateEmailIdentityCommand({ EmailIdentity: "example.com" }),
);

const pending = await ses.getEmailIdentity(
  new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
);

// "DOMAIN" "PENDING" false
console.log(
  pending.IdentityType,
  pending.VerificationStatus,
  pending.VerifiedForSendingStatus,
);

// Standing in for the DNS records a real domain identity waits on.
ses.verifyIdentity("example.com");

const verified = await ses.getEmailIdentity(
  new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
);

// "SUCCESS" true
console.log(verified.VerificationStatus, verified.VerifiedForSendingStatus);
