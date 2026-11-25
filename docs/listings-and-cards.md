# Listings and cards

Gazette hands Base the selected entries, their order and their resolved destinations. Base chooses the shared composition that makes that relationship readable; it does not select another membership or sort.

## Openings and reading lists

Generated listings keep their authored introduction with the single title and each supplied entry description. The theme uses compiled destinations without duplicating a catalogue.

`page-opening` keeps one authored heading and its complete introductory context together. Its default is a compact, left-aligned stack; explicit `layout = "paired"` supports a meaningful title/context register. Worlds may bind the pair's tracks, gap and title scale through expression parameters, without copying its spacing and phone flow. A qualification that governs the choices belongs inside this entrance. The selector or catalogue follows as its own complete group.

Generated directories use the same compact recipe through `partials/title-group.html`; their heading and description come from native metadata, with no duplicate authored introduction. A compact entrance does not force its card field to full width. A world's complete directory may retain a separate title column beside its entries; the heading and premise stay together inside that column.

Project entrances use the same anatomy. A short name followed by its premise normally stays stacked; a separate title column needs an actual title/context relationship. Supplied qualifications remain with their claim, without a role inferred from paragraph position.

The engine supplies listing membership, order, pagination, dates and resolved attributions. Base presents each entry as one reading track: linked title, linked authors and date, then its supplied description. Entry heights follow the text; long titles and metadata wrap. Generated directories show one visible page title; an authored heading supplies it where present. Authored collection introductions and explicit folder compositions keep their own purpose. Worlds supply their type and material roles, without separate generated-list grids or inflated title/summary columns.

[The author macro](../templates/macros/authors.html) uses the same resolved attribution on articles and list entries. Supplied author websites become links; an author without one remains text. Neither a publisher role nor a display name creates a website. The engine's identity and JSON-LD rules remain in its contract.

Generated reading lists share one controls partial above and below their entries. Base presents the supplied page window and gaps, marks the current page, and renders unavailable boundary actions as text. Chronology choices appear once, above the entries, and lead to their supplied first page; page links at both ends keep the chosen order. Controls wrap in the world's type and material, and work without scripts. A single-page list omits the pager. Older contexts can retain their supplied previous/next links and ordinal. The theme neither sorts a partial DOM list nor calculates routes, counts or a second catalogue.

Product article views reuse the same reading list and controls, with a compact product scope and return link when supplied. The empty state adds no repeated sorting controls. An article keeps its canonical publication and crossing treatment even when listed elsewhere. Base does not match titles, tags, HTML or source folders to invent membership.

A product's Mentions view uses the ordinary reading list with its supplied scope and empty-state copy. Standalone and collected writing remain one account per article. An optional Explore more action uses the resolved unfiltered index; Base does not construct a route or repeat the publication identity.

## Collection entrances and illustrated choices

`preview-set` composes native `view` entries as an illustrated directory. An optional plain-text `label` creates a named fieldset with its visible legend when the group needs that context. Without a label it emits a plain container, with no fieldset, legend or hidden substitute. Catalogues already identified by their page navigation omit the redundant label at the source. The choices retain their own native labels, shared group name and selected behavior in either form. An optional plain-text `description` supplies each choice's premise; its body keeps the image, destination and complete qualification. The optional `preview-caption` component keeps its authored title, native destination and qualification in one group without reconstructing body paragraphs.

Without enhancement every entry reads in sequence. `module:preview-tabs` joins native radio choices to a shared picture frame, expands the selected premise and coordinates the image fade and settling. Mouse movement explores; keyboard focus and focused destination links retain their selection. Native Back restoration reconciles exposure without moving entries. Base owns the join, phone sequence, instant reduced motion and complete print form; worlds supply type and material.

One decorative measured contour supplies the selected tab/frame silhouette; its backplate remains behind pictures, with an optional contour above. Every row and frame can schedule a batched remeasure during interrupted changes. Compact flow retains its real gap as two separate shapes. Without clipping or observer support, the unenhanced presentation remains.

Missing or failed images retire the enhancement and expose every canonical account rather than retaining an empty frame. Mount returns teardown, restoring attributes and releasing listeners, observers and pending work.

Collection directories use `partials/collection-directory.html`: native listing entries become folder links inside the same `macros/decks.html` carousel used by testimonials. The directory retains native pagination above and below the deck. World templates delegate to this one partial; they do not define a second grid or card controller. `fixtures/reading.py --collection-scale-check` checks native nine-entry pages and exact continuation order.

`styles/_folder-card.scss` owns the folder arrangement. Shared `layout.folder` tokens set its aspect, tab, notch and opening; the existing spring supplies its motion. `scripts/folder-card.js` measures one decorative mask per card and clamps the opening to leave its complete text readable. Real titles, descriptions, destination links and focus remain outside that mask. Native artwork renditions follow the existing root colour preference. No artwork means the world's material is used, not an invented image. Without script, every complete link reads in sequence; print removes decoration. No separate SVG mask assets or workspace-selected shape resources are needed.

Collection and journey detail pages keep a centered return trail above their title and distinct introductory description, followed by prose, then the shared folder deck. The footer's Services destination does not select an additional commercial closing. Children retain the engine’s supplied order, including authored documentation groups; journey steps retain a semantic ordered list in their declared reading order. Both use the same controls and complete folder-card anatomy. The workspace supplies each deck's interface labels through `base:collection-*` chrome regions; the Base does not invent publication-specific copy.

