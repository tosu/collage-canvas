# Diagnosis Report (pre-release sweep)

## High-Risk / Must-Fix
- **Duplicate CSS blocks causing conflicts/overrides**: `style.css` contains multiple copies of the same selectors (`.drop-zone`, `.drop-zone.drag-over::after`, `.empty-state`, `.drop-card`, etc.) in several places (e.g., around lines ~470, ~700, ~900). Earlier rules (e.g., hiding drop-zone glow) are likely overridden by later duplicates (e.g., the glow still enabled). Also `.preview-shift` appears in multiple copies with different transition timings (90ms vs previous 150ms). This redundancy makes behavior order-dependent and brittle; consolidate to a single definition per selector and verify final values (especially drop-zone glow, cursor/user-select, preview-shift transition).

## Medium-Risk
- **Possible drop-zone state clash**: We now hide `.drop-zone.drag-over::after` by setting `display: none`, but duplicate rules later in the file reintroduce the glow. Sorting these duplicates will also resolve this conflict.
- **User-select/cursor consistency**: We added `user-select: none` to key preview elements, but duplicated CSS may omit it in later blocks (e.g., `.drop-card`, `.image-item`). After deduplication, ensure the intended `user-select`/`cursor` values persist.

## Observations / Follow-up
- **Native ZIP builder memory**: `createZip` loads each blob fully into memory (`arrayBuffer()`). Large batches could spike memory; acceptable for small sets, but consider streaming in future.
- **Toast scope**: Toast container now styled, but verify no duplicate toast styles exist elsewhere after CSS cleanup.

## Recommendation
- First pass: clean and deduplicate `style.css` (one definition per selector) ensuring final desired values: no drop-zone glow except on `.drop-card`, `preview-shift` 90ms, correct user-select/cursor rules.
- Second pass: quick regression check on empty-state drag/click and preview drag animations after CSS consolidation.***
