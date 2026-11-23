// Keep a number within an inclusive range; the default is the unit interval.
export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
