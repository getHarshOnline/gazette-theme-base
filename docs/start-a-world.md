# Start a world

Gazette hands Base an explicitly composed theme package and resolved resources. A world adds its own expression through that dependency; it does not bundle another copy of Base's behavior.

## Begin with the world

Write `WORLD.md` before adding styles: what the world is for, what distinguishes it without an accent colour, its type, material, geometry, figure rhythm, light, crop, depth and motion. Name the accepted reference and the page tasks the world serves. Separate what is drawn from what remains intended. Keep a reason beside a choice that the next repair needs to preserve.

The world owns its display face and expressive values in `design-tokens`. Use that producer's build and capture process for the world and both colour modes; the copies in a theme are build inputs, not another place to edit values. Base's neutral capture is for the Base-alone fixture. It does not supply a new world's identity.

## Inherit the package

Declare `theme:base` as a dependency of the world's package, give the world its own stable package name and template namespace, and have the composing workspace bind the exact sources. Extend Base's namespaced templates. Use the [declared blocks](../AGENTS.md#the-block-contract); the landmarks, skip link and command shell remain outside those blocks.

Keep the shared page, product, directory, service and About compositions. The current world selectors still carry font declarations and purpose-based exceptions where required. A scoped page-mode exception belongs in `WORLD.md`; it does not justify another body parser or page-family layout. Head-only resources belong in `head_extra`.

Use the [shared-part controls](../README.md#shared-parts-and-world-choices). Where a control is marked planned, preserve the accepted existing treatment until the shared implementation is ready. A missing control is a task for Base, not a reason to copy its controller or geometry.

Declare required and optional resources in the manifest. A scene adapter can import Base's film, frame or portrait module and supply source geometry, timing and resources. It must also keep the complete still or storyboard. Do not infer resource locations from a private checkout or publication name.

The current toolchain still needs explicit stylesheet inputs, font declarations and external resource bindings. A new-world skeleton, dependency-based stylesheet imports and direct token-release consumption remain unfinished; this manual does not promise those shortcuts.

## Check the binding

Start with a fictional neutral fixture and the exact Gazette build being reviewed. Run the shared entrypoint from Base:

```sh
python3 fixtures/check.py --gazette /path/to/gazette
```

For a fixture supporting world composition, pass `--theme /path/to/world`. If the world's declared resources come from another source, also pass `--resource-bindings /path/to/bindings.json`. The bindings file is a JSON list:

```json
[
  {
    "root": "/absolute/source/root",
    "entries": { "shared/model.mjs": "model.mjs" }
  }
]
```

Each target must be declared by the world manifest and resolve to a regular file inside its source root. Keep actual instance bindings outside this shared repository. A reading fixture checks the composed reading pages; it does not qualify unused scene modules. When the world declares a Home share-card recipe, the reading fixture enables the recipe's resources and supplies a neutral link-preview image, so the render needs no browser; the card itself is not checked.

Base's fixtures name no world. Keep a world's own expectations in that world's `fixtures/` and run Base's reading fixture from there. Where the world's templates select another footer for a canonical landing, pass `--footer-treatment PATTERN=TREATMENT` (`product`, `product-listing` or `services`; `quiet` or `colophon`). Where the world adds its own pages, run the reading fixture with `--keep`, add the pages to the retained `content/` directory, render its `workspace.toml` again and check the result. Remove the retained directory afterwards.

`fixtures/documentation.py` checks grouped and nested guides, an Article-family documentation child, a standalone guide without an outline, and the boundaries with ordinary articles, Home and a selected product entrance. It needs a Gazette build supporting authored collection navigation. Use `--preview-port PORT --keep` to retain locally addressed output for browser inspection. The fixture does not start a listener or establish reading quality by itself.

Open the page and exercise the affected widths, modes, controls and preferences. Inspect the motion as well as the still; a copied stylesheet or passing source check cannot establish the accepted transition. Check every affected world when changing a shared recipe. A browser capture, a device test, a source fixture and a publication approval establish different things; state which one was obtained.

[Back to Base](../README.md).
