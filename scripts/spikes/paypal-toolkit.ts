import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
const toolkit = new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID!,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
  configuration: { actions: { transactions: { list: true } } },
});
console.log(Object.keys(toolkit.getTools()));
