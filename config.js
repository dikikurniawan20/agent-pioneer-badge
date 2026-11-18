// === Agent Pioneer Badge — site config ===
// Fill BADGE_ADDRESS after the contract is deployed + verified.
// AGENT_ID_ADDRESS is the official Agent ID contract on chain 56.
window.BADGE_CONFIG = {
  CHAIN_ID: 56,
  CHAIN_NAME: "Agent ID network (chain 56)",
  AGENT_ID_ADDRESS: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f",
  BADGE_ADDRESS: "0xdf72e80ec7d3266d754050391508fba914168717", // Deployed 19 Nov 2026, tx 0xeb054b7e9b60fd0a6dc2ac6a67171c50920a8724b14b7825952e8826c6fa4f32
  // Public read-only RPC (no API key). Used only for the Wall of Agents.
  RPC_URL: "https://bsc.publicnode.com",
  // How many of the latest badges to show on the wall.
  WALL_LIMIT: 60
};
