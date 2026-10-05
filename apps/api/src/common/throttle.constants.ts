// Rate limits per client IP. DEFAULT_THROTTLE applies to every route (see
// the global ThrottlerGuard in AppModule); LOGIN_THROTTLE and SIGN_UP_THROTTLE
// are tighter overrides for the two endpoints that are worth abusing more
// cheaply: login (password guessing) and sign-up (mass account creation).
const ONE_MINUTE_MS = 60_000;

export const DEFAULT_THROTTLE = { ttl: ONE_MINUTE_MS, limit: 100 };
export const LOGIN_THROTTLE = { limit: 5, ttl: ONE_MINUTE_MS };
export const SIGN_UP_THROTTLE = { limit: 3, ttl: ONE_MINUTE_MS };
