# Search and the command shell

Gazette hands Base a resolved Search destination or the data for command search. Base presents the full-page catalogue and the compact command tool as different interfaces to that supplied search.

Command search, full-page search and the read-only browser tool use the same SDK matching policy. Every searchable query term must occur across the selected fields; a title and body can satisfy the query together. Prefix matching supports incomplete words. An exact indexed title precedes incidental matches, with no site-specific boosts. Filters and chronological sorting keep their own meanings.

## One shared shell

The frame includes one dialog shell outside the template blocks. Search, Settings and Notes use that shared owner for opening, dismissal and focus return; a world changes its material, not its keyboard model. A full-page Search binding sends the header link and command shortcut to that page. Without it, the command tool remains available.

The command Search input keeps focus while the active result moves through the listbox. The first Escape collapses the results; the next closes the dialog and returns to its invoker. Full-page results use ordinary links and disclosure cards, not a listbox keyboard model.

## Full-page Search

Search results preserve their supplied title, excerpt, publication context and resolved destination. Its complete native catalogue remains usable without scripts or after acquisition failure. The shared page controller enhances it only after the whole selected corpus loads. Typing updates the bounded native SDK query, filters, chronology, complete counts and shareable query/page state.

The anchored native select picker uses the active domain’s tokens, with ordinary select fallback. Additional result context uses a compact native disclosure card beside a direct title link; it does not inherit command-listbox interaction. The shared depth carousel presents the actual results through native scrolling, selection and destination links.

The [Search pond](search-pond.md) is a separate decorative atmosphere, never a result graph or search data source; reduced motion retains its still treatment and usable results.

An exact keyword selection keeps its own context and URL parameter, separate from query text, taxonomy and projects. One-value facets remain out of the way unless selected.

Search keeps one results-count and pagination row above its depth carousel; no second bottom row repeats that navigation. Ordinary chronological article listings retain their own two-ended controls.

The page controller uses the captured public browser SDK. The command-search trigger stays hidden without JavaScript; the full-page catalogue remains readable. Acquisition failure preserves the existing reading paths.

Full-page result navigation retains the exact result, disclosure state and viewport offset on the source history entry; Back restores it after the native corpus renders, unless newer input intervenes.

The command-search fallback separately saves its raw query and native result identity. A reconstructed Back/Forward visit reopens that dialog with its context when native focus has not already recovered it and no newer input has intervened. Pointer and Enter preserve the same selection, including a retained browser document. A missing result is never replaced by its former ranking position.

Closing returns to the visible invoker, or the compact Menu when that trigger is no longer visible. The shared return owner consumes its bounded marker once and retains other history state; result navigation still uses the compiler serving URL. See the retained SDK's [provenance and licences](../scripts/vendor/gazette-search/README.md).

## Interrupting a carousel

The shared depth carousel keeps the nearest visible card selected while a button scroll is in flight. A new direction button builds on the pending destination, so quick presses keep moving. Direct scrolling, a drag, a scrolling selection, focus or resize can replace that destination. A context-only acknowledgement preserves it. At a finite end, only the direction that cannot move is disabled. Disposal removes the enhancement and its controls; ordinary result links remain.

## Checks

Run `node --test fixtures/search.test.mjs fixtures/search-page.test.mjs` for acquisition, keyboard, live page queries and result handling; `fixtures/reading.py` verifies native resource delivery. Browser checks remain separate.

[Back to Base](../README.md).
