/**
 * Publishing an SMS to a phone number and reading the record back.
 */

import {
  CheckIfPhoneNumberIsOptedOutCommand,
  PublishCommand,
} from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { MessageId } = await sns.publish(
  new PublishCommand({
    PhoneNumber: "+15550100",
    Message: "Your code is 123456",
    MessageAttributes: {
      "AWS.SNS.SMS.SenderID": { DataType: "String", StringValue: "Orders" },
      "AWS.SNS.SMS.SMSType": {
        DataType: "String",
        StringValue: "Transactional",
      },
    },
  }),
);

const [sent] = sns.sentSmsMessages();

console.log(sent?.phoneNumber); // "+15550100"
console.log(sent?.message); // "Your code is 123456"
console.log(sent?.senderId); // "Orders"
console.log(sent?.suppressed); // false
console.log(sent?.messageId === MessageId); // true

// On real SNS a recipient opts out by replying STOP. Nothing in a test process
// can reply, so the simulator does it.
sns.optOutPhoneNumber("+15550100");

await sns.publish(
  new PublishCommand({
    PhoneNumber: "+15550100",
    Message: "Your code is 654321",
  }),
);

const [, stopped] = sns.sentSmsMessages();

console.log(stopped?.suppressed); // true

const { isOptedOut } = await sns.checkIfPhoneNumberIsOptedOut(
  new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber: "+15550100" }),
);

console.log(isOptedOut); // true
