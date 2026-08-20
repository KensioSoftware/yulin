/**
 * Declaring the cross-site scripting match AWS does not document.
 */

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

waf.managedRules().onRequest("/search", {
  matches: ["CrossSiteScripting_QUERYARGUMENTS"],
});

// "declared"
console.log(waf.managedRules().tierOf("CrossSiteScripting_QUERYARGUMENTS"));

// "exact"
console.log(waf.managedRules().tierOf("SizeRestrictions_BODY"));
