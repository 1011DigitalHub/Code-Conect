import { SetMetadata } from '@nestjs/common';

export const NO_CSRF_KEY = 'auth:noCsrf';

// For a future webhook/machine-to-machine route that genuinely can't carry a
// CSRF header. GET/HEAD/OPTIONS never need it in the first place.
export const NoCsrf = () => SetMetadata(NO_CSRF_KEY, true);
