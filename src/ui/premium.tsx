import { Check, Sparkle } from "@phosphor-icons/react";
import type { ScenarioId } from "../game/types";
import { CardBack, TableToken } from "./tabletop";

export const PLAYMATS = {
  "the-city-of-ulfast": {
    name: "The City of Ulfast",
    detail: "Search for Ulchor and evade the City Guard",
  },
  "wrath-and-ruin": {
    name: "The Siege of Dorwinion",
    detail: "Reclaim the city and drive out Thane Ulchor",
  },
  "the-river-running": {
    name: "The River Running",
    detail: "Escape the Easterling pursuit on the journey to Dorwinion",
  },
  "danger-in-dorwinion": {
    name: "Dorwinion",
    detail: "Gather evidence and expose the hidden cult",
  },
  "temple-of-doom": {
    name: "The Temple of Sauron",
    detail: "Enter the temple and confront the power of Mordor",
  },
  "mount-gundabad": {
    name: "Mount Gundabad",
    detail: "Reforge Wormsbane and confront Dagnir in the mountain",
  },
  "the-fate-of-wilderland": {
    name: "The Fate of Wilderland",
    detail: "Defend the valley of Dale against Urdug’s goblin army",
  },
  "the-withered-heath": {
    name: "The Withered Heath",
    detail: "Hunt the Cold-Drake through the northern caverns",
  },
  "roam-across-rhovanion": {
    name: "The Wilds of Rhovanion",
    detail: "Follow Urdug and recover the treasures of the north",
  },
  "fire-in-the-night": {
    name: "Hrogar’s Hill",
    detail: "Defend the Woodmen’s town from Dagnir and the Goblins",
  },
  "the-ghost-of-framsburg": {
    name: "The Ruins of Framsburg",
    detail: "Discover the lost treasures and confront Fram’s Shade",
  },

  "the-black-serpent": {
    name: "The Crossroads Fort",
    detail: "Seize the Serpent’s caravan and the summons from Mordor",
  },
  "the-dungeons-of-cirith-gurat": {
    name: "The Dungeons of Cirith Gurat",
    detail: "Free the prisoners and escape the Orc fortress",
  },
  "the-crossings-of-poros": {
    name: "The Crossings of Poros",
    detail: "Reach the river and defend the Haradrim at Gondor’s border",
  },
  "journey-up-the-anduin": {
    name: "The Vales of Anduin",
    detail: "Follow the river north and rally the Woodmen",
  },
  "lost-in-mirkwood": {
    name: "The Paths of Mirkwood",
    detail: "Find a way through the forest and escape Taur-nu-Fuin",
  },
  "the-kings-quest": {
    name: "The Iron Hills",
    detail: "Search the deep caverns and face the Fire Worm",
  },
  "beneath-the-sands": {
    name: "The Caves Beneath Harad",
    detail: "Find a path through the tunnels and confront the Brood Mother",
  },
  "race-across-harad": {
    name: "The Road North",
    detail: "Ride the Mûmakil toward the Harnen before the Orcs catch you",
  },
  "the-mumakil": {
    name: "The Jungle of Harad",
    detail: "Track the wild Mûmakil and capture mounts for the journey north",
  },
  "escape-from-umbar": {
    name: "Escape from Umbar",
    detail: "Escape the Southron pursuit through the city streets",
  },
  "desert-crossing": {
    name: "The Desert of Harad",
    detail: "Survive the rising heat beneath a merciless sun",
  },
  "the-long-arm-of-mordor": {
    name: "The Long Arm of Mordor",
    detail: "Join the Haradrim and rescue the captured heroes",
  },
  "the-city-of-corsairs": {
    name: "The City of Corsairs",
    detail: "Pursue the Stormcaller and confront Sahír in Umbar",
  },
  "a-storm-on-cobas-haven": {
    name: "Cobas Haven",
    detail: "Rally Dol Amroth and break through the Corsair fleet",
  },
  "the-drowned-ruins": {
    name: "The Drowned Ruins",
    detail: "Explore the flooded grotto and escape the rising waters",
  },
  "temple-of-the-deceived": {
    name: "The Deceived Island",
    detail: "Chart the lost paths to the temple's hidden entrance",
  },
  "the-thing-in-the-depths": {
    name: "The Stormcaller's Deck",
    detail: "Free the ship from the creature's grasp",
  },
  "flight-of-the-stormcaller": {
    name: "The Stormcaller's Wake",
    detail: "Pursue Sahír along the coast of Andrast",
  },
  "voyage-across-belegaer": {
    name: "Belegaer",
    detail: "The Dream-chaser’s fleet upon the Great Sea",
  },
  "the-fate-of-numenor": {
    name: "The Isles of Númenor",
    detail: "Uncharted shores and drowned ruins",
  },
  "raid-on-the-grey-havens": {
    name: "The Grey Havens",
    detail: "Corsair sails and fires at Mithlond",
  },
  "wastes-of-eriador": {
    name: "The Wastes of Eriador",
    detail: "Wargs beneath the shifting skies of Arnor",
  },
  "escape-from-mount-gram": {
    name: "Mount Gram",
    detail: "Rescue the prisoners from Gornákh’s dungeons",
  },
  "across-the-ettenmoors": {
    name: "The Ettenmoors",
    detail: "Seek shelter among the wild northern moors",
  },
  "the-treachery-of-rhudaur": {
    name: "Rhudaur",
    detail: "Search the haunted halls for hidden clues",
  },
  "the-battle-of-carn-dum": {
    name: "Carn Dûm",
    detail: "Thaurdir’s armies before the fortress walls",
  },
  "the-dread-realm": {
    name: "The Dread Realm",
    detail: "Confront Daechanar beneath Angmar",
  },

  "deadmens-dike": {
    name: "Deadmen's Dike",
    detail: "Undead shadows over the ruins of Fornost",
  },
  "the-weather-hills": {
    name: "The Weather Hills",
    detail: "The hunt through the storm in ruined Arnor",
  },
  "intruders-in-chetwood": {
    name: "Chetwood",
    detail: "The Rangers’ secret vigil in Bree-land",
  },
  "the-antlered-crown": {
    name: "The Antlered Crown",
    detail: "The war of the Dunland clans",
  },
  "celebrimbors-secret": {
    name: "Celebrimbor’s Secret",
    detail: "The hidden forge of Ost-in-Edhil",
  },
  "the-nin-in-eilph": {
    name: "The Nîn-in-Eilph",
    detail: "Lost among the reeds of the Swanfleet",
  },
  "trouble-in-tharbad": {
    name: "Trouble in Tharbad",
    detail: "Through ruined streets and hidden alleys",
  },
  "the-three-trials": {
    name: "The Three Trials",
    detail: "The Keys of Boar, Wolf and Raven",
  },
  "the-dunland-trap": {
    name: "The Dunland Trap",
    detail: "The Boar Clan ambush on the old road",
  },
  "into-fangorn": {
    name: "Into Fangorn",
    detail: "Escape the anger of the ancient forest",
  },
  "to-catch-an-orc": {
    name: "To Catch an Orc",
    detail: "Search the heights of Methedras",
  },
  "fords-of-isen": {
    name: "Fords of Isen",
    detail: "Hold the crossing against the Dunlendings",
  },
  "the-blood-of-gondor": {
    name: "The Blood of Gondor",
    detail: "An ambush in Ithilien",
  },
  "the-morgul-vale": {
    name: "The Morgul Vale",
    detail: "Rescue the captives before the tower",
  },
  mirkwood: { name: "Mirkwood", detail: "The ancient woodland" },
  anduin: { name: "Anduin", detail: "A river of silver & mist" },
  "dol-guldur": { name: "Dol Guldur", detail: "In the shadow of the keep" },
  "hunt-for-gollum": {
    name: "Anduin Valley",
    detail: "Where the trail begins",
  },
  "conflict-at-the-carrock": {
    name: "The Carrock",
    detail: "Trolls beside the Anduin",
  },
  "hills-of-emyn-muil": {
    name: "Emyn Muil",
    detail: "The hills beside the Great River",
  },
  "journey-to-rhosgobel": {
    name: "Rhosgobel",
    detail: "A wounded Eagle's refuge",
  },
  "return-to-mirkwood": {
    name: "Return to Mirkwood",
    detail: "Guard Gollum through the forest",
  },
  "dead-marshes": {
    name: "The Dead Marshes",
    detail: "Gollum's trail through the mire",
  },
  "into-the-pit": {
    name: "Into the Pit",
    detail: "Beyond the East-gate of Moria",
  },
  "the-seventh-level": {
    name: "The Seventh Level",
    detail: "The halls of Khazad-dûm",
  },
  "flight-from-moria": {
    name: "Flight from Moria",
    detail: "Find a way out of the darkness",
  },
  "redhorn-gate": {
    name: "The Redhorn Gate",
    detail: "Snow on the slopes of Caradhras",
  },
  "road-to-rivendell": {
    name: "Road to Rivendell",
    detail: "Escort Arwen beyond the Misty Mountains",
  },
  "shadow-and-flame": {
    name: "Shadow and Flame",
    detail: "Durin’s Bane beneath Khazad-dûm",
  },
  "the-long-dark": {
    name: "The Long Dark",
    detail: "Locate the eastward path beneath Moria",
  },
  "foundations-of-stone": {
    name: "Foundations of Stone",
    detail: "Separate paths beneath the drowned halls",
  },
  "peril-in-pelargir": {
    name: "Pelargir",
    detail: "Brigands at the Anduin docks",
  },
  "into-ithilien": {
    name: "Ithilien",
    detail: "The ambush on the southern road",
  },
  "siege-of-cair-andros": {
    name: "Cair Andros",
    detail: "Defend the island fortress",
  },
  "the-druadan-forest": {
    name: "Drúadan Forest",
    detail: "The hidden paths of the Woses",
  },
  "encounter-at-amon-din": {
    name: "Amon Dîn",
    detail: "The burning villages of Anórien",
  },
  "assault-on-osgiliath": {
    name: "Osgiliath",
    detail: "Reclaim the ancient capital",
  },
  "the-stewards-fear": {
    name: "Minas Tirith",
    detail: "A hidden conspiracy in the White City",
  },
  "watcher-in-the-water": {
    name: "The West-door",
    detail: "Tentacles in the lake before Moria",
  },
} satisfies Record<ScenarioId, { name: string; detail: string }>;