An empty, top-level `container-contents` component places that same deck within a collection or journey's authored account—for example, before its FAQ. Gazette supplies the resolved children, order and documentation groups to the component; authors supply no repeated titles or addresses. Without a slot, the frame keeps its default closing deck. With one, both HTML and Markdown place the contents there once. Empty containers leave no empty deck, and unavailable journey destinations remain unlinked.

## Attributed accounts and destination decks

`quote-deck` accepts optional `autoplay` and `wheel` booleans, both defaulting to true. The composing workspace supplies `base:testimonials-title`, `base:testimonials-previous` and `base:testimonials-next` through chrome regions. The title supplies both the visible heading and the accessible section name; missing directional labels leave the complete quotations static. Content supplies only the individual accounts.

Its heading precedes a graded fan; direction controls, the unique-account counter and direct choices follow it in the shared control strip. Nested `quote-item` accounts require `attribution`, may supply `detail`, and retain their complete body, emphasis and source links. Cards grow for long copy; handhelds use a readable focused card with neighbouring cues. Utility specimens use the wider component field while introductory prose keeps its reading measure.

Horizontal dragging continuously changes position, descent, tilt, scale and opacity; release uses the supplied threshold and supports several steps. Loop copies are decorative and inert; the focused account is always its original node. Cancellation, resize and preference changes restore the settled selection. Autoplay applies only above three entries and pauses for reader interaction, hidden/offscreen content, print and reduced motion. Wheel selection is enabled only when requested and its timing token is valid. One account needs no controls.

No-script, disposal and print expose every canonical account once; reduced motion selects immediately without fan travel. Folder decks begin as a native horizontal row with the same card widths, so enhancement does not collapse a tall list. Every complete link remains reachable by touch, scrolling and keyboard; print keeps the ordinary sequential layout. Only authorised testimony belongs in public Content. The reading fixture uses explicitly labelled fictional specimens to verify the capability.

The same `macros/decks.html` scaffold and `quote-deck.js` controller serve native destination cards. Template-owned decks mount through the required Base shell; they do not duplicate the controller or invent authored island metadata. Collection pages present their authored framing first, then each supplied direct child once. Authored documentation groups retain their outline order; Base never substitutes its own sort.

These cards carry their native title, description and destination without testimonial, byline or date semantics. `data-deck-label` supplies each direct-choice name. The reusable macro accepts an independent accessible region name and optional visible title; zero or one entries remain static. Whole-card links keep ordinary activation; only a completed horizontal drag suppresses the following pointer click. Active-choice scrolling stays within the deck’s own control strip.

## Related destinations and enquiries

`directory-context` carries an optional meaningful introduction or availability qualification. A catalogue does not repeat its navigation label as a body H1 or hide that heading for assistive technology. The shared `product-listing.html` omits the generated title group; native page title, description and JSON-LD remain intact. Empty heading-only contexts are removed from Content. `destination-set` groups authored `destination` accounts and their real links; the flexible layout fills the field for one, two or three peers without requiring an item count.

Product catalogues place a related `destination-set` between their main catalogue and FAQ. Each owner authors the relevant questions and resolved ecosystem links in Content; the same destination and action components render them in every world. The template invents neither related claims nor site-specific cards. An omitted declaration is a content-composition gap, not a separate card recipe.

Each `catalogue-entry` starts with one linked heading. Gazette uses that heading and its resolved destination to describe the entry in the catalogue's ordered `ItemList`. Supporting links stay in the card's copy.

The destination recipe owns the shared contour, inset and bottom-aligned action. Its Base template selects `card-surface`, the same optical material used by the Search form and related-reading cards. Worlds bind the bed, fill or stationary filter through `--card-surface-bed`, `--card-surface-fill` and `--card-surface-filter`. Moving and painted card surfaces use the same fill without live backdrop filtering. Contrast and transparency preferences fall back to the opaque bed.

`inquiry-section` pairs an existing FAQ with an onward destination deck using the same two-to-three column split as the ambient opening. It stacks at the same narrow-screen transition.

`card-deck` supplies an authored heading and semantic `deck-card` articles to the existing deck macro/controller. Its explicit container field keeps neighbours inside the owning column, centres the selected destination and its heading, opens a short set at its middle destination, and retains finite endpoints. These cards use the shared destination-preview measure rather than filling their column. Their natural content heights align to one lower edge, and a stable lower allowance protects tilted corners without adding the full-field showcase's symmetric clearance. The compact control gap is independent of a neighbouring card's copy length.

The moving stage shares the depth carousel's horizontal edge fade, excluding headings, controls, singletons, print and forced colours. A singleton stays bounded without controls; no-script and print keep every destination readable. Content supplies questions, copy and native links; the components infer none.

## Relationship directory

The optional graph view separates nested groups, collection members, ordered reading sequences and outgoing related reading. Other routed pages remain discoverable without being labelled disconnected. Destinations come from resolved routes; foreign references show their supplied native title and resolved public address without borrowing their bodies. The complete directory label set comes from chrome; a partial set retains the flat-list fallback. Generated graph pages consume the engine's existing publication metadata. Graph and Markdown alternates remain optional engine outputs; article tools do not promote them into visible reading actions.

[Back to Base](../README.md).
