/**
 * Waiting for simulated AWS background tasks to complete.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// Deploy stacks and interact with simulated services...

await simAws.backgroundTasksComplete();
