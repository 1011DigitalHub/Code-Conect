import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

// Marks a route (or a whole controller) as not requiring the global AuthGuard.
// Fail-safe default: everything is protected unless explicitly opted out here.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
