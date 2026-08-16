/**
 * Reading the sandbox state and the sending limits.
 */

import { GetAccountCommand } from "@aws-sdk/client-sesv2";

import { SimAws } from "@kensio/yulin";

const account = await new SimAws()
  .sesV2()
  .getAccount(new GetAccountCommand({}));

// false 200 1
console.log(
  account.ProductionAccessEnabled,
  account.SendQuota?.Max24HourSend,
  account.SendQuota?.MaxSendRate,
);
