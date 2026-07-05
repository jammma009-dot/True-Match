/**
 * Compute integer age from a birthdate as of "now".
 * Does NOT round up — a user one day short of 18 is still 17.
 */
export function computeAge(birthdate: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - birthdate.getFullYear();
  const m = now.getMonth() - birthdate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthdate.getDate())) {
    age--;
  }
  return age;
}

export const MIN_AGE = 18;

export function isAdult(birthdate: Date, now: Date = new Date()): boolean {
  return computeAge(birthdate, now) >= MIN_AGE;
}
