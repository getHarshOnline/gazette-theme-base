# Page families and modes

Gazette hands Base the page’s route, structure, family and compiled body. Base chooses the shared anatomy and a page mode for the reader’s dominant task; a world gives that anatomy its character.

## Ten page modes

A mode names what most readers came to do. It sets density and tools, not the world's identity. A page can contain a region serving another task, but one task remains dominant. A film is a region within a mode; it does not become an eleventh mode.

| Mode | Reader's task | What supports it |
| --- | --- | --- |
| Home | Orient and choose where to go | Primary navigation and entry points; a varied, composed arrival |
| Reading | Follow a sustained argument | Quiet prose with section navigation, Notes and tools nearby |
| Documentation | Understand, use or consult a product | Examples, anchors, search and compact navigation appropriate to the question |
| Decision / service | Understand an offer and decide | Scope, limits, comparisons, questions and a real next action |
| Sequence / journey | Follow parts in order | The part list, current position and continuation |
| Paper | Read and cite a formal document | Number, version, abstract, references and citation when supplied |
| Product | Understand what a thing does and its availability | Explanation, media, specifications, status and available actions |
| Narrative | Follow a story | Pacing, chapters and continuation |
| Index | Scan and choose among objects | Grouping, filters, sort choices, counts and readable entries |
| Utility | Complete a small task | The controls and information that task needs |

Product help uses the publication's ordinary article, collection or journey composition. Its category and navigation do not create a separate visual family. Repository developer documentation uses its separately selected platform; its audience and outline remain distinct.

## Defaults and scoped exceptions

[The page-mode macro](../templates/macros/page_mode.html) is the single default implementation. The root route wins first; then collection and journey structure; then the page family. Explicit compositions override the frame's `page_mode` block.

| Default | `data-page-mode` | Source |
| --- | --- | --- |
| Home | `home` | Route `/` |
| Index | `index` | Structure `collection`, or family `index` |
| Sequence / journey | `sequence` | Structure `journey`; the shared About composition also selects it explicitly |
| Reading | `reading` | Family `article`, or the existing older `documentation` family |
| Product | `product` | Family `project`; the product composition also selects it explicitly |
| Utility | `utility` | Other families, including `utility` and `extension` |
| Documentation | `documentation` | Explicit target or world choice, not a documentation-category override |
| Decision / service | `decision` | The shared Services composition or a scoped world choice |
| Paper | `paper` | A scoped world choice |
| Narrative | `narrative` | A scoped world choice |

A family-wide remapping fits only when the affected content shares that task. A project is not automatically an offer or a paper; an article is not automatically a narrative chapter; an About page is not automatically a small Utility task. Record the reason and scope in `WORLD.md`, override the shared block and use `super()` for other cases. If the admitted context cannot select that scope, keep the default and leave the implementation question open. An extension currently takes its default or a world override; it does not choose its own mode.

## Baseline, Peak and the visit in hand

Baseline is the least of the world's expression the page should carry; Peak is the most a region may reach. Record both in the world's brief; its token values carry the actual expression. The current recipes do not enforce those levels automatically. These are design requirements, not runtime proof that the page actually draws them. A page that is too quiet needs a stronger expression of its own important idea within its Peak. Density comes from hierarchy and grouping, not smaller type.

At a desk, a reading page can place tools and orientation beside the argument. In hand, the same body retains every qualification and destination while those tools move into disclosures and the flow. Index cards retain readable titles and selection controls; film and About openings need their own narrow composition, not a cropped desktop account. Product explanations stack each heading with its body; static capabilities retain their separate parallel meaning. Services keep the order of stages as the shared disclosure and any supplied media recompose. Utility tools fit their task at either width. Paper and Narrative exceptions must specify their own arrangement in the world brief; selecting the mode alone does not build it.

A meaningful peak survives dark mode and reduced motion through light, material, scale or composition. Phone layouts retain its meaning in a form that fits the smaller field. Neither responsive placement nor motion may remove a value, qualification or path to the full account.

