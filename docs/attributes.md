# Attributes and their writers

Gazette hands Base resolved page and presentation facts. Base writes those facts and its own interaction state onto the elements that use them. A world reads these attributes for presentation and supplies the documented template choices; it does not become another writer of shared state. Semantic HTML such as `aria-current`, `checked`, `open` and `hidden` remains the accessible account, not a decorative data attribute.

## Base-written attributes

Every row below has a writer in Base’s current source. Presence markers have no meaningful string value: their presence locates a part or marks a state. Attributes that carry labels retain the supplied copy; labels are not state keys. Script state may be absent before enhancement or restored during cleanup. For exact component arguments, use [the manifest](../presentation.toml).

Gazette also writes destination facts onto compiled Markdown links. Base’s link macro and runtime helper project the same resolved facts onto links they create; they do not replace the engine’s resolver. Gazette’s `docs/theme-reference.md` owns the supplied facts and external component wrappers.

<!-- base-attribute-inventory -->

### Page, navigation and preferences

| Attribute | Values and location | Writer | A world may |
| --- | --- | --- | --- |
| `data-amplitude` | `4` on the ambient opening and `3` on the shared project explanation. These annotations are currently unread, not runtime enforcement. | [ambient-hero.html](../templates/components/ambient-hero.html), [project-explanation.html](../templates/components/project-explanation.html) | Style the supplied element; retain its shared behavior. |
| `data-collapsed` | `true` or `false` on the header navigation, describing its compact disclosure. | [shell.js](../scripts/shell.js), [header.html](../templates/partials/header.html) | Style the supplied element; retain its shared behavior. |
| `data-enquiry-button` | `services-footer`, `services-invitation`, `services-link` or `enquiry-email` on the corresponding link. Carries a public action identity for enquiry context and separately consented measurement. | [footer.html](../templates/partials/footer.html), [invitations.html](../templates/macros/invitations.html), [enquiry-context.js](../scripts/enquiry-context.js) | Retain the supplied action identity. |
| `data-family` | Supplied page-family kind on `main`, only for a page structure. | [page.html](../templates/page.html) | Style the supplied element; retain its shared behavior. |
| `data-footer-treatment` | `quiet` or `colophon` on the page root. | [not-found.html](../templates/not-found.html), [page.html](../templates/page.html) | Select material for the context; retain the one footer anatomy. |
| `data-heading-level` | The supplied heading level on each local-outline list item. | [reading-outline.html](../templates/partials/reading-outline.html) | Style the supplied element; retain its shared behavior. |
| `data-mode` | `light`, `dark` or `system` on the root; may be absent before an explicit choice. | [settings.js](../scripts/settings.js), [preferences.html](../templates/partials/preferences.html) | Bind presentation values; leave preference selection and restoration to Base. |
| `data-motion` | `reduce` or `allow` on the root; absence follows the system preference. | [settings.js](../scripts/settings.js), [preferences.html](../templates/partials/preferences.html), [social-card.html](../templates/social-card.html) | Bind presentation values; leave preference selection and restoration to Base. |
| `data-navigation-mode` | `compact` or `direct` on the header after initial restore or controller measurement. | [shell.js](../scripts/shell.js), [header.html](../templates/partials/header.html) | Style the supplied element; retain its shared behavior. |
| `data-page-mode` | One of the ten [page modes](page-families.md#defaults-and-scoped-exceptions), on the root; alias uses `utility`, graph uses `index`. | [not-found.html](../templates/not-found.html), [alias.html](../templates/alias.html), [graph.html](../templates/graph.html), [page.html](../templates/page.html) | Use a scoped frame-block override recorded in WORLD.md; retain the task’s meaning. |
| `data-palette` | Supplied palette identity on the page or graph root, when present. | [not-found.html](../templates/not-found.html), [graph.html](../templates/graph.html), [page.html](../templates/page.html), [social-card.html](../templates/social-card.html) | Style the supplied element; retain its shared behavior. |
| `data-structure` | Supplied structure kind on `main`. | [page.html](../templates/page.html) | Style the supplied element; retain its shared behavior. |
| `data-section-title` | Navigation label or index-page title on `main`, excluding Home, articles and documentation. | [page.html](../templates/page.html) | The unlinked masthead label is the page’s single H1. The compiler’s opening projection removes a repeated body heading; content titles remain in metadata. |
| `data-surface` | `not-found` on the recovery page’s main region. | [not-found.html](../templates/not-found.html) | Style the supplied surface; retain recovery actions. |

### Shell and reading controls

| Attribute | Values and location | Writer | A world may |
| --- | --- | --- | --- |
| `data-command-trigger` | `settings`, `search` or `notes` on the corresponding trigger. | [page.html](../templates/page.html), [reading-outline.html](../templates/partials/reading-outline.html), [search-trigger.html](../templates/partials/search-trigger.html), [shell.html](../templates/partials/shell.html) | Style the supplied element; retain its shared behavior. |
| `data-media-expand` | Supplied image-expansion action label on the media tenant. | [shell.html](../templates/partials/shell.html) | Style the supplied element; retain its shared behavior. |
| `data-media-images` | Presence marker on the JSON script containing admitted page image occurrences. | [shell.html](../templates/partials/shell.html) | Style the supplied element; retain its shared behavior. |
| `data-media-expanded` | Marks the exact interactive drawing moved into the viewer until it returns to the article. | [media-viewer.js](../scripts/media-viewer.js) | Fit the drawing to the viewer without changing its contents or state. |
| `data-media-fit` | Restores the complete figure within the viewer pane. | [shell.html](../templates/partials/shell.html) | Retain the shared control and its pressed state. |
| `data-media-size` | Enlarges the current figure for detail inspection. | [shell.html](../templates/partials/shell.html) | Retain the shared control and its disabled state. |
| `data-media-standalone` | Identifies a standalone drawing and its enlargement control. | [media-viewer.js](../scripts/media-viewer.js) | Centre the drawing and keep the control below it. |
| `data-media-pending` | Reserves a described standalone image’s control while that image loads. | [media-viewer.js](../scripts/media-viewer.js) | Keep its space but hide it from sight and keyboard until usable. |
| `data-gazette-image-media` | The `media` Gazette emitted on an image's dark `source`, kept while a reader choice replaces it. | [image-modes.js](../scripts/image-modes.js) | Leave it to Base; set the world's starting mode with `initial_color_mode`. |
| `data-portrait-src` | A portrait still's original `src`, kept while a colour-mode swap outside a mode `picture` replaces it. | [continuous-portrait.js](../scripts/continuous-portrait.js) | Leave it to Base. |
| `data-portrait-srcset` | The same still's original `srcset`, restored with its original rendition. | [continuous-portrait.js](../scripts/continuous-portrait.js) | Leave it to Base. |
| `data-media-inspection` | `off` keeps a composition's scene image out of the enlargement viewer. | [ambient-still.html](../templates/components/ambient-still.html) | Retain the image, its description and colour renditions; omit the separate enlargement action. |
| `data-cell-id` | The notebook's own cell ID on each `notebook-markdown` and `notebook-code` cell in Notes. | [notebooks.html](../templates/partials/notebooks.html) | Style the supplied element; retain its shared behavior. |
| `data-execution-count` | The stored execution count on a `notebook-code` cell, or `null` when the notebook recorded none. | [notebooks.html](../templates/partials/notebooks.html) | Style the supplied element; retain its shared behavior. |
| `data-reading-initial` | Marks the initial reading-header row and its working outline link. | [header.html](../templates/partials/header.html) | Retain the row while Base replaces its link with the section control. |
| `data-reader-focus-enter` | Supplied enter-focus label on the reading-focus button. | [reading-outline.html](../templates/partials/reading-outline.html) | Style the supplied element; retain its shared behavior. |
| `data-reader-focus-exit` | Supplied leave-focus label on the same button. | [reading-outline.html](../templates/partials/reading-outline.html) | Style the supplied element; retain its shared behavior. |
| `data-scalable` | Presence marker on the media viewer's image when its source is a scalable drawing that fills the viewer. | [media-viewer.js](../scripts/media-viewer.js) | Style the supplied element; retain its shared behavior. |
| `data-search-label` | Localized Search action, retained when [shell.js](../scripts/shell.js) appends the visible platform shortcut to the accessible name. | [search-trigger.html](../templates/partials/search-trigger.html) | Keep this label on the shortcut’s parent control. |
| `data-search-shortcut` | Presence marker on the Search shortcut hint. | [search-trigger.html](../templates/partials/search-trigger.html) | Style the supplied element; retain its shared behavior. |
| `data-setting` | `color-mode` or `motion-preference` on the settings fieldset. | [shell.html](../templates/partials/shell.html) | Style the supplied element; retain its shared behavior. |
| `data-settings-status` | Presence marker on the Settings status message. | [shell.html](../templates/partials/shell.html) | Style the supplied element; retain its shared behavior. |
| `data-shell` | Presence marker on the shared shell root. | [shell.html](../templates/partials/shell.html) | Style the supplied element; retain its shared behavior. |
| `data-shell-state` | `open` or `closed` on the shell after enhancement. | [shell.js](../scripts/shell.js) | Style the supplied element; retain its shared behavior. |
| `data-storage-unavailable` | Supplied storage-failure copy on the Settings status message. | [shell.html](../templates/partials/shell.html) | Style the supplied element; retain its shared behavior. |
| `data-tenant` | `settings`, `search`, `notes` or `media` on its section. | [shell.html](../templates/partials/shell.html) | Style the tenant; preserve shared dismissal, focus and content ownership. |
| `data-tenant-title` | Supplied title on each tenant section. | [shell.html](../templates/partials/shell.html) | Keep copy with its configured owner; do not use it as an identity or state key. |

### Cards, catalogues and disclosures

| Attribute | Values and location | Writer | A world may |
| --- | --- | --- | --- |
| `data-active` | `true` or `false` on catalogue cards/details and quote-deck slots. | [catalogue.js](../scripts/catalogue.js), [quote-deck.js](../scripts/quote-deck.js) | Style the supplied element; retain its shared behavior. |
| `data-article-listing` | Presence marker on the generated article-listing section. | [listing.html](../templates/partials/listing.html) | Style the supplied element; retain its shared behavior. |
| `data-autoplay` | `true` or `false` on catalogue and quote-deck roots, from their supplied/default arguments. | [catalogue.html](../templates/components/catalogue.html), [decks.html](../templates/macros/decks.html) | Style the supplied element; retain its shared behavior. |
| `data-bookmark-card` | Presence marker on About and service-example bookmark forms. | [about-choice.html](../templates/components/about-choice.html), [service-example.html](../templates/components/service-example.html) | Style the supplied element; retain its shared behavior. |
| `data-bookmark-ready` | `true` once the bookmark enhancement has drawn its contour. | [bookmark-card.js](../scripts/bookmark-card.js) | Style the supplied element; retain its shared behavior. |
| `data-bookmark-title` | `true` on the existing heading or definition term right-aligned in the existing raised area. | [bookmark-card.js](../scripts/bookmark-card.js) | Keep the title's semantics and measured wrapping. |
| `data-catalogue-clone` | `true` on a catalogue presentation clone. | [catalogue.js](../scripts/catalogue.js) | Style the supplied element; retain its shared behavior. |
| `data-catalogue-next` | Presence marker on the next control for the catalogue presentation. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-catalogue-playback` | Presence marker on the optional catalogue pause/resume control. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-catalogue-previous` | Presence marker on the previous control for the catalogue presentation. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-content-deck` | Presence marker for a deck composed from owned content entries. | [decks.html](../templates/macros/decks.html) | Style the supplied element; retain its shared behavior. |
| `data-deck-field` | `container` or `viewport` on the quote deck, from its declared field choice. | [decks.html](../templates/macros/decks.html) | Style the supplied element; retain its shared behavior. |
| `data-deck-label` | Supplied item title, or quote attribution with optional detail, on a deck item. | [quote-item.html](../templates/components/quote-item.html), [decks.html](../templates/macros/decks.html) | Style the supplied element; retain its shared behavior. |
| `data-depth-active` | Presence marker on the selected card in the shared depth carousel’s default configuration. | [depth-carousel.js](../scripts/depth-carousel.js) | Style the supplied element; retain its shared behavior. |
| `data-depth-next` | Presence marker on the next control for the depth presentation. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-depth-previous` | Presence marker on the previous control for the depth presentation. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-discovery-next` | Supplied next-choice label on that explorer. | [reading-related.html](../templates/partials/reading-related.html) | Style the supplied element; retain its shared behavior. |
| `data-discovery-origin` | Supplied current content title on the related-reading explorer. | [reading-related.html](../templates/partials/reading-related.html) | Style the supplied element; retain its shared behavior. |
| `data-discovery-previous` | Supplied previous-choice label on that explorer. | [reading-related.html](../templates/partials/reading-related.html) | Style the supplied element; retain its shared behavior. |
| `data-dragging` | `true` during a held catalogue or quote-deck drag; absent otherwise. | [catalogue.js](../scripts/catalogue.js), [quote-deck.js](../scripts/quote-deck.js) | Style the supplied element; retain its shared behavior. |
| `data-focus-mode` | `auto`, `manual` or `once` on a focus-reveal region; default `auto`. | [focus-reveal.html](../templates/components/focus-reveal.html), [invitations.html](../templates/macros/invitations.html) | Style the supplied element; retain its shared behavior. |
| `data-focus-reveal` | Presence marker on a shared invitation eligible for focus-reveal enhancement. | [invitations.html](../templates/macros/invitations.html) | Style the supplied element; retain its shared behavior. |
| `data-focus-state` | `complete`, `paused`, `static` or `active` on the enhanced reveal region. | [focus-reveal.js](../scripts/focus-reveal.js) | Style the supplied element; retain its shared behavior. |
| `data-folder-card` | Presence marker on a folder card’s link or unlinked container. | [catalogue-entry.html](../templates/components/catalogue-entry.html), [folder-card.html](../templates/partials/folder-card.html) | Style the supplied element; retain its shared behavior. |
| `data-folder-ready` | `true` once the folder-card enhancement has drawn its contour. | [folder-card.js](../scripts/folder-card.js) | Style the supplied element; retain its shared behavior. |
| `data-pause-label` | Supplied pause copy on a shared carousel playback button. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-process-autoplay` | `true` only when the authored process enables autoplay; absent otherwise. | [process-path.html](../templates/components/process-path.html) | Style the supplied element; retain its shared behavior. |
| `data-process-collapsible` | `true` only when the process permits closing its current step; absent otherwise. | [process-path.html](../templates/components/process-path.html) | Style the supplied element; retain its shared behavior. |
| `data-process-playing` | Presence marker while the process autoplay is actually running. | [process-path.js](../scripts/process-path.js) | Style the supplied element; retain its shared behavior. |
| `data-quote-clone` | `true` on a quote-deck presentation clone. | [quote-deck.js](../scripts/quote-deck.js) | Style the supplied element; retain its shared behavior. |
| `data-quote-next` | Presence marker on the next control for the quote presentation. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-quote-playback` | Presence marker on the optional quote pause/resume control. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-quote-previous` | Presence marker on the previous control for the quote presentation. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-reduced` | `true` or `false` on an enhanced quote deck, reflecting resolved motion preference. | [quote-deck.js](../scripts/quote-deck.js) | Style the supplied element; retain its shared behavior. |
| `data-resume` | Supplied resume label on a process or focus-reveal pause button. | [focus-reveal.html](../templates/components/focus-reveal.html), [process-path.html](../templates/components/process-path.html) | Style the supplied element; retain its shared behavior. |
| `data-resume-label` | Supplied resume copy on the same button. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-search-active` | Presence marker on the selected Search depth card. | [depth-carousel.js](../scripts/depth-carousel.js) | Style the supplied element; retain its shared behavior. |
| `data-search-depth-next` | Presence marker on the next control for the search-depth presentation. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-search-depth-previous` | Presence marker on the previous control for the search-depth presentation. | [carousel-controls.html](../templates/macros/carousel-controls.html) | Style the supplied element; retain its shared behavior. |
| `data-wheel` | `true` or `false` on a quote deck, selecting its optional wheel behavior. | [decks.html](../templates/macros/decks.html) | Style the supplied element; retain its shared behavior. |

### Scenes and playback

| Attribute | Values and location | Writer | A world may |
| --- | --- | --- | --- |
| `data-ambient-pause` | Presence marker on that control’s pause label. | [ambient-hero.html](../templates/components/ambient-hero.html) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-ambient-play` | Presence marker on that control’s play label. | [ambient-hero.html](../templates/components/ambient-hero.html) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-ambient-position` | `before`, `entering`, `within`, `leaving` or `after` on the ambient wrapper, measured from viewport geometry. | [ambient-video.js](../scripts/ambient-video.js) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-ambient-ready` | `true` or `false` on the ambient wrapper; the pose player writes `true` while enhanced and removes/restores it on release. | [ambient-poses.js](../scripts/ambient-poses.js), [ambient-video.js](../scripts/ambient-video.js) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-ambient-state` | `error`, `still`, `ready`, `playing` or `paused` on the ambient wrapper. | [ambient-video.js](../scripts/ambient-video.js) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-ambient-toggle` | Presence marker on the ambient playback control. | [ambient-hero.html](../templates/components/ambient-hero.html) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-ambient-visible` | `true` or `false` on the ambient wrapper, from its visibility observer. | [ambient-video.js](../scripts/ambient-video.js) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-field-position` | `before`, `pinned`, `leaving` or `after` on the field wrapper. | [field-sequence.js](../scripts/field-sequence.js) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-film-layout` | `flow` or `pinned` on the film wrapper, from its selected film model. | [cinematic-film.js](../scripts/cinematic-film.js) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-film-line` | Presence marker on supplied or prepared film-copy lines. | [cinematic-film.js](../scripts/cinematic-film.js), [film-premise.html](../templates/components/film-premise.html) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-film-position` | `before`, `pinned`, `leaving` or `after` on the film wrapper. | [cinematic-film.js](../scripts/cinematic-film.js) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-film-running` | `true` or `false` on the grain element, from the film-surface lifecycle. | [film-surface.js](../scripts/film-surface.js) | Style the observed state; do not create a second player, geometry clock or preference writer. |
| `data-island-state` | `still`, `preparing` or `drawn` on scene wrappers; individual players use the states they need. | [cinematic-film.js](../scripts/cinematic-film.js), [field-sequence.js](../scripts/field-sequence.js), [sequence.js](../scripts/sequence.js) | Style the observed state; do not create a second player, geometry clock or preference writer. |

### Destination links and tables

| Attribute | Values and location | Writer | A world may |
| --- | --- | --- | --- |
| `data-gazette-destination-content` | Supplied destination content identity, when known. | [crossings.js](../scripts/crossings.js), [links.html](../templates/macros/links.html) | Style the supplied destination; never reconstruct identity or routing from URL spelling. |
| `data-gazette-destination-kind` | Resolved `internal-native`, `cross-site`, `external` or `resource` on a link. | [crossings.js](../scripts/crossings.js), [links.html](../templates/macros/links.html) | Style the supplied destination; never reconstruct identity or routing from URL spelling. |
| `data-gazette-destination-palette` | Supplied destination palette identity, when applicable. | [crossings.js](../scripts/crossings.js), [links.html](../templates/macros/links.html) | Style the supplied destination; never reconstruct identity or routing from URL spelling. |
| `data-gazette-destination-relationships` | Space-separated supplied relationship names, when present. | [crossings.js](../scripts/crossings.js), [links.html](../templates/macros/links.html) | Style the supplied destination; never reconstruct identity or routing from URL spelling. |
| `data-gazette-destination-site` | Supplied destination site identity, when known. | [crossings.js](../scripts/crossings.js), [links.html](../templates/macros/links.html) | Style the supplied destination; never reconstruct identity or routing from URL spelling. |
| `data-gazette-destination-theme` | Supplied destination theme identity, when applicable. | [crossings.js](../scripts/crossings.js), [links.html](../templates/macros/links.html) | Style the supplied destination; never reconstruct identity or routing from URL spelling. |
| `data-gazette-table` | Empty marker on a table’s local scrolling wrapper, created only if the renderer did not already supply one. | [reading-overflow.js](../scripts/reading-overflow.js) | Style local overflow; preserve table content and keyboard access. |
| `data-relationship` | `crossing` for cross-site, `external` for external, otherwise `native`, on a projected link. | [crossings.js](../scripts/crossings.js), [links.html](../templates/macros/links.html) | Style the supplied destination; never reconstruct identity or routing from URL spelling. |

### Search labels and state

| Attribute | Values and location | Writer | A world may |
| --- | --- | --- | --- |
| `data-search-about` | Supplied about metadata label on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; do not infer metadata from the label. |
| `data-search-any` | Supplied empty-filter choice label on full-page Search. | [search.html](../templates/macros/search.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-search-author` | Supplied author metadata label on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; do not infer metadata from the label. |
| `data-search-context` | Supplied additional-context label on full-page Search. | [search.html](../templates/macros/search.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-search-count` | Supplied plural result-count text on full-page Search. | [search.html](../templates/macros/search.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-search-count-one` | Supplied singular result-count text on full-page Search. | [search.html](../templates/macros/search.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-search-initial-page` | The supplied initial result/listing page number on full-page Search. | [search.html](../templates/macros/search.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-search-keyword` | Supplied keyword label on full-page Search. | [search.html](../templates/macros/search.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-search-kind` | Supplied kind metadata label on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; do not infer metadata from the label. |
| `data-search-kind-article` | Supplied label for article results on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; result identity comes from Gazette. |
| `data-search-kind-collection` | Supplied label for collection results on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; result identity comes from Gazette. |
| `data-search-kind-documentation` | Supplied label for documentation results on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; result identity comes from Gazette. |
| `data-search-kind-extension` | Supplied label for extension results on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; result identity comes from Gazette. |
| `data-search-kind-index` | Supplied label for index results on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; result identity comes from Gazette. |
| `data-search-kind-journey` | Supplied label for journey results on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; result identity comes from Gazette. |
| `data-search-kind-project` | Supplied label for project results on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; result identity comes from Gazette. |
| `data-search-kind-utility` | Supplied label for utility results on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; result identity comes from Gazette. |
| `data-search-language` | Supplied language metadata label on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; do not infer metadata from the label. |
| `data-search-mentions` | Supplied mentions metadata label on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; do not infer metadata from the label. |
| `data-search-modified` | Supplied modified metadata label on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; do not infer metadata from the label. |
| `data-search-page-size` | The supplied page size when present, on full-page Search. | [search.html](../templates/macros/search.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-search-pagination` | Supplied page-status text on full-page Search. | [search.html](../templates/macros/search.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-search-written` | Supplied date label for draft results in command and full-page search. | [search.html](../templates/macros/search.html) | Select by the record’s lifecycle; preserve the original datetime. |
| `data-search-date-format` | Calendar-date format shared with native reading metadata. | [search.html](../templates/macros/search.html) | Unsupported browser formats retain the original date value. |
| `data-search-date-months` | Twelve full month names, separated by `\|`, from the native date formatter. | [search.html](../templates/macros/search.html) | Preserve authored calendar dates without converting timezone. |
| `data-search-date-months-short` | Twelve short month names from the same formatter, in calendar order. | [search.html](../templates/macros/search.html) | Keep the names with their corresponding format. |
| `data-search-published` | Supplied published metadata label on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; do not infer metadata from the label. |
| `data-search-query-limit` | Supplied query-limit message on full-page Search. | [search.html](../templates/macros/search.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-search-retry` | Presence marker on the Search retry button, shown only while the index is unavailable, in the shell tenant and on the full Search page. | [shell.html](../templates/partials/shell.html), [search.html](../templates/macros/search.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-search-rights-holder` | Supplied rights holder metadata label on full-page Search. | [search.html](../templates/macros/search.html) | Keep the configured copy; do not infer metadata from the label. |
| `data-search-view-page` | Supplied view-page action label on full-page Search. | [search.html](../templates/macros/search.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-source-site` | The serving site identity on full-page Search or the Search tenant. | [search.html](../templates/macros/search.html), [shell.html](../templates/partials/shell.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-status-empty` | Supplied empty-result message on the Search status element. | [search.html](../templates/macros/search.html), [shell.html](../templates/partials/shell.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-status-idle` | Optional supplied idle message on shell Search status. | [shell.html](../templates/partials/shell.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-status-loading` | Supplied loading message on Search or analytics status. | [search.html](../templates/macros/search.html), [analytics-consent.html](../templates/partials/analytics-consent.html), [shell.html](../templates/partials/shell.html) | Retain the supplied copy and the state it describes. |
| `data-status-results` | Optional supplied result-count message on shell Search status. | [shell.html](../templates/partials/shell.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |
| `data-status-unavailable` | Supplied unavailable message on the Search status element. | [search.html](../templates/macros/search.html), [shell.html](../templates/partials/shell.html) | Retain supplied labels and query/result meaning; style the existing Search composition. |

### Analytics consent

| Attribute | Values and location | Writer | A world may |
| --- | --- | --- | --- |
| `data-analytics-binding` | Compiled public analytics configuration on a JSON script. | [analytics-consent.html](../templates/partials/analytics-consent.html) | Style the existing controls; preserve equal choices, withdrawal and supplied copy. |
| `data-analytics-consent` | Presence marker on the consent fieldset, hidden until its controller can run. | [analytics-consent.html](../templates/partials/analytics-consent.html) | Style the existing controls; preserve equal choices, withdrawal and supplied copy. |
| `data-analytics-reload` | Presence marker on the explicit reload action after withdrawal. | [analytics-consent.html](../templates/partials/analytics-consent.html) | Style the existing controls; preserve equal choices, withdrawal and supplied copy. |
| `data-analytics-status` | Presence marker on the live consent and loading status. | [analytics-consent.html](../templates/partials/analytics-consent.html) | Style the existing controls; preserve equal choices, withdrawal and supplied copy. |
| `data-analytics-storage` | Presence marker on the warning that a preference could not be saved. | [analytics-consent.html](../templates/partials/analytics-consent.html) | Style the existing controls; preserve equal choices, withdrawal and supplied copy. |
| `data-status-off` | Supplied copy for analytics being off on this page. | [analytics-consent.html](../templates/partials/analytics-consent.html) | Style the existing controls; preserve equal choices, withdrawal and supplied copy. |
| `data-status-on` | Supplied copy for analytics running with consent. | [analytics-consent.html](../templates/partials/analytics-consent.html) | Style the existing controls; preserve equal choices, withdrawal and supplied copy. |
| `data-status-failed` | Supplied copy for analytics failing to start. | [analytics-consent.html](../templates/partials/analytics-consent.html) | Style the existing controls; preserve equal choices, withdrawal and supplied copy. |
| `data-status-reload` | Supplied copy explaining a fresh document is needed to grant again. | [analytics-consent.html](../templates/partials/analytics-consent.html) | Style the existing controls; preserve equal choices, withdrawal and supplied copy. |

### Selection assistance

| Attribute | Values and location | Writer | A world may |
| --- | --- | --- | --- |
| `data-article-title` | Supplied content title on the assistance popover. | [selection-assistance.html](../templates/partials/selection-assistance.html) | Keep source identity and configured providers; send nothing before reader activation. |
| `data-article-url` | Canonical page URL on the assistance popover. | [selection-assistance.html](../templates/partials/selection-assistance.html) | Keep source identity and configured providers; send nothing before reader activation. |
| `data-selection-assistance` | Presence marker on the selection-assistance popover. | [selection-assistance.html](../templates/partials/selection-assistance.html) | Keep source identity and configured providers; send nothing before reader activation. |
| `data-selection-configuration` | Presence marker on its JSON script containing the resolved assistance configuration. | [selection-assistance.html](../templates/partials/selection-assistance.html) | Keep source identity and configured providers; send nothing before reader activation. |
| `data-selection-provider` | Supplied provider identity on its explicit handoff link. | [selection-assistance.html](../templates/partials/selection-assistance.html) | Keep source identity and configured providers; send nothing before reader activation. |
| `data-selection-scope` | Presence marker on `main` for a page eligible for optional selection assistance. | [page.html](../templates/page.html) | Keep source identity and configured providers; send nothing before reader activation. |
| `data-site-name` | Supplied publication brand name on the assistance popover. | [selection-assistance.html](../templates/partials/selection-assistance.html) | Keep source identity and configured providers; send nothing before reader activation. |
| `data-site-url` | Supplied publication home URL on the assistance popover. | [selection-assistance.html](../templates/partials/selection-assistance.html) | Keep source identity and configured providers; send nothing before reader activation. |

### Sharing images

| Attribute | Values and location | Writer | A world may |
| --- | --- | --- | --- |
| `data-social-card-source` | Inert template containing the resolved home body used to select the card's media and title. | [social-card.html](../templates/social-card.html) | Inherit the source container. |
| `data-social-card-media` | The selected image or video frame fills the thumbnail with a centred crop. | [social-card.html](../templates/social-card.html) | Keep the artwork full bleed. |
| `data-social-card-title` | Hidden capture evidence filled from the home heading. The shared thumbnail carries the visual, and each page supplies its title and description in its share tags. | [social-card.html](../templates/social-card.html) | Keep the marker out of the captured composition. |
| `data-treatment` | `monochrome` on the generated canvas when the source requests the shared film treatment. | [social-card-media.js](../scripts/social-card-media.js) | Retain the selected treatment. |

<!-- /base-attribute-inventory -->

## Inputs written elsewhere

These are read by Base but are not part of its writer inventory. Keep their owning contract when changing a consumer.

| Attribute | Writer and role | Base’s reader |
| --- | --- | --- |
| `data-gazette-component` | Gazette’s component renderer names the enhanced component wrapper. | Shared component controllers locate their wrapper. |
| `data-gazette-component-address` | Gazette supplies the component occurrence address when context exists. | [Catalogue](../scripts/catalogue.js) keys saved context to that occurrence. |
| `data-gazette-fallback` | Gazette marks the complete fallback region. | Shared styles keep it available without enhancement. |
| `data-gazette-mount` | Gazette marks the controller’s mount region. | Scene and process styles position the enhanced surface. |
| `data-gazette-image` | Gazette’s Markdown renderer supplies the page/namespace image occurrence address. | [Media viewer](../scripts/media-viewer.js) matches address and destination against the admitted image list. |
| `data-gazette-image-block` | Gazette’s Markdown renderer marks a paragraph containing only one image or image-only link. | Shared reading styles centre that block; the viewer places its action beneath the displayed image. |
| `data-gazette-image-ref` | An article enhancement puts the original image occurrence address on its complete styled drawing wrapper, keeping the fallback outside it. | [Media viewer](../scripts/media-viewer.js) moves and restores that exact wrapper; duplicate or unknown references offer no enlargement. |
| `data-gazette-image-sized` | Gazette’s Markdown renderer marks an image with an authored display width, separately from its intrinsic dimensions. | Shared reading styles fit its figure and caption to the declared drawing width; intrinsic dimensions alone only reserve image space. |
| `data-gazette-link` | Gazette’s Markdown renderer supplies the exact link occurrence address. | [Return focus](../scripts/return-focus.js) restores the followed link, without choosing a route or scroll position. |
| `data-line-breaks` | Lattice’s relation-title component supplies comma-separated word break positions. | [Field sequence](../scripts/field-sequence.js) arranges the supplied title and restores it on release. |
| `data-portrait-scene` | Chronicle’s character-encounter component marks the source-owned scene. | [Continuous portrait](../scripts/continuous-portrait.js) locates the reveal surface. |
| `data-reveal-rail` | Chronicle’s encounter-choices component marks its single choice rail. | Continuous portrait attaches Base’s shared reveal-rail behavior. |
| `data-world-mark` | Nocturne’s `painted-film` and `painted-interval` templates put `nocturne` on decorative `.world-mark` elements. | [Link signatures](../styles/_links.scss) draw the generated [destination mark](links-between-sites.md#destination-marks); the composition chooses its box size. |

## Unbuilt attributes are not a current contract

`data-world` has a style reader for a future world enclave but no current writer. `data-context`, `data-lifecycle`, `data-prominence`, `data-near`, `data-side` and `data-process-state` have no current writer either; the other six names are absent from Base’s runtime sources. They are not available component features. Future enclave previews and world motifs need their own implementation before these names enter the writer table. Do not add them to content to make an effect appear.

## Check a change

Run `python3 fixtures/attributes.py` from the repository root. The shared `fixtures/check.py` runs the same check before runtime and native composition checks. It fails for a missing writer row, a row without a writer, mismatched writer links, duplicate rows or a computed writer it cannot resolve. The check reads template output, inline scripts, literal attribute calls, dataset writes and the actual carousel/settings inputs; comments, selectors and attribute reads do not count as writers. Snapshot restoration calls restore an existing contract rather than introducing one. A new writing idiom needs explicit scanner support and a focused case before use.

This is a source-inventory check. It does not establish that every state is reachable or visually correct. Inspect the template, controller, style and affected world together when changing behavior. [Settings and states](settings-and-states.md), [films and scenes](films-and-scenes.md) and [page families](page-families.md) explain those shared responsibilities.

## Geometry is measured, not authored

The shell measures `--frame-header-height` for panel clearance and `--frame-chrome` for sticky obstruction. Components measure their own positions and use those shared clearances. These values describe the current layout; a world does not replace them with a guessed fixed height.

[Back to Base](../README.md).
