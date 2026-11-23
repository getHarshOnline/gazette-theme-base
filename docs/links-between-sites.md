# Links and return visits

Gazette hands Base resolved link destinations and their relationships. Base shows the destination’s known identity while leaving the browser in charge of navigation and history.

## Destination marks

[The shared link macro](../templates/macros/links.html) preserves Gazette's resolved destination and relationship facts for structured links. Editorial links arrive with those facts already attached; Search copies the equivalent supplied facts. [Link signatures](../styles/_links.scss) draw them once from the crossing colours and mask geometry supplied by the token build. Adding a destination world changes its token signature, not Base’s selectors. A decorative `.world-mark` reads the same generated signature through `data-world-mark`; the consuming composition chooses its box size. Known destination worlds keep their small marks on same-site content links and links between sites; outside links have the external arrow, and an unknown cross-site world keeps the generic crossing cue. Destination identity and relationship kind remain separate. Primary actions keep their contrast-safe mark inside the capsule; folder cards mark the title. Local navigation, section fragments, corpus orientation, pagination and film progression already carry their own location signals. Reading-list, related-reading and chapter links share one minimum target with inline text flow, so the mark follows a wrapped title's last word. Optional crossing descriptions come from composing copy. A URL, site spelling or page title never chooses a world or invents a relationship.

## Return to the place left

The shell remembers an exact compiler link occurrence or authored link ID on the outgoing native history entry. A reconstructed Back/Forward visit restores that visible link after component exposure when the browser left focus at the document; it preserves existing focus and scroll and skips new visits, changed/ambiguous/hidden targets and newer user input. It never selects a product or opens a disclosure to manufacture a destination. `fixtures/return-focus.test.mjs` covers these bounded mechanics; actual browser traversal remains separate evidence.

Authored landing browsing uses native `browsing_locations` through the shared browsing-context partial. Content declares the association; the engine resolves its directory identity and serving route. The quiet context does not add article credits or imply editorial containment. Generated listing paths use the same browsing-item anatomy; the theme neither invents nor infers a directory.

## Machine reading

[The LLM index template](../templates/llms.txt) formats Gazette's selected catalogue and purpose text with the engine's Markdown filters. It keeps no second catalogue or site-specific paths. Selection, identity and output destinations belong to the engine.

[Back to Base](../README.md).
