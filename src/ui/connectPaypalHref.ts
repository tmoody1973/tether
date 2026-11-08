/** "Save your PayPal" for the teen this page shows: step 1 refuses it if she has switched teens since (review HIGH-1). */
export const connectPaypalHref = (familyId: string | null) => `/g/connect-paypal${familyId ? `?for=${encodeURIComponent(familyId)}` : ""}`;
