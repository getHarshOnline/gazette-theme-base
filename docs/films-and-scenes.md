# Films and scenes

Gazette hands Base resolved media resources and authored scene content. Base supplies playback, decoding, input and lifecycle behavior around a complete still or storyboard; the world supplies the composition.

## Complete content before motion

Scenes keep their headings, qualifications, stills and destinations usable without JavaScript, after failure, under reduced motion and in print. The world supplies source geometry and timing; Base does not infer a subject silhouette or run an unrelated caption clock: picture-dependent copy follows the displayed frame, so there is no second caption timer to drift from the picture. Reduced motion keeps a composed still with the same meaning, not an arbitrary paused frame.

## Frame delivery

`module:frames` exports `createFrameSource`; it is not a global resource requirement. A world imports it through an explicit resource alias and supplies workspace-selected frame URLs, dimensions, a decoded-pixel byte budget, a concurrency limit and `onFrame`/`onError` callbacks. The source starts inactive. `setFrame(index)` selects a moment; `setActive(boolean)` suspends or resumes delivery; `dispose()` releases its work. The caller uses the base's resolved motion preference and its own visibility, keeping the authored still, text and destinations usable.

`onFrame({bitmap, index, src})` lends the bitmap only for that synchronous callback: draw or upload it before returning, without retaining or closing it. Default `mode: "exact"` cancels superseded requests and never delivers them, so a stale or cancelled decode cannot replace a newer requested picture.

For continuous input, `mode: "coalesced"` finishes and shows one in-flight frame, then requests the newest selection. This keeps continuous input from starving acquisition, since repeated cancellation would otherwise never let a decode finish, at the cost of temporary visual lag. It limits acquisition to one pending frame even when the concurrency ceiling is larger; the final selection is still delivered exactly. A stalled decoder delays later selections until it settles or the source is suspended.

Cached frames are evicted within the declared RGBA pixel budget; pending decodes retain their reservations until they settle, even after cancellation. Browser, encoded-file and GPU overhead are outside that budget.

A failed frame reports its identity once; another selection or suspend/resume permits retry. The utility supplies no scroll timeline, crop, transition, preference writer or animation loop.

Run `node --test fixtures/frames.test.mjs` for asynchronous resource checks and `python3 -B fixtures/frames.py --gazette /path/to/gazette` for native delivery. The latter builds and removes a temporary neutral specimen; `--keep` retains it for browser inspection. These checks do not establish browser decoding, motion quality or a finished cinematic sequence.

## Character sequences

`module:portrait-frames` exports `mountPortrait(wrapper, model)`. A world supplies a `.portrait-stage` containing a complete static image, with cover/centre-bottom framing shared by the canvas. The model supplies frame URLs, dimensions, resting ranges, crossing thresholds, film cadence and cache capacity. Pointer input is optional; reduced motion, coarse pointers, printing, suspension and failure keep the still. The controller visits transition frames in order, settles without an autonomous loop and preserves pose during resize. Geometry must retain the figure in the world's static field. `fixtures/portrait-frames.test.mjs` covers the controller; decoder lifetime and memory tests remain in `fixtures/frames.test.mjs`. These checks do not establish rendered fit or cold-cache cadence.

