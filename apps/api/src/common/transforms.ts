// Shared @Transform callbacks for DTOs. Promoted out of create-user.dto.ts
// once a second DTO needed the same behaviour.

// Trims a string value and leaves anything else untouched, so the
// class-validator decorator that follows still sees (and reports) a wrong
// type rather than a coerced one.
export const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

// Trims and lowercases, for values compared case-insensitively (emails).
export const trimLower = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