## One anatomy, many compositions

Keep one macro file per entity and one macro per context: `row`, `inline_ref`, `card`, `citation`, `preview`, `search_result` and `embed`. Add the context to that shared account when the same thing needs another form; do not create another entity or world-specific implementation. This is the rule for new compositions, not a claim that every existing component already exposes all seven macros.

Every form keeps the same identity, values and units, qualifications, source, published status, ownership roles and destination. A compact form can omit a body or secondary detail when it offers a clear route to it. If a value would mislead without its qualification, show both or omit the value and link. Author, publisher, client, rights holder and operator remain distinct roles. A figure offered as evidence keeps its measure, value and unit, population, date and source together; compact citation or disclosure can carry the latter detail without separating a value from what it measures.

Two independent figures keep their relation in words, not a slash that suggests a ratio. A sequence keeps every step and label. The recipe cannot invent a difference, interval or trend unless the source supplies that derivation. Fix a relation once in the shared recipe, then check each form against independently recorded source values. Neither colour nor an animated frame can be the only place a claim appears.

## Location, history and published status

Current selection belongs to the page, read or saved history belongs to the reader, and published status belongs to the content source. Opening a chapter does not change the project's lifecycle. Keep each meaning in its own text and treatment: location can emit, history stays quiet and status is stated. A section marker describes where the reader is, not what they have completed.

## The shared compositions

| Surface | Required composition |
| --- | --- |
| Common frame | Header identity, configured primary destinations and search; breadcrumbs locate the page through resolved ancestry. Footer identity, ownership, legal, contact and discovery destinations form an ending rather than a second primary menu. |
| Article | Left: collection siblings or declared journey, position and local outline. Centre: title and sustained reading. Right: labelled metadata, compact keywords and distinct related reading. End: available reading tools and the configured footer. Workspace-selected invitations add a services closing outside the article when its publisher permits it. Ordered previous/next relations stay on the left corpus member links. Empty regions add no visual scaffolding. |
| Product documentation | The ordinary Article, Index/collection or Journey composition for its native structure. Docs purpose supplies its category label and native grouped corpus view, never a separate reading frame. A configured product entrance keeps its selected composition. |
| Reading apparatus | Numbered footnotes connect a statement to its definition and back to each reference. Authored Notes open as tangents outside the principal flow. Citation tools reference the whole work, with supplied text, formats and resolved downloads. These remain separate functions. |
| Index and collection | Authored premise, meaningful grouping, direct destinations and useful entry context. Native collections open with their title and authored framing, followed by a shared deck of resolved child destinations. Journeys retain their metadata title, description and ordered native steps before authored framing. Their source bodies do not repeat the metadata H1. A redundant visible heading is omitted at its source; hiding it with CSS or inventing a replacement label would keep the duplication. Container authorship remains in metadata without article credits in the entrance. Collection hierarchy, ordered journeys, chronological listings and product comparison retain their different structures; pagination preserves the reader's place. |
| Project or product landing | Problem, approach or capabilities, qualified evidence, current state and available next action, with routes to the actual writing and documentation. Media, specifications, provenance and commerce fields appear only where the subject supplies them. |
| Services and intent | Recognisable need, offer and fit, scope and limits, attributable proof, engagement steps, decision questions and one actual enquiry or booking action. An intent page develops a particular visitor's problem; a testimonial supports a relevant claim. Neither inherits article apparatus by default. |
| Home, About and utility | Home establishes the encounter and choices; About develops the person or practice; legal and utility pages complete their own task. Home and About compose their own sections without article outlines, reading rails or article metadata. |

Notebook, API-reference and discussion surfaces require their own supported data and configuration; a link or decorative placeholder does not establish that capability. Across viewport sizes, colour modes, reduced motion and no script, retain orientation and usable reading paths. Print keeps the argument and its references. Verification must exercise footnote returns, Notes open/close and focus restoration, both navigation groups, search, continuation and available tools; source presence alone does not establish a finished reader journey.

## About