The neutral `fixtures/portrait.py` integration fixture renders the selected world and its actual adapter through Gazette, verifies native component children and media delivery, and exercises the compiled adapter with the engine’s `{element}` mount argument. Run it with `--gazette`, `--theme` and, when needed, `--resource-bindings` as described in [Start a world](start-a-world.md#check-the-binding). It does not test browser layout or motion.

`module:continuous-portrait` exports `mountContinuousPortrait(wrapper, model, resources = [])`. The world supplies the semantic `[data-portrait-scene]`, `.portrait-stage` and `.encounter-copy`; the composing owner supplies source frames, measured pose landmarks, crop geometry and optional registered reveal assets. The optional native page-resource list maps each declared `rendition_of` URL to its compiled `url`, keeping source-model references independent of local and public serving addresses. Physics and material values come from tokens.

Registered X/Y gaze samples a shared mesh before blending source pixels, avoiding doubled contours. The GPU renderer projects fine, changing glyphs through a cached atlas, with the registered CPU sampler as a capability fallback. One scene-space ripple mask reveals the aligned character and world beneath the portrait.

A bounded queue deduplicates asset fetch/decode after the resting image has decoded. Registered reveal art waits until pointer attention enters the scene and the portrait queue finishes; until then the complete portrait remains visible. Hidden, offscreen, reduced-motion and print states release source textures/bitmaps and retain the still. Disposal also releases GPU resources.

Handheld placement reserves actual copy height before the portrait. The portrait fixtures cover registration, lifecycle, decoding and glyph phases; inspect the rendered fit and motion separately and record which world, device and states were checked.

## Authored sequences

`module:sequence` exports `createSequence` for ordinary scroll, fragment navigation, focus and motion-preference changes. A world supplies its wrapper, source-ordered sections, rest positions, hold intervals, scroll distance and drawing/sizing callbacks. Call `ready()` after the renderer is available, `schedule()` when a resource changes, and `unavailable()` on rendering failure. The utility returns to the corresponding static section when motion is disabled or drawing fails; the world remains responsible for complete stills, composition and meaningful action. Responsive layout changes preserve an occupied reading hold without snapping ongoing travel. A fresh page reconciles its scene fragment after native scroll restoration; a restored bfcache page keeps its browser position.

Printing suspends enhancement and restores the screen position afterwards, including cancellation. The shared print anatomy uses `sequence-document` on the fallback root and its `__beat`, `__copy` and `__still` classes within it. Every beat prints in source order with its first, complete still; alternative phone stills and the canvas remain hidden. This CSS also works without script. The token build supplies each world's light print roles independently of saved screen preferences.

An optional `activity(boolean)` callback follows motion preference and viewport/document visibility, including before readiness; call `schedule()` once to begin acquisition. A drawing callback may return `false` while its matching view is unavailable, withholding the reading hold until a later `schedule()`. Other drawing callbacks keep their existing behavior.

Run `node --test fixtures/sequence.test.mjs` for preference, failure and print recovery regressions.

## Cinematic films

`module:cinematic-film` exports `mountCinematicFilm({element, film})` for a complete native storyboard, with `.cinematic-story`, anchored `.cinematic-beat` groups, durable stills and separate title, combined premise/action and optional card regions. Native headings retain their identity. The composing owner supplies both complete frame sequences, measured edit, visibility windows, reading rests, cadence and decoded-byte bound. Base follows the monotone edit, blends neighbouring frames and restores fragment, focus and print positions. Native heading fragment targets retain temporary focusability until blur, then regain their authored attribute; that navigation focus does not pin an old scene. Static headings reserve measured masthead clearance. Reduced motion, missing decoding or content that cannot fit a viewport retain the full static account.

Resizing preserves the position of the pinned scene being read after surrounding scenes have settled into their new geometry. Other scenes do not move the reader. New input, navigation, reduced motion, print or leaving the page cancels a queued return.

Ordinary pointer/touch scene actions traverse the edit using the captured film navigation duration and sampled easing. Their native fragment commits immediately; destination focus waits for arrival and yields to newer input or focus. A later action retargets from the current pose. Keyboard/assistive activation, fragment recovery and reduced flow arrive immediately.

Native history owns hashless scroll restoration. On an actual traversal, the existing reconciliation brings the visual edit to that observed position after restoration; new input or control focus supersedes a queued visual reconciliation. The film writes no custom history pose and changes no global scroll-restoration setting.

Each `.cinematic-still` accepts one image paragraph, or two ordered image paragraphs for landscape and portrait cuts. Shared CSS selects the portrait cut on portrait screens, including without script; print uses the landscape cut. A single image remains valid in every orientation. The controller exposes `data-film-position` so world headers can protect navigation as the pinned stage yields to the next surface, without changing navigation or film timing. Its geometry states and fallback lifecycle are covered by [the film timeline geometry and restoration tests](../fixtures/film-timeline.test.mjs).

Optional transparent frame sequences set `film.transparent` and clear the drawing surface before each frame, including reverse travel; opaque consumers retain their existing blending. Prepared alpha sequences own their artwork's emergence, so the controller does not infer silhouettes or add another mask.

Each film reads its landscape and portrait addresses from the `data-cinematic-frames` JSON blocks. Carrier and Nocturne project them from their existing authored frame lists. The storyboard stills, captions, headings and destinations remain in the reading view. The player also accepts the earlier hidden frame lists for existing themes.

Optional `film.prepare: true` reserves the full stage before decoding and prepares only a bounded frame window within the shared viewport margin. It does not seek the first beat on entry or animate offscreen. A failed decode, insufficient copy space, reduction or print restores the complete native storyboard; other consumers keep decode-first layout.

An optional intro uses shared motion tokens to establish a small initial edit floor. `film.choreography` supplies normalized progress ranges for veil, title release, cue, caption settlement, ghost, seal, late letters and premise. Base applies these paint-only states within the same lifecycle. Complete native headings and still alternatives remain available; focus makes a pending caption readable, and reduced motion restores complete copy.

An owner may supply `film.scrollDistance` with positive landscape and portrait distances instead of a viewport multiplier. Optional `film.approach` maps a supplied fraction of the viewport before pinning through that same clock; fragment arrival and resize use its inverse.

With an authored `film.departureAt` progress, action and reading reach that frame at unpin; only the departure continues through the measured trailing box until it leaves view. The native following section keeps its own document box; presentation must not overlap it with negative spacing. During that departure, the playhead and copy follow native scroll immediately. A frame from another phase is withheld until a current frame decodes; reversing into the pinned scene keeps this guard until its matching pose returns. Pinned playback otherwise retains its normal smoothing.

Optional `film.layout: 'flow'` maps an illustration's natural viewport crossing without adding pinned distance. `film.nativeFrame` measures the native still's box, while `film.fit: 'contain'` preserves its full payload. These geometry options share the existing bounded decoding, failure, focus and preference lifecycle.

The frame window warms the selected destination and adjacent frames during scroll and navigation, cancelling obsolete requests. During an automatic opening, one request at a time can finish as the playhead advances. The player can paint that frame on the way to the latest position. Both paths share the same decoded-byte limit.

The same module exports `mountScrollPassage(root, {reveal, window})` for reversible native text passages. `window` contains four ordered normalized positions: entrance start/end and exit start/end, measured over the element's full viewport crossing. Only opacity and token-based defocus change; text keeps its native layout and reading order. Focus restores complete copy. Reduction, print, suspension and disposal restore the authored presentation. Image depth and reveal belong to the supplied film, so passages do not add a second image mask or particle loop.

`module:film-surface` optionally adds scene-local optical grain and a fine-pointer ornament. It retains the native pointer and suspends inactive work. The world supplies a decorative `.cinematic-grain` node; the texture stays still without script and under reduced motion. Consumers select `stylesheet:cinematic-film` and `image:film-grain`. The page template resolves the image URL from `presentation.theme_resources`; its adapter places the decorative image into the grain node. The source filter repeats at its original tile size. No-script storyboards omit this optional texture; reduced-motion enhanced views retain it without animation.

Run `node --test fixtures/film-timeline.test.mjs fixtures/film-surface.test.mjs fixtures/scroll-passage.test.mjs` for the controller, geometry-guard and lifecycle checks. These do not establish browser composition, animation quality or a finished publication.

## Ambient video and opening

`module:ambient-video` exports `mountAmbientVideo({element, source, poster, toggle})` for a muted looping retained clip, independent of scroll. `source` is an already-resolved native anchor or URL; `poster` is the durable fallback image. An optional supplied toggle contains `[data-ambient-pause]` and `[data-ambient-play]` labels. The controller never invents copy. It defers media acquisition until visible with motion allowed, pauses hidden/offscreen playback, preserves explicit reader pause, releases media for reduced motion/print/page exit, and restores the poster on failure.

The world displays `.ambient-video` only while its wrapper's `data-ambient-ready` is `true`; `data-ambient-state` is `still`, `playing`, `paused` or `error`. `data-ambient-visible` reports wrapper intersection independently of motion preference. `data-ambient-position` reports `before`, `entering`, `within`, `leaving` or `after` from viewport geometry, including reduced motion. Worlds can protect navigation as a scene leaves; this geometry does not control playback.

The returned disposer releases media/listeners and restores original attributes. Transport and codec support remain native engine/browser responsibilities. Run `node --test fixtures/ambient-video.test.mjs` for lifecycle coverage, separately from live playback.

The same module exports `mountAmbientSurface({element, enhance})` for a native surface with an optional interactive treatment. It uses the same visibility, motion, page/print and teardown lifecycle without creating or acquiring foreground media. Its `ready` state allows the treatment to run independently of video playback; reduced motion leaves the native surface and copy intact.

`ambient-hero` composes a full-width opening from `ambient-source` (a resolved media anchor), `ambient-still` (a durable image) and `ambient-content` (authored introduction and existing destination components). Its thin adapter calls the same ambient-video controller; it does not add another playback lifecycle. The composing workspace supplies `base:ambient-pause` and `base:ambient-play` labels and explicitly binds `module:ambient-video`, `module:ambient-hero` and `stylesheet:ambient-hero`. The poster remains available before enhancement, on failure and under reduced motion. At narrower widths the whole media frame precedes the reading content; the native links remain usable without JavaScript. World styles own the material and colour treatment.

`ambient-hero.pose_tracking` optionally replaces the film with five authored front/left/right/up/down poses supplied as resolved links in `ambient-poses`. Content supplies dimensions, the gaze anchor, a feathered optical aperture, pupil centres and two normalized lens-registration landmarks per pose.

A fixed registration plane aligns each source to the front lens centres using translation, rotation and uniform scale before continuous X/Y blending; there are no pointer sectors or local eye warps. The shared portrait GPU renderer preserves source colour with fine stationary coverage dither, including transparent samples, rather than superimposing translucent silhouettes. Its default monochrome glyph path is unchanged.

The front pose supplies the fixed silhouette, lens housings and body; only the two optical interiors blend. Each optical plane also registers its pupil, then translates rigidly to the weighted gaze position before the colour dissolve; source pupils therefore remain coincident throughout diagonal motion. The two aperture passes share one renderer and uploaded textures.

All five sources are decoded and normalized once, then prepared on the GPU before the native still is replaced; the decoder cache is released immediately. Motion uses shared gaze tokens and stops when settled.

Hidden, coarse-pointer, reduced-motion, print, unsupported GPU and failed states retain the native front still. `fixtures/ambient-poses.test.mjs` covers continuous registration, roundness, responsive anchor mapping, lifecycle and resolved-link validation.

`fixtures/ambient-hero.landing.yaml` checks this neutral composition through the engine; its opaque video file tests routing only, not codec playback.

## Focus reveal

`focus-reveal` enhances its first, plain-text heading with a measured corner frame. Its optional `mode` is `auto` (the default), `manual` or `once`. Auto and manual require authored `pause` and `resume` labels before optical defocus is enabled. Once traverses the heading within the shared time budget, then clears immediately to complete sharp text without a control. A heading that cannot fit the budget at the shared travel/dwell cadence remains static. Completion is terminal across re-entry, reflow and preference changes; reduced motion, print and direct heading entry complete a once-only pass.

The body, actions, heading identity and textual whitespace remain native. Automatic words add no tab stops. Manual words follow pointer, touch or keyboard focus, with keyboard focus taking priority over hover and retaining its own visible outline. Pausing, reduced motion and print reveal every word; missing script, tokens or unsupported heading markup leave the original complete.

Offscreen, hidden and dialog-covered sequences suspend their dwell and show complete text. In auto/manual mode, direct entry to the heading or another target inside the group pauses the sequence with the complete invitation visible; Resume remains available. Font loading and resizing remeasure the actual word boxes. Worlds place the authored group and supply type and material without changing these shared timings.

[Back to Base](../README.md).
