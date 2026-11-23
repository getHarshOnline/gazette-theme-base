# Settings and control states

Gazette hands Base the configured interface copy and required browser resources. Base owns the reader’s preference controls and the common pointer, keyboard, disabled and reduced-motion behavior.

## Colour and motion

The settings form retains native fieldsets and radios. The shared restore path and Settings are the only writers of the root colour and motion attributes. System follows the device; explicit Light, Dark, Reduced or Full choices take precedence. Worlds supply colour and motion values without introducing another preference store or listener model.

An image with a dark rendition in Content arrives from Gazette as `picture[data-gazette-image-modes]` with one `source[data-gazette-image-mode="dark"]`, so the browser fetches the right rendition before any module runs. The source's starting `media` follows the world's `initial_color_mode` in `presentation.toml`: Base declares `system`, and a world whose stylesheet pins a starting mode declares it beside that rule, as Nocturne does with `dark`. [Image modes](../scripts/image-modes.js) keeps every such source in step with the reader: Dark applies it, Light removes it, System follows the device, no choice restores the emitted `media`, and printing uses the default image. Settings calls it on load and on every colour change, so it works without the media viewer. Physics gives that `picture` `display: contents`; a selector that expects the image as a direct child also matches `:where(picture[data-gazette-image-modes]) > img`, which keeps its specificity unchanged.

The captured token stylesheet binds `--expressive-duration`, `--expressive-easing` and `--expressive-decay` to the current world's ordinary or reduced motion. It also selects the four `--preview-*` motion values and `--deck-body-duration`. Explicit Reduced wins over the system; explicit Full keeps ordinary values even when the system requests reduced motion. Enclave output resolves these roles again against its own world. Base's recipes still determine the static form of an interaction, such as keeping headings sharp, showing all process steps and removing the decorative pointer.

A selected or current control, a focus ring, a target fragment and published status have different meanings. Keyboard focus stays visibly distinct from selection. Reduced motion keeps colour feedback and complete content while removing the relevant travel. Forced-colour and transparency preferences use the shared fallback surface.

## Optional audience analytics

The workspace selects the analytics capability, SDK resource, publisher's measurement ID, privacy destination and control copy. Base then adds equal Allow and Decline choices to Settings. The Google client starts only after explicit consent and working withdrawal controls; without those inputs it stays off. A saved choice belongs to this website, browser and device. Failed preference storage withholds analytics and reports the failure.

After consent, Base submits the current-page event and observes the marked Services links and enquiry email action. Events carry only the supplied public site/content identities and fixed action names. They contain no email address, subject, message, link text or query string. A view requires native visibility tracking, a visible document and at least half the marked link visibly intersecting; browsers without that support omit view events. Clicks do not depend on view tracking.

Decline withdraws consent, stops new submissions and disconnects observers. It neither erases earlier provider data nor deletes cookies. Allow after withdrawal needs a fresh page, offered through Settings. The publisher's notice and provider settings must describe the configured processing before a key is supplied. SDK acceptance is not proof of delivery to Google.

## Primary actions

`primary-action` carries one authored native link in its body. The compiler resolves its fragment, publication or email destination; the component neither guesses the action from its label or URL nor claims an outcome. Worlds map this role consistently across their page families. Ordinary inline links remain ordinary. Scene actions stay inside their existing premise/timing group.

Primary hover uses the world's signal with a contrasting ink pair unless the world supplies its own action pair. A changing pair switches together; constant-ink treatments can retain their existing background transition. Fine-pointer gating, a distinct keyboard focus ring, native press and disabled states remain shared. Reduced motion retains colour feedback without travel.

## Browser values and motion listeners

`scripts/css-time.js` converts computed CSS durations to milliseconds at the browser boundary, accepting both `ms` and `s`. Controllers that work in seconds convert explicitly. `scripts/clamp.js` exports `clamp(value, min = 0, max = 1)`; ambient pointer coordinates explicitly use −1 to 1. The film and field timeline modules retain their existing clamp exports.

`scripts/motion-preference.js` resolves System, Reduced and Full through `motionPreference(document)`. Its `reduced()` reads the current effective preference; `onMotionChange(callback)` subscribes without an initial callback and returns cleanup. The existing `motionReduced` entry remains available. Components still own pointer, focus, visibility, print and disposal conditions. These helpers are included in each browser module's declared inputs; there is no hidden global service.

`scripts/in-view.js` supplies `observeInView(element, callback, options)`, which reports whether a surface intersects the viewport and returns cleanup. It sends no initial state. Each component keeps its capability guard, initial visibility and fallback, as well as the decision to pause, draw or release media. The options preserve the caller’s browser window, observer thresholds and first-entry or any-entry batch interpretation. Cleanup disconnects that surface and ignores a delivery already queued for it.

`scripts/frame-loop.js` supplies `createFrameLoop(draw, options)` for the film, field, portrait and reveal players. `request()` schedules one frame when the player’s eligibility check allows it; `draw(timestamp)` returns `true` while another frame is needed. An already requested frame still reaches the player’s visibility guard so it can reset its clock or surface. `cancel()` stops that run and permits a later restart; `dispose()` ends it. A cancelled delivery cannot disturb a newer run. Players keep their own timing, visibility, preference, print, settling and media-release rules, including loops that stop at rest.

`scripts/canvas-size.js` supplies `canvasSize(width, height, ratio, round)` to convert a CSS-space size into backing pixels. It rounds to the nearest pixel by default; glyph, GPU and video-reveal surfaces retain their upward rounding. Each renderer still chooses its density cap and minimum dimensions, resets its canvas at the same point and restores its own drawing transform. Source-sized masks, glyph grids and the field renderer’s supplied size contract keep their existing calculations.

## Shared style ownership

Shared SCSS follows the part it draws: `_reading.scss` owns the reading composition and tools, `_discovery.scss` lists and related previews, `_search.scss` Search, and `_frame.scss` the frame and invitation. `physics.scss` includes those recipes in cascade order. New shared behavior belongs in its owning partial; world files bind its supported choices.

[Back to Base](../README.md).