`about-opening` groups an introduction with an optional authored heading. Semantic children select the shared composition: an `about-copy` statement together with `about-context` explanation forms a paired field, preserving source order in hand. An authored H1 supplies the title; otherwise the shared title group displays the page's title and description. `about-section` pairs its heading with one complete `about-copy` body, or pairs explicit `about-copy` and `about-context` children. `about-history` retains source order. `about-choices` lays out the actual children as peers, including a pair when exactly two choices are present. The authored `span = "full"` distinction retains a meaningful centre or extension; it is not project containment, sequence or evidence. Content supplies the semantic children rather than field/pair/trio layout switches; `styles/_about.scss` owns the geometry through the explicit semantic anatomy.

Each choice keeps its heading, premise and any authored `primary-action` together. The shared `optical-unit` recipe uses the world's captured material, palette and geometry roles; narrative prose remains on its reading ground. `about-context` spans a group without becoming another card. `about-conclusion` centres a common conclusion across its group; explicit `about-copy` and `about-context` children instead retain the paired statement/explanation relation. Shared responsive rules retain complete units rather than squeezing controls. Colour preference, unavailable backdrop filtering, reduced transparency, stronger contrast and print retain complete content. Worlds provide type, palette and actual action expression and capture their optical roles.

The number and kind of sections remain authored. A biography is not an offer trio, a research centre is not one of several equal experiments, and a dormant history acquires no purchase action. The page selectors retain each world's fonts and mode while these shared components own layout.

## Comparisons and decisions

`view-set` groups a bounded comparison under an authored `label`. Its nested `view` components use a shared `group`, their own `label` and exactly one `selected = true`. Give each set a unique group on the page. Native radios select complete content without script or motion; choices stay above the content at every width, and printing includes every view. Use ordinary sections when the reader needs all accounts in continuous flow. Worlds may compose the panels but keep this selection behaviour. The author supplies the meaning and must not imply an operating interface when presenting an illustration.

`work-proposal` keeps fixed eligible choices, a supplied comparison and the independent decision in one ordered composition. Content supplies `choices_label`, `choices` (`name` and `remit`), `decision_label` and `decision`; its body may contain a native `view-set`. Eligible choices span one row on a wide field and paired label/remit rows in hand. The comparison and decision share its full-width edge. Explanatory labels use the reading role; no recommendation performs an assignment or changes the eligible set. Worlds inherit this anatomy and bind their own material.

## Projects and products

`project-overview` composes the existing `page-opening` with an optional `project-summary`, `project-links` and `project-media`. A summary carries a deliberate premise, never a paragraph extracted by position. Without media the account keeps its natural reading measure. With media, the complete account precedes it in source order and stacks before it on narrow screens.

The product overview's `project-links` component reads native `component.context.host.project_resources` and the configured labels. Its actions appear in order: Docs, Learn, GitHub, Mentions and Available through. Each uses the shared control and the destination supplied by Gazette. Docs, Learn, GitHub and Available through appear only when their destinations exist; Mentions retains its configured unavailable state. No destination is selected by default.

The same ordered markup uses two equal columns when its available container is narrower than two minimum layout tracks, with an odd final action filling its row, including constrained desktop columns and the hand context. Content supplies the empty semantic component rather than repeating labels, addresses or button anatomy per landing. Legacy authored groups remain readable when no native resources are selected.

`project-media` accepts an authored `label` and optional `placeholder = true`. A reserved slot names the missing asset plainly; its body supplies the visible caption. Actual media without the placeholder flag uses normal rendered body content and native image alternatives. A qualification is not hidden in an image alternative. Printing omits reserved slots and retains their captions.

An optional `src` selects the native video player and requires `poster`, `transcript` and `transcript_label`. Optional `captions` requires `caption_language`; the track uses WebVTT. The composing publication supplies resolved root-relative or HTTPS destinations. Playback starts only on user action, and the caption and transcript remain visible without JavaScript. Transport of the media bytes does not establish decoding or caption-timing conformance.

