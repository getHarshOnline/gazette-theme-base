// Browser timers and Web Animations use milliseconds. Token serialization may
// use either CSS time unit; retain the adapters' unitless millisecond inputs too.
export function milliseconds(value) {
  const match = String(value).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(ms|s)?$/i);
  return match ? Number(match[1]) * (match[2]?.toLowerCase() === 's' ? 1000 : 1) : NaN;
}

export const timeToken = (style, name) => milliseconds(style.getPropertyValue(name));
