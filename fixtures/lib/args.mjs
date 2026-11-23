/**
 * Command-line options shared by Base's profile and journey commands. Capture
 * passes unknown options through to Pale and the pond capture allows repeats,
 * so each keeps its own short loop.
 *
 * `names` maps each `--flag` to its option key. Every option appears at most once
 * and takes one value, which may not begin with `--`. Arguments that are not known
 * flags go to `operand`; without one they are refused as unknown options.
 */
export function readOptions(args, names, { operand, sentenceCase = false } = {}) {
  const say = (phrase, flag) =>
    `${sentenceCase ? phrase[0].toUpperCase() + phrase.slice(1) : phrase} ${flag}`;
  const values = {}, seen = new Set();
  for (let at = 0; at < args.length; at++) {
    const flag = args[at], name = names[flag];
    if (!name) {
      if (!operand) throw new Error(say('unknown option', flag));
      operand(flag);
      continue;
    }
    if (seen.has(name)) throw new Error(say('repeated option', flag));
    if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error(say('missing value for', flag));
    seen.add(name);
    values[name] = args[++at];
  }
  return values;
}

/** Convert each named option to an integer within its inclusive range. */
export function integers(options, ranges, message) {
  for (const [name, min, max] of ranges) {
    options[name] = Number(options[name]);
    if (!Number.isSafeInteger(options[name]) || options[name] < min || options[name] > max)
      throw new Error(message(name, min, max));
  }
}

/** Accept an HTTP(S) URL without embedded credentials and return its normal form. */
export function httpURL(value, base, message = 'Use HTTP(S) URLs without credentials.') {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error(message);
  return url.href;
}
