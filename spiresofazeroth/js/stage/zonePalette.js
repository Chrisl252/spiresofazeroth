// zonePalette.js - Spires of Azeroth biome & atmospheric lighting profiles for all 40 zones.
// Data sourced from tools/spires/vista/zones.json (sky colors, ambient, sun, fog) and data/backdrops.json.
// Used by actors3d (Three.js lighting + 3D ground terrain) and backdrop.js (sky gradient + vista depth).

export const BIOMES = {
  forest: {
    name: "Forest",
    terrain: { base: "#3d6e24", accent: "#63a82e", detail: "#224714", roughness: 0.82, metalness: 0.01, bumpScale: 0.75, grass: true },
  },
  snow: {
    name: "Snow",
    terrain: { base: "#d8e7f5", accent: "#bad4ed", detail: "#55677b", roughness: 0.62, metalness: 0.05, bumpScale: 0.50, snow: true },
  },
  desert: {
    name: "Desert",
    terrain: { base: "#c89b52", accent: "#ddb46f", detail: "#8c6229", roughness: 0.92, metalness: 0.01, bumpScale: 0.85, sand: true },
  },
  swamp: {
    name: "Swamp",
    terrain: { base: "#232e1d", accent: "#3c532d", detail: "#131b0f", roughness: 0.44, metalness: 0.08, bumpScale: 0.65, wet: true },
  },
  graveyard: {
    name: "Graveyard",
    terrain: { base: "#252030", accent: "#3d324d", detail: "#16121e", roughness: 0.88, metalness: 0.02, bumpScale: 0.78, cursed: true },
  },
  volcanic: {
    name: "Volcanic",
    terrain: { base: "#1a1617", accent: "#38292c", detail: "#ff4d05", roughness: 0.76, metalness: 0.12, bumpScale: 1.15, emissive: "#ff3e00", emissiveIntensity: 0.92, lava: true },
  },
  mountains: {
    name: "Mountains",
    terrain: { base: "#504b43", accent: "#6f6759", detail: "#312e29", roughness: 0.90, metalness: 0.04, bumpScale: 0.95, rock: true },
  },
  jungle: {
    name: "Jungle",
    terrain: { base: "#1e3318", accent: "#2d5921", detail: "#132310", roughness: 0.72, metalness: 0.03, bumpScale: 0.80, jungle: true },
  },
  cavern: {
    name: "Cavern",
    terrain: { base: "#564632", accent: "#755f43", detail: "#362a1c", roughness: 0.91, metalness: 0.03, bumpScale: 0.90, chitin: true },
  },
  plains: {
    name: "Plains",
    terrain: { base: "#565032", accent: "#837644", detail: "#36321e", roughness: 0.88, metalness: 0.02, bumpScale: 0.70, plains: true },
  },
  coastal: {
    name: "Coastal",
    terrain: { base: "#4c5861", accent: "#6e7f8d", detail: "#2c353c", roughness: 0.58, metalness: 0.06, bumpScale: 0.60, coastal: true },
  },
};

