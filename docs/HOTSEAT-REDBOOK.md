# Red Book desktop table and solo hot-seat

The player controls 1–3 seats locally. Each seat has exactly one chosen hero and a separate copy of the original 30-card starter matching that hero’s sphere. A shared quest and encounter deck connect the seats; hands, resources, threat, allies, player decks, and discard piles remain independent. Classic solo retains one three-hero starter. Normal games and the Mirkwood Paths campaign support both arrangements.

## Rules and state

The multiplayer framework follows FFG’s [Core Set rulebook](https://www.fantasyflightgames.com/ffg_content/lotr-lcg/LOTR%20Rules.pdf): each player may choose 1–3 heroes, combined willpower opposes staging threat, encounter reveals scale with active players, engagement checks follow player order, and the first-player marker rotates. FFG also discusses controlling multiple decks alone in [A Quest for One](https://www.fantasyflightgames.com/en/ffg_blog/21864/original_content). This implementation deliberately uses one hero per seat, as requested, with no networked opponents or collaborators.

`src/game/table.ts` projects the active seat onto the existing personal state fields. Seat snapshots preserve hand order, resource pools, allies, threat, usage limits, and engagement state. Shared state contains the quest, encounter deck, active location, campaign, and effect queue. `syncSeat` runs at state boundaries; save validation checks each seat, indices, IDs, ownership, and queued player scopes. Classic version-two saves still load without a table; version-one saves retain their existing migration.

Effects and pending choices remember their acting player. The engine temporarily selects that seat while resolving an effect, then returns to the ordered turn. Global effects visit all eligible seats. Card control is distinct from original ownership so transfers and foreign attachments resolve and discard correctly. Sentinel and Ranged eligibility comes from the supported cards’ printed keywords. Each attacking player gets a separate attack opportunity against an eligible enemy.

Campaign chapters preserve seats and their threat penalties. Fallen heroes are replaced in place; surviving heroes retain their positions. The Dol Guldur prisoner remains associated with the original seat and returns there upon rescue. A captured single hero does not prematurely eliminate that seat. See [coverage](COVERAGE.md) for the existing timing simplifications and the limitations of one-hero introductory decks.

## Desktop interface

The new table uses the height of the desktop viewport. Hero banners, compact phase navigation, a pinned hand, an adjacent turn panel, and independent battlefield scrolling keep repeated actions within reach. Cooperative abilities live in the turn panel. The hand identifies its hero; keys 1–3 switch seats, H focuses the hand, N takes the next action, and U undoes. Shortcuts pause inside dialogs and form controls.

Desktop layout checks cover 1280×720, 1440×900, 1920×1080, and 2560×1440. Browser checks also exercise complete round handoffs, save restoration, cooperative defense/attacks, foreign attachments, campaign replacement order, and guarded shortcuts. Engine checks include 144 hot-seat simulations in addition to the existing 300 classic simulations. Controlled campaign checkpoints verify specific transitions; they do not claim natural wins or exhaustive rules compliance. Mobile refinement is deferred.

## Original atlas artwork

`public/art/westmarch-atlas.jpg` was generated with the built-in image-generation tool, then converted to JPEG at quality 87 using macOS `sips`. It is an original fantasy map texture with no labels, copied game map, interface elements, or card text. The existing quest artwork remains in use. No runtime image-generation API or credentials are required.

Prompt:

> Use case: stylized-concept. Asset type: original wide background texture and illustration for a Lord of the Rings inspired card-game table and adventure atlas. Create a beautiful ancient map on warm aged parchment, delicate sepia ink and muted watercolor, hand drawn mountain ranges toward the upper left, a broad winding river passing across the right half, dense primeval forest clusters toward the upper right, a small ruined fortress silhouette among the trees, old compass rose lower left, elegant fine botanical corner ornament. No words, no lettering, no numbers, no runes, no labels, no logos, no UI, no cards. The central 65 percent is mostly open softly textured parchment with very faint paths and contour lines, suitable as a readable interface surface. View directly from above, flat illustration, 16:9 wide landscape, beautifully weathered but luminous cream and honey parchment, restrained dark brown ink, sophisticated Tolkien inspired fantasy cartography and illuminated manuscript craft. No modern graphic design, no heavy dark stains in the center, no photographic desk objects.
