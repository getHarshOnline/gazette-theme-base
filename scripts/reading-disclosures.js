// A constrained reading rail shows one expanded navigation group at a time.
// Measure the complete HTML disclosures before deciding: a short viewport or
// long headings, rather than a page/domain exception, determines this behaviour.
export function mountReadingRail(rail) {
  const document = rail.ownerDocument;
  const disclosures = [...rail.querySelectorAll('.reading-corpus details,.reading-outline details:not(.reading-citation)')];
  if (disclosures.length < 2) return null;
  let preferred = null, readerChose = false, printing = false, printState = null;
  const present = () => disclosures.filter(disclosure => rail.contains(disclosure));
  const focused = items => items.find(disclosure => disclosure.contains(document.activeElement));
  const constrained = items => {
    // This synchronous probe is restored before paint. It retains the original
    // content and measures wrapping at the current width, including loaded fonts.
    const state = items.map(disclosure => disclosure.open);
    items.forEach(disclosure => { disclosure.open = true; });
    const overflows = rail.clientHeight > 0 && rail.scrollHeight > rail.clientHeight;
    items.forEach((disclosure, index) => { disclosure.open = state[index]; });
    return overflows;
  };
  const arrange = () => {
    if (printing || getComputedStyle(rail).getPropertyValue('--reading-placement').trim() !== 'beside') return;
    const items = present();
    if (items.length < 2 || !rail.clientHeight) return;
    if (constrained(items)) {
      const keep = focused(items) || (preferred?.open ? preferred : null)
        || (!readerChose ? items.find(disclosure => disclosure.closest('.reading-outline')) : null);
      items.forEach(disclosure => { if (disclosure !== keep) disclosure.open = false; });
    } else if (!readerChose) {
      items.forEach(disclosure => { disclosure.open = true; });
    }
  };
  for (const disclosure of disclosures) {
    disclosure.querySelector(':scope > summary')?.addEventListener('click', () => {
      readerChose = true;
      preferred = disclosure;
      // Native summary activation still owns opening and closing this panel.
      // Close its peers before that activation when both cannot fit together.
      if (!disclosure.open) {
        const items = present();
        if (getComputedStyle(rail).getPropertyValue('--reading-placement').trim() === 'beside'
            && constrained(items)) {
          items.forEach(other => { if (other !== disclosure) other.open = false; });
        }
      }
    });
  }
  const observer = new ResizeObserver(arrange);
  observer.observe(document.documentElement);
  observer.observe(rail);
  document.fonts?.ready.then(arrange);
  window.addEventListener('beforeprint', () => {
    if (printing) return;
    printing = true;
    printState = disclosures.map(disclosure => disclosure.open);
    disclosures.forEach(disclosure => { disclosure.open = true; });
  });
  window.addEventListener('afterprint', () => {
    if (printState) disclosures.forEach((disclosure, index) => { disclosure.open = printState[index]; });
    printState = null; printing = false;
  });
  arrange();
  return { refresh: arrange };
}

// CSS declares the shared reading composition; wrappers may own stickiness without
// changing how disclosures open. Reader choice and focused controls take priority.
export function mountReadingDisclosures() {
  let printing = false;
  window.addEventListener('beforeprint', () => { printing = true; });
  window.addEventListener('afterprint', () => { printing = false; });
  for (const outline of document.querySelectorAll('.reading-outline,.reading-corpus')) {
    for (const disclosure of outline.querySelectorAll('details:not(.reading-citation)')) {
      let beside = null;
      let readerChose = false;
      const summary = disclosure.querySelector(':scope > summary');
      summary?.addEventListener('click', () => { readerChose = true; });
      const placeOutline = () => {
        if (printing) return;
        const next = getComputedStyle(outline).getPropertyValue('--reading-placement').trim() === 'beside';
        if (next !== beside && !readerChose && !disclosure.contains(document.activeElement)) disclosure.open = next;
        beside = next;
      };
      new ResizeObserver(placeOutline).observe(document.documentElement);
      placeOutline();
    }
  }

  for (const rail of document.querySelectorAll('.reading-navigation')) mountReadingRail(rail);

  // A citation, the reading tools and the keywords are reader-opened, but their authored text belongs in print.
  // CSS carries the no-script form; this lifecycle also supports older details rendering.
  for (const citation of document.querySelectorAll('details.reading-citation,details.reading-tools,details.reading-keywords')) {
    if (citation.classList?.contains('reading-section-control')) continue;
    let printOpen = null;
    window.addEventListener('beforeprint', () => {
      if (printOpen !== null) return;
      printOpen = citation.open;
      citation.open = true;
    });
    window.addEventListener('afterprint', () => {
      if (printOpen === null) return;
      citation.open = printOpen;
      printOpen = null;
    });
  }
}