`project-walkthrough` groups an optional authored introduction with the existing walkthrough figure. Its introduction and caption share the media’s center line and existing readable measure; an absent introduction adds no empty block. Direct `project-explanation` headings and introductions share the section’s centre line and a readable measure. Introductory paragraphs centre on wider screens and return to start alignment in hand; nested features and process steps keep their own layout.

`project-state` balances an authored status heading with its body. Worlds retain material through their existing status alias; the component does not turn a lifecycle into an interactive signal.

`project-explanation` owns the common account heading, introduction and supporting sections on product and research landings. Its reading roles, heading hierarchy, section spacing and responsive flow come from Base, with the world's existing type and material tokens. It has no presentation arguments. Worlds do not recreate it under domain-specific wrapper names.

Choose its children by meaning, rather than site identity or visual novelty:

- Independent capabilities use `feature-set` / `feature`; they introduce neither sequence nor motion.
- Ordered work, transformations or dependencies use `process-path` / `process-step`; motion may reveal that supplied order, while reduced motion and the native artifact keep every stage.
- A specialised comparison or illustration may explain its actual relationship inside the same account. It does not supply a competing heading, spacing or typography recipe.

Product and service accounts use the same ordered-process disclosure described below. Independent capabilities keep their static parallel arrangement; a product need not contain both. The enclosing explanation owns the heading and introduction, outside the ordered list.

`feature-set` groups complementary `feature` explanations under an authored heading and optional introduction. Both use ordinary Markdown headings and bodies, with no arguments. Features share responsive tracks and stack in hand; introductory prose and lists span the group while keeping their reading measure. Each feature retains its authored heading level, display voice and complete reading body. These are capabilities, not alternative choices or navigation cards; any links remain supplied by the author. No controls, numbering, icons or motion are generated. Print retains every explanation in source order. The populated product fixture verifies native heading levels, introductory lists, emphasis, code, multiple paragraphs and a resolved link.

`faq` holds an authored heading and `faq-item` children. Each item supplies a `question` argument and one Markdown answer body. Native details/summary owns keyboard and no-script operation. FAQPage, Question and Answer microdata describe those actual visible answers, without a second hand-maintained schema body. Essential claims and qualifications stay in the continuous account. Progressive intrinsic-size disclosure motion respects the shared reduced preference; printing reveals every answer. This semantic markup promises no external search presentation.

## Fit, terms and independently owned accounts

Services keep their supplied fit, scope and engagement terms in the continuous account or authored questions; the template invents none. `service-fit` can place a heading beside `work-copy` groups with roles `terms` and `conditions`. The terms precede their conditions on narrow screens. `work-copy` also accepts `introduction` and `instruction`, or no role, and uses the shared prose flow within each group.

`work-relation` compares two independently owned positions against one reference. Supply `source_label`, `source_detail` and exactly two `positions`, each with `owner`, `position` and `detail`. The source remains an aside, each owner stays with its position and explanation, and narrow layouts retain both complete accounts. A following `work-copy` of role `conditions` qualifies the whole comparison. The comparison can sit within `view-set`; it does not imply an operating product interface or an ordered workflow.

`work-connections` groups `work-connection` children: one `origin` and a `references` group containing individual `reference` children. Markdown headings, explanations and links preserve an item's origin and referring contexts without treating a reference as containment, control or a transfer of ownership. `work-proof` accepts ordered `records`, each with `record` and `detail`, for a source-qualified account. The author must distinguish an illustrative record from an observation; the component adds no evidence or status of its own. Both forms remain complete without scripts and in print.

These components belong to Base. A world may supply their material through its existing tokens and optical surface, while Base owns their anatomy, spacing and narrow arrangement. Ordinary openings, explanatory sections, current state and ordered stages use `page-opening`, `project-explanation`, `project-state` and `process-step` directly.

## Ordered work

`process-path` holds an authored label and an ordered list of `process-step` accounts. Without enhancement, every heading, body, figure and link remains readable. With enhancement, each step that has a body becomes a button and labelled disclosure panel; one starts open. Up and Down move between heading buttons, Home and End reach the first and last, and ordinary activation opens the chosen step. Hash entry opens the step containing its target. Selection illustrates the account; it never asserts work completion, availability or an obligatory purchase sequence.