export const ZONE_PROFILES = {
  "alterac-mountains": {
    name: "Alterac Mountains", biome: "snow",
    sky: { top: "#0c0c1d", mid: "#596e81", haze: "#777f86", fog: "#8e989a", sun: "#9098a0", ambient: "#646464", direct: "#9098a0", suncol: "#f5ffde", ground: "#646464" },
    theme: { primary: "#7a6aa8", secondary: "#1c1830", accent: "#d8c8ff" },
  },
  "arathi-highlands": {
    name: "Arathi Highlands", biome: "plains",
    sky: { top: "#003c49", mid: "#485a64", haze: "#848a8f", fog: "#5e6e77", sun: "#ffdaad", ambient: "#416384", direct: "#ffdaad", suncol: "#f0f0f0", ground: "#416384" },
    theme: { primary: "#7a8a4a", secondary: "#2a2f1c", accent: "#d9b25c" },
  },
  "ashenvale": {
    name: "Ashenvale", biome: "forest",
    sky: { top: "#05495c", mid: "#5a947b", haze: "#01486a", fog: "#03496b", sun: "#bff5ff", ambient: "#4863a6", direct: "#bff5ff", suncol: "#e0f7ff", ground: "#4863a6" },
    theme: { primary: "#2f7a4a", secondary: "#0f2a1a", accent: "#9fb8ff" },
  },
  "azshara": {
    name: "Azshara", biome: "coastal",
    sky: { top: "#151616", mid: "#86a4a2", haze: "#ffab3c", fog: "#3e636a", sun: "#ffbf75", ambient: "#656973", direct: "#ffbf75", suncol: "#ffe6ca", ground: "#656973" },
    theme: { primary: "#4a7fbf", secondary: "#14233a", accent: "#9fe6ff" },
  },
  "badlands": {
    name: "Badlands", biome: "desert",
    sky: { top: "#ffecd2", mid: "#86715d", haze: "#354e5a", fog: "#293232", sun: "#ff9a15", ambient: "#7d7d7d", direct: "#ff9a15", suncol: "#fff3e2", ground: "#7d7d7d" },
    theme: { primary: "#a8542a", secondary: "#33170c", accent: "#e2a85a" },
  },
  "blasted-lands": {
    name: "Blasted Lands", biome: "volcanic",
    sky: { top: "#230012", mid: "#1f0a1b", haze: "#6b4e49", fog: "#2a1c23", sun: "#ffcc88", ambient: "#482f6b", direct: "#ffcc88", suncol: "#c38056", ground: "#482f6b" },
    theme: { primary: "#8a2a5a", secondary: "#240d2a", accent: "#a6e03c" },
  },
  "burning-steppes": {
    name: "Burning Steppes", biome: "volcanic",
    sky: { top: "#000000", mid: "#d44002", haze: "#c74400", fog: "#652106", sun: "#996b35", ambient: "#565656", direct: "#996b35", suncol: "#ff8e00", ground: "#565656" },
    theme: { primary: "#7a2a14", secondary: "#1c0b08", accent: "#ff9a3c" },
  },
  "darkshore": {
    name: "Darkshore", biome: "coastal",
    sky: { top: "#001f49", mid: "#3aa2cf", haze: "#afdae0", fog: "#4d788f", sun: "#ff8800", ambient: "#68829a", direct: "#ff8800", suncol: "#fff7de", ground: "#68829a" },
    theme: { primary: "#3d6f8f", secondary: "#10202b", accent: "#c9b6ff" },
  },
  "deadwind-pass": {
    name: "Deadwind Pass", biome: "graveyard",
    sky: { top: "#b9e3fb", mid: "#323a42", haze: "#596974", fog: "#4c5b66", sun: "#8d9ba9", ambient: "#37444c", direct: "#8d9ba9", suncol: "#dcf1ff", ground: "#37444c" },
    theme: { primary: "#4a3a6a", secondary: "#120d1c", accent: "#b78cf0" },
  },
  "desolace": {
    name: "Desolace", biome: "desert",
    sky: { top: "#080c08", mid: "#202d1a", haze: "#695d31", fog: "#2f3022", sun: "#e9e1d7", ambient: "#254847", direct: "#e9e1d7", suncol: "#ffedd6", ground: "#254847" },
    theme: { primary: "#a05a3c", secondary: "#2b1a14", accent: "#d8c27a" },
  },
  "dun-morogh": {
    name: "Dun Morogh", biome: "snow",
    sky: { top: "#023179", mid: "#69c8de", haze: "#eaffff", fog: "#56b3d4", sun: "#c7a886", ambient: "#1f527d", direct: "#c7a886", suncol: "#fff7de", ground: "#1f527d" },
    theme: { primary: "#a9c7e8", secondary: "#1c2a3a", accent: "#f2f6fb" },
  },
  "durotar": {
    name: "Durotar", biome: "desert",
    sky: { top: "#a06394", mid: "#ffe2af", haze: "#c1634e", fog: "#843d3f", sun: "#ffcc94", ambient: "#8c6f8e", direct: "#ffcc94", suncol: "#fff7de", ground: "#8c6f8e" },
    theme: { primary: "#b5532b", secondary: "#3a1d10", accent: "#e8b54a" },
  },
  "duskwood": {
    name: "Duskwood", biome: "graveyard",
    sky: { top: "#001721", mid: "#00afd6", haze: "#00fcff", fog: "#00759d", sun: "#82b9de", ambient: "#406589", direct: "#82b9de", suncol: "#c7ecff", ground: "#406589" },
    theme: { primary: "#4a3a6a", secondary: "#12101c", accent: "#8f7fb8" },
  },
  "dustwallow-marsh": {
    name: "Dustwallow Marsh", biome: "swamp",
    sky: { top: "#c8b999", mid: "#8c826d", haze: "#766c5b", fog: "#3c352e", sun: "#f2bf86", ambient: "#3b2d25", direct: "#f2bf86", suncol: "#ff7e4e", ground: "#3b2d25" },
    theme: { primary: "#5a7a4a", secondary: "#1a2318", accent: "#e0a040" },
  },
  "eastern-plaguelands": {
    name: "Eastern Plaguelands", biome: "graveyard",
    sky: { top: "#723a33", mid: "#513419", haze: "#a95d2b", fog: "#9b511f", sun: "#b33600", ambient: "#99906c", direct: "#b33600", suncol: "#a95d2b", ground: "#99906c" },
    theme: { primary: "#8a9a4a", secondary: "#20240f", accent: "#e8e08a" },
  },
  "elwynn-forest": {
    name: "Elwynn Forest", biome: "forest",
    sky: { top: "#001f49", mid: "#3aa2cf", haze: "#afdae0", fog: "#4d788f", sun: "#ff8800", ambient: "#68829a", direct: "#ff8800", suncol: "#fff7de", ground: "#68829a" },
    theme: { primary: "#3f6b2a", secondary: "#1d2a16", accent: "#d9b25c" },
  },
  "felwood": {
    name: "Felwood", biome: "volcanic",
    sky: { top: "#000000", mid: "#187618", haze: "#115111", fog: "#193c19", sun: "#ffb154", ambient: "#577d38", direct: "#ffb154", suncol: "#c3eac3", ground: "#577d38" },
    theme: { primary: "#4a8a3a", secondary: "#1a2412", accent: "#9cff5a" },
  },
  "feralas": {
    name: "Feralas", biome: "jungle",
    sky: { top: "#f4fff8", mid: "#f2ffdf", haze: "#658856", fog: "#4f7453", sun: "#9ea79c", ambient: "#546f35", direct: "#9ea79c", suncol: "#e0f7ff", ground: "#546f35" },
    theme: { primary: "#3f7a3a", secondary: "#14261a", accent: "#e0b84a" },
  },
  "hillsbrad-foothills": {
    name: "Hillsbrad Foothills", biome: "plains",
    sky: { top: "#0c0c1d", mid: "#255d5a", haze: "#86a7a7", fog: "#234a48", sun: "#f9b97b", ambient: "#646464", direct: "#f9b97b", suncol: "#f5ffde", ground: "#646464" },
    theme: { primary: "#7a8a3c", secondary: "#1f2610", accent: "#e0c970" },
  },
  "loch-modan": {
    name: "Loch Modan", biome: "mountains",
    sky: { top: "#122560", mid: "#407aad", haze: "#c5d6d6", fog: "#4e6b94", sun: "#ffbf80", ambient: "#546a7c", direct: "#ffbf80", suncol: "#fff7de", ground: "#546a7c" },
    theme: { primary: "#4a7fa0", secondary: "#1c2c36", accent: "#e7cf8c" },
  },
  "moonglade": {
    name: "Moonglade", biome: "forest",
    sky: { top: "#ffffff", mid: "#00c3c3", haze: "#00e6ce", fog: "#00c9c9", sun: "#00ffff", ambient: "#006976", direct: "#00ffff", suncol: "#fff3e2", ground: "#006976" },
    theme: { primary: "#7a8fd8", secondary: "#141a33", accent: "#cfe0ff" },
  },
  "mulgore": {
    name: "Mulgore", biome: "plains",
    sky: { top: "#00357f", mid: "#40ccec", haze: "#9bafaf", fog: "#5494ad", sun: "#ffbf73", ambient: "#4a78a8", direct: "#ffbf73", suncol: "#fff3da", ground: "#4a78a8" },
    theme: { primary: "#c98a3d", secondary: "#4a3318", accent: "#9fd14a" },
  },
  "redridge-mountains": {
    name: "Redridge Mountains", biome: "mountains",
    sky: { top: "#001f49", mid: "#3aa2cf", haze: "#afdae0", fog: "#4d788f", sun: "#ff8800", ambient: "#68829a", direct: "#ff8800", suncol: "#fff7de", ground: "#68829a" },
    theme: { primary: "#a24a2a", secondary: "#2a1410", accent: "#e9a56a" },
  },
  "searing-gorge": {
    name: "Searing Gorge", biome: "volcanic",
    sky: { top: "#9e5882", mid: "#813519", haze: "#f65600", fog: "#592200", sun: "#98461d", ambient: "#565656", direct: "#98461d", suncol: "#a73800", ground: "#565656" },
    theme: { primary: "#b23a1a", secondary: "#2a0d08", accent: "#ffb347" },
  },
  "silithus": {
    name: "Silithus", biome: "cavern",
    sky: { top: "#ff5400", mid: "#ff7f3e", haze: "#6f332f", fog: "#6f332f", sun: "#ff8033", ambient: "#775272", direct: "#ff8033", suncol: "#ffe0c8", ground: "#775272" },
    theme: { primary: "#b8964a", secondary: "#2a1f33", accent: "#c58bff" },
  },
  "silverpine-forest": {
    name: "Silverpine Forest", biome: "graveyard",
    sky: { top: "#003849", mid: "#64a1ad", haze: "#8ca8ad", fog: "#4b6464", sun: "#ffa277", ambient: "#386574", direct: "#ffa277", suncol: "#ffe0c8", ground: "#386574" },
    theme: { primary: "#6a5a8a", secondary: "#1d1830", accent: "#c9a0dc" },
  },
  "stonetalon-mountains": {
    name: "Stonetalon Mountains", biome: "mountains",
    sky: { top: "#e6d49a", mid: "#b9af91", haze: "#877f6b", fog: "#7a7553", sun: "#393837", ambient: "#4e5669", direct: "#f5e8c4", suncol: "#fff4d0", ground: "#4e5669" },
    theme: { primary: "#8a7a6a", secondary: "#2b251f", accent: "#e0a040" },
  },
  "stranglethorn-vale": {
    name: "Stranglethorn Vale", biome: "jungle",
    sky: { top: "#001f49", mid: "#409898", haze: "#a6d6d6", fog: "#5a8c8c", sun: "#ff8b00", ambient: "#446b8e", direct: "#ff8b00", suncol: "#fff7de", ground: "#446b8e" },
    theme: { primary: "#2f7a3a", secondary: "#12281a", accent: "#e0b64a" },
  },
  "swamp-of-sorrows": {
    name: "Swamp of Sorrows", biome: "swamp",
    sky: { top: "#250c00", mid: "#814400", haze: "#8a5814", fog: "#7c4d11", sun: "#a66421", ambient: "#2d4600", direct: "#a66421", suncol: "#ffaa44", ground: "#2d4600" },
    theme: { primary: "#4a6a3a", secondary: "#14201a", accent: "#8fd36a" },
  },
  "tanaris": {
    name: "Tanaris", biome: "desert",
    sky: { top: "#000c12", mid: "#2f313a", haze: "#948082", fog: "#645557", sun: "#ffad7d", ambient: "#506d77", direct: "#ffad7d", suncol: "#fff2da", ground: "#506d77" },
    theme: { primary: "#c99a4a", secondary: "#3a2a14", accent: "#ffd978" },
  },
  "teldrassil": {
    name: "Teldrassil", biome: "forest",
    sky: { top: "#fb9fff", mid: "#8a5fac", haze: "#532b60", fog: "#532b60", sun: "#ffe0a9", ambient: "#7d4882", direct: "#ffe0a9", suncol: "#ffd6ff", ground: "#7d4882" },
    theme: { primary: "#6a3f9c", secondary: "#1b1230", accent: "#7fe0c2" },
  },
  "the-barrens": {
    name: "The Barrens", biome: "desert",
    sky: { top: "#42627b", mid: "#759595", haze: "#87654a", fog: "#825425", sun: "#ff9c56", ambient: "#6a5742", direct: "#ff9c56", suncol: "#fff4db", ground: "#6a5742" },
    theme: { primary: "#c8a24a", secondary: "#4a3a18", accent: "#e86a3c" },
  },
  "the-hinterlands": {
    name: "The Hinterlands", biome: "forest",
    sky: { top: "#005bb5", mid: "#529dff", haze: "#a6ccff", fog: "#699bcd", sun: "#c38820", ambient: "#3e607b", direct: "#c38820", suncol: "#fff0c0", ground: "#3e607b" },
    theme: { primary: "#5a7f3e", secondary: "#1f2b17", accent: "#d5c15a" },
  },
  "thousand-needles": {
    name: "Thousand Needles", biome: "desert",
    sky: { top: "#001f49", mid: "#40b4e5", haze: "#9cb6c5", fog: "#7e5660", sun: "#ffdead", ambient: "#4e3756", direct: "#ffdead", suncol: "#fff0d6", ground: "#4e3756" },
    theme: { primary: "#c98a5a", secondary: "#3a2418", accent: "#7fd0e0" },
  },
  "tirisfal-glades": {
    name: "Tirisfal Glades", biome: "graveyard",
    sky: { top: "#000000", mid: "#2a453f", haze: "#3d4b45", fog: "#231c25", sun: "#d0afca", ambient: "#503f4f", direct: "#d0afca", suncol: "#e5d4e2", ground: "#503f4f" },
    theme: { primary: "#5c6b4a", secondary: "#1a1f18", accent: "#a5d17a" },
  },
  "un-goro-crater": {
    name: "Un'Goro Crater", biome: "jungle",
    sky: { top: "#f4fff8", mid: "#f2ffdf", haze: "#7ebf88", fog: "#60a267", sun: "#8eb79c", ambient: "#546f35", direct: "#8eb79c", suncol: "#d6ffd6", ground: "#546f35" },
    theme: { primary: "#d97a2b", secondary: "#2f1a0f", accent: "#ffd24a" },
  },
  "western-plaguelands": {
    name: "Western Plaguelands", biome: "graveyard",
    sky: { top: "#353018", mid: "#4b4320", haze: "#8c6e32", fog: "#856225", sun: "#b33600", ambient: "#99906c", direct: "#b33600", suncol: "#c98b42", ground: "#99906c" },
    theme: { primary: "#6a7a3a", secondary: "#1c2210", accent: "#cfe36a" },
  },
  "westfall": {
    name: "Westfall", biome: "plains",
    sky: { top: "#003c49", mid: "#3c919e", haze: "#7dc0ca", fog: "#368796", sun: "#ff8600", ambient: "#427ba2", direct: "#ff8600", suncol: "#fff7de", ground: "#427ba2" },
    theme: { primary: "#c8a24a", secondary: "#3a2c14", accent: "#f2d98a" },
  },
  "wetlands": {
    name: "Wetlands", biome: "swamp",
    sky: { top: "#363849", mid: "#757186", haze: "#8b94a8", fog: "#6b7293", sun: "#ff9400", ambient: "#4b617c", direct: "#ff9400", suncol: "#ffe0b0", ground: "#4b617c" },
    theme: { primary: "#4c7a5a", secondary: "#15251c", accent: "#c6d98a" },
  },
  "winterspring": {
    name: "Winterspring", biome: "snow",
    sky: { top: "#fb9fff", mid: "#8a5fac", haze: "#7c3f91", fog: "#7c3f91", sun: "#afa2ce", ambient: "#7d4882", direct: "#afa2ce", suncol: "#e6e0ff", ground: "#7d4882" },
    theme: { primary: "#6fa8d8", secondary: "#15202e", accent: "#e8f6ff" },
  },
  title: {
    name: "Azeroth", biome: "graveyard",
    sky: { top: "#0c0e18", mid: "#2b3b52", haze: "#4d6b8a", fog: "#232d3d", sun: "#ffd56b", ambient: "#4d5b72", direct: "#ffd56b", suncol: "#fff0c4", ground: "#1a2230" },
    theme: { primary: "#ffd100", secondary: "#1a1205", accent: "#f6c94a" },
  },
  classSelect: {
    name: "Halls of Legend", biome: "graveyard",
    sky: { top: "#080910", mid: "#1c2232", haze: "#3b475e", fog: "#191e2b", sun: "#d4b06a", ambient: "#3a4456", direct: "#d4b06a", suncol: "#fae8c0", ground: "#141720" },
    theme: { primary: "#c9a24b", secondary: "#14100c", accent: "#ffd75e" },
  },
  map: {
    name: "War Map", biome: "plains",
    sky: { top: "#1a140a", mid: "#3a2a16", haze: "#5e4528", fog: "#2a1e10", sun: "#e8be66", ambient: "#4a3922", direct: "#e8be66", suncol: "#fff2d0", ground: "#22170c" },
    theme: { primary: "#d9b25c", secondary: "#241708", accent: "#f0d68a" },
  },
  default: {
    name: "Azeroth", biome: "forest",
    sky: { top: "#001f49", mid: "#3aa2cf", haze: "#afdae0", fog: "#4d788f", sun: "#ff8800", ambient: "#68829a", direct: "#ff8800", suncol: "#fff7de", ground: "#68829a" },
    theme: { primary: "#3f6b2a", secondary: "#1d2a16", accent: "#d9b25c" },
  },
};

