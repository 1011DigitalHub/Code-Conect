import { SetMetadata } from '@nestjs/common';

export const THROTTLE_BUCKET_KEY = 'throttleBucket';
export const ThrottleBucket = (name: string) => SetMetadata(THROTTLE_BUCKET_KEY, name);
