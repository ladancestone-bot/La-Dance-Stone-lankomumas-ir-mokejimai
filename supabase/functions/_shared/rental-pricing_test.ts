import {
  calculateRentalPrice,
  rentalPriceInCents,
} from "./rental-pricing.ts";

Deno.test("rental pricing matches the published hourly tiers", () => {
  const expected: Record<number, number> = {
    1: 20,
    2: 40,
    3: 60,
    4: 75,
    5: 90,
    6: 105,
    7: 120,
    8: 135,
  };

  for (const [hoursText, amount] of Object.entries(expected)) {
    const hours = Number(hoursText);
    if (calculateRentalPrice(hours) !== amount) {
      throw new Error(
        `${hours} hours should cost €${amount}, got €${calculateRentalPrice(hours)}`,
      );
    }
  }
});

Deno.test("rental checkout amount is represented in euro cents", () => {
  if (rentalPriceInCents(4) !== 7500) {
    throw new Error("4 hours should be represented as 7500 euro cents.");
  }
});

Deno.test("rental duration rejects invalid values", () => {
  for (const invalid of [0, 1.5, 9, -1, Number.NaN]) {
    let threw = false;
    try {
      calculateRentalPrice(invalid);
    } catch (error) {
      threw = error instanceof RangeError;
    }
    if (!threw) {
      throw new Error(`Expected invalid duration ${invalid} to be rejected.`);
    }
  }
});
