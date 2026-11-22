# Review grouped recipe translations in the Admin (22/11/2026)

## User problem

The first 85 recipes contain 1666 visible text fields in the exported CSV.
The former one-field selector would make approval impractical, especially
for ingredients, units, multi-step preparation and recipe notes.

## Safe, native workflow

1. Export, externally review, and import the PT/EN CSV using the
   existing Admin translation import flow. CSV import creates **pending**
   proposals only, in groups of 100.
2. Open **Traducoes > Receitas > Rever e aprovar em lote**.
3. Recipes are grouped by original recipe name. Within each group,
   every pending visible field has a precise label and its PT/EN pair.
4. Search by recipe name, field label, original or translation.
   **Selecionar 100** cumulatively selects only visible unselected rows.
   **Selecionar textos visiveis** selects the visible text of one recipe.
   Individual checkboxes and selecting all remain available.
5. Only after ticking the explicit reviewer acknowledgement is the
   approval button enabled. Changing selection clears acknowledgement.
6. The browser sends only `entity_kind=recipe`, original field path,
   entity ID, source hash and candidate hash. The server retrieves the
   original again and validates that the approved candidate is still
   pending and unchanged.

## Backend invariants

- Only published recipes and actual visible fields from
  `app_translation_sources_v2.fields_for` are accepted.
- No arbitrary paths, quantities, recipe source edits or conversions.
  Original recipe JSON, nutritional data and notes are untouched.
- Only administrators with active authenticated session, CSRF/origin
  protection and the already-existing translation feature flag.
- 100 fields maximum per **atomic transaction**; on conflict, the
  entire group rolls back. Previously committed groups remain approved.
- Preview is read-only. Maximum recipe preview: 2500 pending fields
  (the other library limit remains 1200).
- Approved and outdated translations never appear as pending review.
- Food/Dish previews and approval contracts are preserved.
- No access from player or chef endpoints, and no automatic release
  of English translations in either app.

## QA

WSGI fixtures: published recipe with name, notes, section, ingredient,
unit and steps; complete preview with no writes; confirmed approval
and per-field audit; conflict rollback; rejection of numeric and
unsupported fields; CSRF and non-admin protections.

Playwright mock: desktop/mobile grouping, selection per recipe,
100-at-a-time selection across two mock recipes totalling 205 fields,
search and prevention of unconfirmed approvals.

Next optional refinement: a multi-field translation *editor* can reuse
the same grouping, but this change intentionally modifies **review and
approval only**, not the previously approved individual text editor.
