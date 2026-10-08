// Rate limits per client IP. DEFAULT_THROTTLE applies to every route (see
// the global ThrottlerGuard in AppModule); LOGIN_THROTTLE and SIGN_UP_THROTTLE
// are tighter overrides for the two endpoints that are worth abusing more
// cheaply: login (password guessing) and sign-up (mass account creation).
const ONE_MINUTE_MS = 60_000;

export const DEFAULT_THROTTLE = { ttl: ONE_MINUTE_MS, limit: 100 };
export const LOGIN_THROTTLE = { limit: 5, ttl: ONE_MINUTE_MS };
export const SIGN_UP_THROTTLE = { limit: 3, ttl: ONE_MINUTE_MS };

// Publishing is cheap to abuse for spam, so it is tighter than the default
// 100/min, but loose enough that a person writing several posts or replying
// in a thread never hits it.
export const CREATE_POST_THROTTLE = { limit: 10, ttl: ONE_MINUTE_MS };
export const CREATE_COMMENT_THROTTLE = { limit: 20, ttl: ONE_MINUTE_MS };
