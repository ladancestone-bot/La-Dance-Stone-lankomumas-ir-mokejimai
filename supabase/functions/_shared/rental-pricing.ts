/**
 * Canonical studio-rental pricing for server-side booking and checkout code.
 *
 * Do not trust a price submitted by the browser. Derive the duration from the
 * persisted reservation, then call calculateRentalPrice() on the server.
 *
 * Policy: first 3 hours are €20/hour; each additional hour is €15/hour.
 * Supported booking duration: whole hours, 1–8 hours.
 */
export const RENTAL_MIN_HOURS = 1;
export const RENTAL_MAX_HOURS = 8;
export const RENTAL_INITIAL_HOURLY_RATE_EUR = 20;
export const RENTAL_EXTRA_HOURLY_RATE_EUR = 15;
export const RENTAL_INITIAL_RATE_HOURS = 3;

export function calculateRentalPrice(hours: number): number {
  if (
    !Number.isInteger(hours) ||
    hours < RENTAL_MIN_HOURS ||
    hours > RENTAL_MAX_HOURS
  ) {
    throw new RangeError(
      `Rental duration must be a whole number from ${RENTAL_MIN_HOURS} to ${RENTAL_MAX_HOURS} hours.`,
    );
  }

  const initialHours = Math.min(hours, RENTAL_INITIAL_RATE_HOURS);
  const extraHours = Math.max(hours - RENTAL_INITIAL_RATE_HOURS, 0);

  return initialHours * RENTAL_INITIAL_HOURLY_RATE_EUR +
    extraHours * RENTAL_EXTRA_HOURLY_RATE_EUR;
}

/** Convert a euro amount to Stripe's smallest currency unit (euro cents). */
export function rentalPriceInCents(hours: number): number {
  return calculateRentalPrice(hours) * 100;
}
