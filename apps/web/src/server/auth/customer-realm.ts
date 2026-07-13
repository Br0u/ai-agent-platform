import "server-only";

export const customerRealm = {
  realm: "customer",
  basePath: "/api/auth/customer",
  cookieName: "aap_customer_session",
  maxAgeSeconds: 7 * 24 * 60 * 60,
  mountGenericRouteHandler: false,
  endpoints: {
    allowed: ["/sign-in/email", "/sign-out", "/get-session"],
    denied: ["/sign-up/email"],
  },
} as const;

export const customerSessionCookieNames = [
  customerRealm.cookieName,
  `__Secure-${customerRealm.cookieName}`,
] as const;