export function getZoneVisuals(zoneId, overrides = {}) {
  const p = ZONE_PROFILES[zoneId] || ZONE_PROFILES.default;
  const biomeKey = p.biome || "forest";
  const biome = BIOMES[biomeKey] || BIOMES.forest;
  const theme = { ...p.theme, ...(overrides.tint ? (typeof overrides.tint === "string" ? { primary: overrides.tint } : overrides.tint) : {}) };

  // Lighting derived from the zone's sky atmosphere
  const sky = { ...p.sky };
  const hemiSky = sky.ambient || "#68829a";
  const hemiGround = sky.ground || "#3a4152";
  const sunColor = sky.direct || sky.sun || "#ffd7a0";
  const rimColor = sky.haze || sky.mid || "#78a4ff";
  const fogColor = sky.fog || sky.haze || "#4d788f";

  // Light intensities tuned for distinct mood
  let hemiIntensity = 1.15;
  let sunIntensity = 2.1;
  let rimIntensity = 1.4;
  if (biomeKey === "snow") { hemiIntensity = 1.35; sunIntensity = 2.3; rimIntensity = 1.6; }
  else if (biomeKey === "desert") { hemiIntensity = 1.10; sunIntensity = 2.5; rimIntensity = 1.3; }
  else if (biomeKey === "graveyard") { hemiIntensity = 0.90; sunIntensity = 1.7; rimIntensity = 1.8; }
  else if (biomeKey === "volcanic") { hemiIntensity = 0.85; sunIntensity = 1.9; rimIntensity = 1.9; }

  return {
    zoneId: p === ZONE_PROFILES.default && !ZONE_PROFILES[zoneId] ? "default" : zoneId,
    name: p.name,
    biome: biomeKey,
    biomeDef: biome,
    sky,
    theme,
    lighting: {
      hemiSky,
      hemiGround,
      hemiIntensity,
      sunColor,
      sunIntensity,
      rimColor,
      rimIntensity,
      fogColor,
      fogNear: 1400,
      fogFar: 3600,
    },
    terrain: {
      ...biome.terrain,
      ...(p.terrain || {}),
    },
  };
}
