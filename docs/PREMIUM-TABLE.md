# Premium tabletop artwork

Original artwork generated with the built-in `image_gen` tool on 2026-09-24. The production assets live in `public/art/premium/`. These are original fan-project treatments, not official card backs or licensed accessories. Gameplay counts and decisions remain owned by the rules engine.

## Using the collection

Click the playmat thumbnail beside the table tools, or open **Table preferences** (`?`). The three illustrated surfaces can be selected at any time. **Follow the adventure**, enabled by default, matches the surface to the current quest; a manual choice persists across games and reloads. It is a device preference, separate from game saves and campaign progression.

White Tree player backs and Eye encounter backs also appear on facedown shadow cards and encounter reveal animations. Gold resource, ruby damage, and jade progress counters retain live numbers, accessible labels, and count-change animations. The collection preview uses illustrative counts only.

## Production assets

| File in `public/art/premium/` | Dimensions | Use |
| --- | --- | --- |
| `mirkwood.webp` | 1536 × 1024 | Woodland playmat |
| `anduin.webp` | 1536 × 1024 | River playmat |
| `dol-guldur.webp` | 1536 × 1024 | Fortress playmat |
| `fellowship-back.webp` | 420 × 630 | Player card back |
| `shadow-back.webp` | 420 × 630 | Encounter and shadow card back |
| `premium-tokens.webp` | 768 × 256 | Gold / ruby / jade token sprite |

Six production WebP files total approximately 1.26 MB. Generated artwork is only resized and encoded for the web; the token sprite preserves its alpha channel. Its three equal square regions use CSS background positions of 0%, 50%, and 100%. The original generated PNGs are retained in the local imagegen output folder. No generation service or external asset request is needed at runtime.

## Generation prompts

### mirkwood

Use case: stylized-concept. Asset type: landscape illustration printed on a premium fantasy tabletop card game playmat, wide 3:2 landscape image. Create original painterly Mirkwood-inspired ancient woodland, immersive overhead-like panoramic environment, not a product mockup. Immense mossy trunks frame the far left and far right, a winding forest path and emerald mist disappear towards a distant warm golden clearing slightly right of center. Ancient carved stones, tiny ferns, silver-green leaves, quiet magical atmosphere. Rich dark bottle green, muted olive, antiqued gold light, subtle ochre. Hand-painted oil and gouache texture, finely detailed illuminated fantasy atlas aesthetic with a very subtle woven textile grain. Deliberately calm and low contrast across the central 70 percent of the image, where real playing cards will sit. More illustrative detail at the corners and edges. The scene must remain beautiful without bright distracting highlights. Full bleed art only, no frame, no text, no logos, no card slots, no cards, no UI, no people, no watermark. Premium tactile collectible board game art.

### anduin

Use case: stylized-concept. Asset type: landscape illustration printed on a premium fantasy tabletop card game playmat, wide 3:2 landscape image. Create original painterly Anduin-inspired river landscape in an ancient fantasy world. A broad dark blue-green river curves through a quiet valley with pale mist, distant old mountains, willow trees and carved weathered stone ruins at the far edges. A low distant warm dawn glows behind the mountains in the upper right, dark foreground reeds and weathered stone at corners. Rich deep teal and slate blue, muted sage, aged silver and restrained gold. Hand-painted oil and gouache, illuminated fantasy atlas aesthetic, very subtle woven textile texture. Calm low-contrast open water and mist occupy central 70 percent to sit under playing cards. Illustration detail concentrated at edges. Cinematic, refined, tranquil, readable as a textured game surface. Full bleed art only, no frame, no text, no logos, no UI, no cards, no card slots, no people, no watermark. Premium tactile collectible board game art.

### dol-guldur

Use case: stylized-concept. Asset type: landscape illustration printed on a premium fantasy tabletop card game playmat, wide 3:2 landscape image. Create original painterly Dol Guldur-inspired dark forest fortress. Ancient ruined gothic tower and black crenellations in the far upper right, gnarled bare trees frame the outer corners, muted ember light in a few distant windows, black stone path lost in smoky violet fog. Rich charcoal, muted aubergine, blackened bronze, desaturated moss, subdued amber. Hand-painted oil and gouache texture, illuminated fantasy atlas atmosphere, very subtle woven textile grain. Quiet rather than horror, no monsters, no people. Very restrained low contrast in central 70 percent where real playing cards will sit; interesting masonry and roots at edges. Full bleed art only, no frame, no text, no logos, no UI, no cards, no card slots, no watermark. Premium tactile collectible board game art.

### fellowship-back

Use case: stylized-concept. Asset type: production playing-card BACK artwork, portrait 2:3 full-bleed image, flat orthographic view straight-on, one single rectangular back fills the entire canvas, no surrounding background. Premium emerald-green leather and antique gold foil collectible fantasy card back. Symmetrical intricate fine elven Art Nouveau gold interlace border, a majestic luminous silver White Tree embossed centrally within an ornate gold circular medallion, seven tiny silver stars in an arc above its boughs. Dark rich green field with extremely subtle leaves, leather grain and etched botanical filigree. Corners have small gold floral knots, perfectly balanced composition, convincingly tactile gold foil with understated glints. Inspired by handcrafted Middle-earth collector's objects, luxurious and legible even small. No lettering, no text, no words, no logos, no watermark, no perspective, no photographed tabletop, no multiple cards, no outer blank margin. Only the card back artwork to all four edges.

### shadow-back

Use case: stylized-concept. Asset type: production playing-card BACK artwork, portrait 2:3 full-bleed image, flat orthographic view straight-on, one single rectangular back fills the entire canvas, no surrounding background. Premium oxblood-black leather and dark copper foil collectible fantasy encounter card back. Symmetrical fine angular gothic engraved copper interlace border, an ember-red lidless Eye with vertical black pupil centrally embossed within a narrow antique-bronze circular medallion. Ominous subdued glow, deep burgundy and black field, intricate shadowy branches and subtle worn leather grain. Four corners have restrained copper thorn knots, balanced composition, convincingly tactile metal foil with understated glints. Inspired by handcrafted Middle-earth collector's objects, luxurious and readable even small. No lettering, no text, no words, no logos, no watermark, no perspective, no photographed tabletop, no multiple cards, no outer blank margin. Only card back artwork to all four edges.

### premium-tokens

Use case: stylized-concept. Asset type: production game TOKEN SPRITE SHEET, a wide horizontal 3:1 image. Exactly THREE equally sized circular premium gaming tokens arranged in a single perfectly even horizontal row, each token centered in its own equal square third of the canvas: first at x=1/6, second at x=1/2, third at x=5/6; all y=1/2. Each circular token occupies 90 percent of the height and stays strictly inside its third. Flat orthographic top-down view, premium tactile polished metal and translucent enamel, fine engraved elven leaf interlace around each outer metal rim. LEFT: antique GOLD rim with honey-gold enamel center, tiny engraved coin stack emblem only at the twelve-o'clock edge. MIDDLE: aged COPPER rim with deep RUBY red enamel center, tiny engraved teardrop at twelve-o'clock. RIGHT: aged SILVER rim with deep JADE green enamel center, tiny engraved leaf at twelve-o'clock. The central 65 percent inside each token MUST be blank quiet dark enamel, no symbol there because a live digital number will be overlaid in the center. Delicate realistic metal reflections, subtle bevels, consistent gentle light from upper left. No numbers, no text, no lettering, no watermark, no table, no perspective, no other objects. Truly TRANSPARENT BACKGROUND with alpha outside the three separate coins, no checkerboard, no floor, no cast shadow outside silhouette. This is one precisely aligned sprite sheet intended for CSS background positions.
