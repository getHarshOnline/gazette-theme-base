# Navigation and footer

Gazette hands Base the publication identity and resolved navigation, contact and discovery destinations. Base places them in one shared frame across page families.

## Frame and header

On screen the shared body fills at least the dynamic viewport. Main absorbs spare height before the footer, keeping short-page content top-aligned and the footer at the lower edge. Long pages retain natural content height and normal scrolling; the footer never overlays their content. Print retains block flow without viewport filling. Home retains its authored cinematic distance.

Base owns the header frame. Home can keep the scene visible behind its masthead; interior pages and ambient openings use the shared graduating backdrop. The compact reading header has an opaque bed so moving prose cannot show between its controls. Contrast, transparency and forced-colour preferences select the solid fallback. Navigation capsules and opened directories retain their own surfaces. Worlds supply foreground and scene contrast without copying the shared backdrop recipe.

A section selected directly in navigation shows its menu label as plain text in the header's brand position. Home keeps the publication name; articles and documentation keep their visible content titles. Section pages retain one accessible H1 inside main and their full metadata title, without repeating the large heading below the header. Matching uses the configured content identity, so pagination and ordering keep the same section label.

Primary navigation remains visible in document flow without JavaScript, so a wrapped directory cannot cover section destinations. Every page family retains direct links on wide screens; with a configured Menu label, narrower screens use the shared disclosure. The expanded directory overlays the page without changing its geometry. It is locally scrollable, closes with Escape or keyboard departure and lets an open Search or Settings dialog handle its own dismissal. Worlds supply the directory's typography and arrangement. Supplied destination descriptions sit beside their links, hidden unless a world enables them for its expanded directory; they do not replace the configured link labels.

Worlds can mark only their scene's copy layer with the `frame-scene-copy` class. While the compact Home directory is open, that layer yields attention through `visibility: hidden`, including its links, without moving the artwork or changing scroll geometry. Closing restores the same text in place. A temporary scrim separates navigation from the underlying page. Ordinary prose remains present; the no-script form has neither suppression nor scrim.

Keyboard indication is painted once by `styles/_focus.scss`. The actual control owns its stable contour; worlds bind focus-ring colour and components bind clipping offsets. Visible native radios retain their own circular indication. Only positively identified hidden-radio presentations, the direct stretched heading link of film-card and the stretched title link of a selected catalogue entry delegate focus to their visible owner. Print removes keyboard indication centrally; checked, current, active-descendant and target states keep their separate meaning. Shared summaries retain their contextual control radius while open or closed.

Worlds may opt into `styles/_navigation.scss`'s `capsule` mixin. It supplies one shared header arrangement, rounded current-location control and optical directory, using the existing navigation markup and controller. A world binds contextual ink, paper and focus; Home may bind those roles to its scene. Only these navigation surfaces acquire the capsule contour and optical depth. The capsule does not paint a second full-width backdrop; the shared frame owns that surface, and analytical controls keep their own geometry. Consumers capture the partial and its optical dependency explicitly in their stylesheet inputs.

The shell measures `--frame-header-height` for panel clearance and `--frame-chrome` for sticky obstruction; these are runtime geometry, not authored token values.

Once the navigation controller is ready, compact screens retain the sticky header while text scrolls beneath it. Section links clear its measured obstruction. Without that controller, Base keeps the header static and reserves no sticky clearance. A world with an already overlaid Home masthead keeps that masthead fixed on screen, preserves scene contrast and restores static print flow. Open compact directories scroll internally without moving the reader's position; closing returns to that place.

## Footer

Ordinary pages and the generated relationship directory call [the same footer partial](../templates/partials/footer.html), with their inputs normalized at that boundary. The footer uses one Base-owned three-column, two-row grid: brand/description, rights-holder copyright/generator credit, then social/supporting destinations. Its roles share first text baselines in one grid and stack as complete groups on phones; no decorative gridlines are added. Copyright reads the native resolved rights holder (independent of publisher) and invocation render year. The keyed `base:generator-credit` destination supplies its native route; all credit wording comes from composing chrome. A world declares `base:theme-credit` and `base:theme-repository` in its manifest's `[chrome.regions]`, and the credit links that name to the theme's repository after the Gazette link; without both keys, as in Base alone, no theme link appears. Missing facts add no invented identity or date. One contact action uses the configured discovery address, falling back to correspondence.

`footer_treatment` supplies a surface context (`quiet` or `colophon`) independently of page mode. Worlds may use that context for material; it never changes the shared footer anatomy, addresses or available links. An About colophon does not acquire another display headline or a second invitation merely by selection.

Emitted feeds, sitemap and LLM discovery destinations appear in the footer's supporting group, including on generated views. Base uses the supplied labels and addresses; absent output or copy adds no link. Feed labels use `base:feed-atom`, `base:feed-rss` and `base:feed-json`; sitemap and LLM labels use `base:discovery-sitemap` and `base:discovery-llms`. Several feed channels retain their titles so the reader can distinguish otherwise identical formats. Sitemap partition files are not advertised separately. Head discovery uses the same emitted feeds. These links announce available files; they do not enable publishing or subscriptions. `python3 -B fixtures/feeds.py --gazette /path/to/gazette` checks empty, eligible, omitted and multiple-channel cases.

## Closings

A prominent services invitation is a separate authored-page closing, not another footer. Its selection and placement are described in [page families](page-families.md#services-closings).

[Back to Base](../README.md).
