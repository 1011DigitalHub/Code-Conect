// Rate limits per client IP. Only the endpoints that are worth abusing carry them:
// login (password guessing) and sign-up (mass account creation).
const ONE_MINUTE_MS = 60_000;

export const DEFAULT_THROTTLE = { ttl: ONE_MINUTE_MS, limit: 100 };
export const LOGIN_THROTTLE = { limit: 5, ttl: ONE_MINUTE_MS };
export const SIGN_UP_THROTTLE = { limit: 3, ttl: ONE_MINUTE_MS };
