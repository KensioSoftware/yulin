/**
 * Starting a simulation at a known instant, then moving its clock on.
 */

import { CreateUserCommand } from "@aws-sdk/client-iam";
import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

const output = await simAws
  .iam()
  .createUser(new CreateUserCommand({ UserName: "Clockwatcher" }));

console.log(output.User.CreateDate); // 2026-07-26T09:00:00.000Z

await simAws.clock().advanceBy({ hours: 2, minutes: 30 });

console.log(simAws.now()); // 2026-07-26T11:30:00.000Z

// Time passes by itself again from here, still two and a half hours ahead.
simAws.clock().resume();