The optional `collapsible` argument allows the current step to close, leaving none selected; it defaults to false. Optional `autoplay` also defaults to false and needs both `pause` and `resume` labels, more than one stage and a valid timing token. Playback pauses for pointer or focus within the account, offscreen or hidden content, page departure, print and reduced motion. Reduced motion retains the usable disclosure with immediate changes. Disposal restores the original headings and complete bodies.

Only an authored image or video figure receives a side frame. At wide container sizes, that frame follows the selected step; at narrow sizes and in print, each original figure returns to its own body. A step without media invents no illustration or placeholder. Resize and font loading remeasure the layout. Print exposes every account in source order.

`process-section` places the steps beside a `process-introduction`, with `steps = "start"` by default or `"end"` for the opposite wide arrangement. A supplied walkthrough spans the pair. In hand, the walkthrough comes first when present, then the introduction and steps. The shared styles keep a paired invitation together while the adjacent disclosure changes height. The world supplies type and material without another process controller.

## Authored page templates

The shared `product-listing.html`, `product.html` and `services.html` layouts extend the Base frame. Each implemented world exposes these same three names and contributes its own font head and existing material/type rules. The single `partials/publication-body.html` assembly emits the compiled body once. Family layouts select its semantic account class through `publication_body`; worlds inherit that block instead of copying or replacing authored children.

| Template | Content account | Shared presentation |
| --- | --- | --- |
| `product-listing.html` | Directory context, actual selection, meaningful related destinations and supplied questions | Index mode, metadata identity without a redundant title, full-width selection and native question/answer flow |
| `product.html` | Overview, optional supplied actions/media, meaningful demonstration, current state, reading destinations and supplied questions | Product mode, optional paired overview, balanced status and full-width answers |
| `services.html` | Recognisable problem and distinct milestones, actual engagement stages, supplied fit/enquiry questions and one closing action | Decision mode, shared milestone/process anatomy and centred final invitation |

These layouts present authored landing accounts; generated article lists and collections keep their own compositions. The same authored questions supply both visible FAQ answers and their schema. A template creates no question, media, repository link, availability claim, service offer or missing optional section.

The composing workspace selects a Content node and its canonical world selector. A services selector's existence is a reusable presentation capability, not an offer by every publication; service availability remains with the owning Content and workspace composition. Themes never branch on a publication identity to grant it. Legacy research/project-directory names inherit the canonical selectors. An article guide retains its reading ancestry and opt-in outline, rather than becoming a product landing merely because its subject is a project.

## Services closings

`base:services` identifies the native destination used by the shared invitation macro. Chrome supplies its heading and action label. The footer destination alone never selects a prominent closing. The workspace selects articles and exact pages independently of their templates. Base places the selected invitation once after the complete content, outside article navigation and metadata; Home receives none automatically. The destination page keeps its own enquiry actions. Missing destination or copy never creates an action.

The shared enquiry controller matches that resolved Services destination, including its footer link. It carries the source site's public page and action into the link without storage or a network request. On Services, only the authored primary email actions receive readable source context; existing recipients, subjects and message text stay intact. A missing subject uses supplied copy. The source fields are editable link context, not proof of who sent an enquiry. Without scripts, the original links still work. Consented analytics observes the action separately and receives none of the email text.

The shared closing uses the same once-only `focus-reveal` heading treatment as authored Services invitations. Its template marker is mounted by the required Base shell through the same focus lifecycle, so About, directory, product and reading closings need no per-page island or resource registration. Complete heading text and the ordinary primary action remain usable before script and in reduced motion; the action keeps the shared control state and each world’s colors.

Within the shared Services context, `focus-reveal` centres its heading and supplied action without a Content layout argument. Its once/manual/automatic behaviour and source copy remain unchanged; deliberate contact actions remain authored.

[Back to Base](../README.md).
