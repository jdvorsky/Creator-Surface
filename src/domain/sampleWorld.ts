import type { WorldDocument } from "./model";

export const sampleWorld: WorldDocument = {
  schemaVersion: 1,
  id: "world_tideglass",
  name: "Tideglass Archipelago",
  metadata: {
    description: "A compact sample world for validating synchronized creator workflows.",
  },
  scenes: [
    {
      id: "scene_harbor",
      name: "Harbor District",
      bounds: { width: 1000, height: 640 },
      metadata: {
        region: "Silver Coast",
      },
      entities: [
        {
          id: "marker_lighthouse",
          type: "location",
          name: "Stormglass Lighthouse",
          position: { x: 170, y: 140 },
          data: {
            category: "landmark",
            discoveryRadius: 42,
          },
          metadata: {
            description: "A rotating prism lens watches the reef.",
            tags: ["beacon", "coast"],
            region: "North Pier",
          },
        },
        {
          id: "character_mira",
          type: "character",
          name: "Mira the Cartographer",
          position: { x: 390, y: 330 },
          data: {
            role: "guide",
            disposition: "friendly",
            level: 12,
          },
          metadata: {
            description: "Keeps waterproof maps in a brass case.",
            tags: ["maps", "quest"],
            faction: "Harbor Guild",
          },
        },
        {
          id: "item_sunken_compass",
          type: "item",
          name: "Sunken Compass",
          position: { x: 610, y: 420 },
          data: {
            category: "artifact",
            quantity: 1,
            collectible: true,
          },
          metadata: {
            description: "Points toward promises rather than north.",
            tags: ["demo-drag", "relic"],
            rarity: "rare",
          },
        },
        {
          id: "portal_old_gate",
          type: "portal",
          name: "Old Gate",
          position: { x: 830, y: 210 },
          data: {
            target: { kind: "scene", id: "scene_ruins" },
            oneWay: false,
            activation: "interact",
          },
          metadata: {
            description: "The gate opens when the harbor bell rings twice.",
            tags: ["gate"],
            transitionLabel: "Step through the barnacled arch",
          },
        },
        {
          id: "portal_moon_shrine",
          type: "portal",
          name: "Moon Shrine Trail",
          position: { x: 760, y: 520 },
          data: {
            target: { kind: "entity", id: "marker_moon_shrine" },
            oneWay: true,
            activation: "touch",
          },
          metadata: {
            transitionLabel: "Follow the silver shells",
          },
        },
      ],
    },
    {
      id: "scene_ruins",
      name: "Moonlit Ruins",
      bounds: { width: 920, height: 620 },
      metadata: {
        region: "Inner Reef",
      },
      entities: [
        {
          id: "marker_moon_shrine",
          type: "location",
          name: "Moon Shrine",
          position: { x: 500, y: 250 },
          data: {
            category: "interaction",
            discoveryRadius: 24,
          },
          metadata: {
            tags: ["moon", "shrine"],
            region: "Upper Terrace",
          },
        },
        {
          id: "character_reef_guard",
          type: "character",
          name: "Reef Guard",
          position: { x: 360, y: 380 },
          data: {
            role: "guard",
            disposition: "neutral",
            level: 18,
          },
          metadata: {
            faction: "Tide Wardens",
          },
        },
        {
          id: "item_vault_key",
          type: "item",
          name: "Vault Key",
          position: { x: 650, y: 330 },
          data: {
            category: "key",
            quantity: 1,
            collectible: true,
          },
          metadata: {
            rarity: "epic",
          },
        },
        {
          id: "portal_return_harbor",
          type: "portal",
          name: "Return Tide",
          position: { x: 150, y: 540 },
          data: {
            target: { kind: "scene", id: "scene_harbor" },
            oneWay: false,
            activation: "automatic",
          },
          metadata: {
            transitionLabel: "Wake at the harbor steps",
          },
        },
      ],
    },
    {
      id: "scene_fogbank",
      name: "Fogbank Outskirts",
      bounds: { width: 860, height: 420 },
      metadata: {
        region: "Cloud Strait",
      },
      entities: [
        {
          id: "marker_watchpost",
          type: "location",
          name: "Signal Watchpost",
          position: { x: 120, y: 188 },
          data: {
            category: "building",
            discoveryRadius: 50,
          },
          metadata: {
            tags: ["watch", "sparse"],
            region: "North Ridge",
            description: "A low stone outpost with weathered signal mirrors.",
          },
        },
        {
          id: "portal_fogbank_harbor",
          type: "portal",
          name: "Misty Return",
          position: { x: 500, y: 340 },
          data: {
            target: { kind: "scene", id: "scene_harbor" },
            oneWay: false,
            activation: "touch",
          },
          metadata: {
            transitionLabel: "Open the fog gate",
          },
        },
      ],
    },
    {
      id: "scene_aurora_grotto",
      name: "Aurora Grotto",
      bounds: { width: 1180, height: 840 },
      metadata: {
        region: "Submerged Vale",
      },
      entities: [
        {
          id: "marker_echo_stalagmite",
          type: "location",
          name: "Echo Stalagmite",
          position: { x: 180, y: 260 },
          data: {
            category: "natural",
            discoveryRadius: 18,
          },
          metadata: {
            tags: ["echo", "underground", "landmark"],
            region: "Lower Cavern",
            description: "Drops a low note when the tides rise.",
          },
        },
        {
          id: "character_grotto_keeper",
          type: "character",
          name: "Grotto Keeper",
          position: { x: 610, y: 430 },
          data: {
            role: "guide",
            disposition: "neutral",
            level: 24,
          },
          metadata: {
            description: "Catalogs old sea maps in a waxed satchel.",
            tags: ["guide", "maps"],
            faction: "Cavern Choir",
          },
        },
        {
          id: "character_echoing_trader",
          type: "character",
          name: "Echoing Trader",
          position: { x: 940, y: 210 },
          data: {
            role: "merchant",
            disposition: "friendly",
            level: 12,
          },
          metadata: {
            description: "Barters for anything with a story.",
            tags: ["merchant", "crowded"],
            faction: "Cove Exchange",
          },
        },
        {
          id: "item_glowfungi",
          type: "item",
          name: "Glowlamp Fungi",
          position: { x: 320, y: 580 },
          data: {
            category: "artifact",
            quantity: 6,
            collectible: true,
          },
          metadata: {
            description: "A bioluminescent cluster that fades near saltwater.",
            tags: ["crowded", "quest"],
            rarity: "rare",
          },
        },
        {
          id: "item_chime_stone",
          type: "item",
          name: "Chime Stone",
          position: { x: 870, y: 670 },
          data: {
            category: "key",
            quantity: 2,
            collectible: true,
          },
          metadata: {
            description: "Plays an infrasound when tapped.",
            tags: ["rare", "music"],
            rarity: "uncommon",
          },
        },
        {
          id: "item_copper_hook",
          type: "item",
          name: "Copper Hook",
          position: { x: 520, y: 760 },
          data: {
            category: "tool",
            quantity: 1,
            collectible: true,
          },
          metadata: {
            description: "Useful for catching hanging banners.",
            tags: ["tooling"],
            rarity: "common",
          },
        },
        {
          id: "portal_grotto_market",
          type: "portal",
          name: "Grotto-Market Lift",
          position: { x: 980, y: 510 },
          data: {
            target: { kind: "entity", id: "character_echoing_trader" },
            oneWay: true,
            activation: "interact",
          },
          metadata: {
            transitionLabel: "Ride the gliding lift",
          },
        },
        {
          id: "character_mirror_scribe",
          type: "character",
          name: "Mirror Scribe",
          position: { x: 220, y: 730 },
          data: {
            role: "guide",
            disposition: "neutral",
            level: 8,
          },
          metadata: {
            description: "Keeps mirrored records of all arrivals.",
            tags: ["scribe", "history"],
          },
        },
        {
          id: "character_barnacle_knight",
          type: "character",
          name: "Barnacle Knight",
          position: { x: 420, y: 640 },
          data: {
            role: "guard",
            disposition: "hostile",
            level: 16,
          },
          metadata: {
            description: "Patrols narrow shelves with a stern posture.",
            tags: ["guard", "patrol"],
            faction: "Grotto Wardens",
          },
        },
      ],
    },
    {
      id: "scene_market_lane",
      name: "Low Tide Market",
      bounds: { width: 1020, height: 560 },
      metadata: {
        region: "Harbor Shelf",
      },
      entities: [
        {
          id: "character_haggle_master",
          type: "character",
          name: "Haggle Master",
          position: { x: 150, y: 150 },
          data: {
            role: "merchant",
            disposition: "friendly",
            level: 14,
          },
          metadata: {
            description: "Never forgets who paid with copper.",
            tags: ["merchant", "market"],
            faction: "Harbor Guild",
          },
        },
        {
          id: "marker_moon_gate",
          type: "location",
          name: "Moonlit Stall",
          position: { x: 360, y: 300 },
          data: {
            category: "settlement",
            discoveryRadius: 35,
          },
          metadata: {
            tags: ["market", "crowd"],
            region: "Lower Docks",
            description: "A crowd-heavy location with temporary stalls.",
          },
        },
        {
          id: "item_salt_chart",
          type: "item",
          name: "Salt Route Chart",
          position: { x: 520, y: 220 },
          data: {
            category: "map",
            quantity: 3,
            collectible: true,
          },
          metadata: {
            description: "Marks safe passages at low tide.",
            tags: ["navigation", "trade"],
            rarity: "common",
          },
        },
        {
          id: "item_copper_needle",
          type: "item",
          name: "Copper Needle",
          position: { x: 700, y: 430 },
          data: {
            category: "artifact",
            quantity: 2,
            collectible: true,
          },
          metadata: {
            description: "A ritual needle used for cloth repairs.",
            tags: ["craft"],
            rarity: "uncommon",
          },
        },
        {
          id: "portal_tide_gate",
          type: "portal",
          name: "Market Lift",
          position: { x: 900, y: 430 },
          data: {
            target: { kind: "scene", id: "scene_market_lane" },
            oneWay: false,
            activation: "automatic",
          },
          metadata: {
            transitionLabel: "Open to same scene for staging test",
          },
        },
        {
          id: "item_merchant_key",
          type: "item",
          name: "Merchant Token",
          position: { x: 300, y: 445 },
          data: {
            category: "treasure",
            quantity: 5,
            collectible: true,
          },
          metadata: {
            description: "Stamped by the Harbor Guild.",
            tags: ["currency"],
            rarity: "legendary",
          },
        },
      ],
    },
    {
      id: "scene_moonline",
      name: "Moonline Crossing",
      bounds: { width: 940, height: 520 },
      metadata: {
        region: "Open Shelf",
      },
      entities: [
        {
          id: "marker_moonline",
          type: "location",
          name: "Moonline Beacon",
          position: { x: 470, y: 250 },
          data: {
            category: "interaction",
            discoveryRadius: 60,
          },
          metadata: {
            tags: ["beacon", "crowded"],
            region: "Crossover Ridge",
            description: "A crowded transit node where many entities converge.",
          },
        },
        {
          id: "portal_crossing",
          type: "portal",
          name: "Crossing Exit",
          position: { x: 700, y: 180 },
          data: {
            target: { kind: "scene", id: "scene_moonline" },
            oneWay: false,
            activation: "touch",
          },
          metadata: {
            transitionLabel: "Re-center at Moonline Beacon",
          },
        },
        {
          id: "character_aisle_guard",
          type: "character",
          name: "Aisle Guard",
          position: { x: 130, y: 390 },
          data: {
            role: "guard",
            disposition: "neutral",
            level: 15,
          },
          metadata: {
            description: "Monitors crossing signals and crowd flow.",
            tags: ["guard", "crowded"],
            faction: "Signal Wardens",
          },
        },
        {
          id: "item_light_token",
          type: "item",
          name: "Crossing Token",
          position: { x: 810, y: 410 },
          data: {
            category: "map",
            quantity: 1,
            collectible: true,
          },
          metadata: {
            description: "Lights appear when the crowds move.",
            tags: ["crowded", "navigation"],
            rarity: "rare",
          },
        },
      ],
    },
  ],
};