export const PLAYMAT_CHOICES = [
  "adventure",
  "mirkwood",
  "anduin",
  "dol-guldur",
  "hunt-for-gollum",
  "conflict-at-the-carrock",
  "hills-of-emyn-muil",
  "journey-to-rhosgobel",
  "dead-marshes",
  "return-to-mirkwood",
  "into-the-pit",
  "the-seventh-level",
  "flight-from-moria",
  "redhorn-gate",
  "road-to-rivendell",
  "watcher-in-the-water",
  "the-long-dark",
  "foundations-of-stone",
  "peril-in-pelargir",
  "into-ithilien",
  "siege-of-cair-andros",
  "the-stewards-fear",
  "the-druadan-forest",
  "encounter-at-amon-din",
  "assault-on-osgiliath",
  "the-blood-of-gondor",
  "the-morgul-vale",
  "fords-of-isen",
  "to-catch-an-orc",
  "into-fangorn",
  "the-dunland-trap",
  "the-three-trials",
  "trouble-in-tharbad",
  "the-nin-in-eilph",
  "celebrimbors-secret",
  "the-antlered-crown",
  "intruders-in-chetwood",
  "the-weather-hills",
  "deadmens-dike",
  "wastes-of-eriador",
  "escape-from-mount-gram",
  "across-the-ettenmoors",
  "the-treachery-of-rhudaur",
  "the-battle-of-carn-dum",
  "the-dread-realm",
  "voyage-across-belegaer",
  "the-fate-of-numenor",
  "raid-on-the-grey-havens",
  "flight-of-the-stormcaller",
  "the-thing-in-the-depths",
  "temple-of-the-deceived",
  "the-drowned-ruins",
  "a-storm-on-cobas-haven",
  "the-city-of-corsairs",
  "escape-from-umbar",
  "desert-crossing",
  "the-long-arm-of-mordor",
  "the-mumakil",
  "race-across-harad",
  "beneath-the-sands",
  "the-withered-heath",
  "roam-across-rhovanion",
  "fire-in-the-night",
  "the-ghost-of-framsburg",
  "mount-gundabad",
  "the-fate-of-wilderland",
  "the-river-running",
  "danger-in-dorwinion",
  "temple-of-doom",
  "wrath-and-ruin",
  "the-city-of-ulfast",
  "the-black-serpent",
  "the-dungeons-of-cirith-gurat",
  "the-crossings-of-poros",
  "journey-up-the-anduin",
  "lost-in-mirkwood",
  "the-kings-quest",
  "shadow-and-flame",
] as const;

