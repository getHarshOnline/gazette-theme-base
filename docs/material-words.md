# Material words

Gazette hands Base content and selected presentation resources. The material words describe how the world's token values and styles make those pages look; they do not classify the content or change its ownership.

| Word | Meaning in a world |
| --- | --- |
| Physics | The shared behavior and constraints: navigation, input, focus, layout, timing and accessible fallbacks |
| World | A coherent expression of type, material, geometry, figure rhythm, light, crop, depth and motion |
| Stock | The underlying paper or page surface, whose colour and texture remain visible at rest |
| Sheet | A distinct surface for a figure, card or grouped account; its placement and contrast explain its relationship to the stock |
| Register | A material treatment with a specific character, such as stock, emulsion, anodised metal or phosphor; it is not an arbitrary extra colour band |
| Emulsion | An image-bearing material treatment whose grain, density and response to light belong to the image surface |
| Raster | A repeatable mark or sampling pattern used as part of the material character |
| Registered | Parts aligned to a common measured coordinate system, such as type, image and figure edges; it does not mean a legal registration |
| Plate | A composed figure surface with its own edge, scale and relation to the surrounding field |
| Bleed | A deliberate continuation of image or field across a boundary; the world and the page's task govern where it belongs |
| Figure rhythm | The spacing, scale and caption relationship that make successive figures read as part of one account |
| Reflected light | Light that reveals a material's face or edge without asserting an interactive state |
| Emission | Light carried by a held state, such as selection, current location or an active process; the signal role supplies its colour |
| Accent | A small emphasis or identity role; it is separate from the signal that carries state |
| Halation | Light spreading around an emitter, with strength and extent derived for the active mode |
| Optical surface | A shared translucent surface with a defined bed, fill and filter, plus a solid fallback for contrast and transparency preferences |
| Baseline and Peak | The least expression a page carries and the greatest a region may reach; [page modes](page-families.md#baseline-peak-and-the-visit-in-hand) explain their use |
| Amplitude | A whole number from 0 to 4 for how far a page or region may express its world, read as a ceiling on what the world is permitted to do there; `design-tokens` carries the five levels. `data-amplitude` marks the Peak region, 4 on the ambient opening and 3 on the shared project explanation, and Base does not read it at run time today |
| Composition | How supplied parts are placed and related; it can change across contexts while the facts remain the same |
| Catalogue presentation | The folder-card fan used for project and research directories (`scripts/catalogue.js`), which world briefs call the Arc Carousel; it fans the cards in an arc around the selected one and reads in sequence without script |
| Island | A browser script that enhances one server-rendered component, such as a film, a deck or a folder card, and owns only that component's position and state. The page reads in full without it; `data-island-state` reports `still`, `preparing` or `drawn` on scene wrappers |
| Enclave | A region of one world's page drawn with another world's tokens while the page's physics and colour mode stay its own. `design-tokens` can build the stylesheets and Base has a style reader for `data-world`, but no theme selects an enclave and nothing writes the attribute yet |

A world's `WORLD.md` makes these terms concrete in its own work. Token values and a material name alone do not establish that the intended treatment is drawn; inspect the rendered page.

[Back to Base](../README.md).