export function TableCollection({
  selected,
  active,
  select,
}: {
  selected: (typeof PLAYMAT_CHOICES)[number];
  active: ScenarioId;
  select: (value: (typeof PLAYMAT_CHOICES)[number]) => void;
}) {
  return (
    <section className="table-collection" aria-labelledby="collection-title">
      <div className="collection-heading">
        <span>
          <Sparkle size={13} weight="duotone" /> THE COLLECTOR’S TABLE
        </span>
        <h3 id="collection-title">A place for your adventure.</h3>
        <p>Illustrated playmats, gilded card backs & tabletop tokens.</p>
      </div>
      <div className={`collection-preview mat-${active}`} aria-hidden="true">
        <div className="collection-preview-caption">
          <span>YOUR PLAYMAT</span>
          <strong>{PLAYMATS[active].name}</strong>
          <small>{PLAYMATS[active].detail}</small>
        </div>
        <div className="collection-objects">
          <CardBack />
          <CardBack encounter />
          <div className="collection-tokens">
            <TableToken kind="resource" value={3} />
            <TableToken kind="damage" value={2} />
            <TableToken kind="progress" value={5} />
          </div>
        </div>
      </div>
      <div
        className="playmat-options"
        role="group"
        aria-label="Playmat artwork"
      >
        {(Object.keys(PLAYMATS) as ScenarioId[]).map((id) => (
          <button
            key={id}
            aria-label={`${PLAYMATS[id].name} playmat`}
            aria-pressed={active === id}
            className={active === id ? "selected" : ""}
            onClick={() => select(id)}
          >
            <span className={`playmat-thumbnail mat-${id}`}>
              {active === id && <Check size={15} weight="bold" />}
            </span>
            <strong>{PLAYMATS[id].name}</strong>
          </button>
        ))}
      </div>
      <label className="playmat-follow">
        <input
          type="checkbox"
          checked={selected === "adventure"}
          onChange={(event) =>
            select(event.target.checked ? "adventure" : active)
          }
        />
        <span>
          <strong>Follow the adventure</strong>
          <small>Match the playmat to each quest automatically.</small>
        </span>
      </label>
      <div className="collection-materials" aria-label="Table accessories">
        <span>
          <i className="material-dot material-gold" /> Gold · Resources
        </span>
        <span>
          <i className="material-dot material-damage" /> Wounds · Damage
        </span>
        <span>
          <i className="material-dot material-jade" /> Jade · Progress
        </span>
      </div>
    </section>
  );
}
