// core/tacz_models/openrouter/model_brain.js
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// OpenRouter brain logic for TACZ-module NPCs.
//
// Mirrors the structure of gemini/model_brain.js but targets the OpenRouter
// provider, which can front many open-source and commercial models via a single
// API endpoint.  The persona and game-state awareness blocks are identical;
// only brainProvider differs.
//
// Ensure master_config.json has an "openrouter" entry under brain_providers
// and that core/openrouter_brain.js is loaded before this file.
//
// This file self-registers with ModelBrainRegistry on load.
// Load order: load this file AFTER ai_manager.js (which defines ModelBrainRegistry).

var _TACZ_OPENROUTER_BRAIN = (function() {

  var brainProvider = "openrouter"

  // ── System prompt builder ──────────────────────────────────────────────────

  function buildSystemPrompt(context, mode) {
    var npc    = context.npc    || {}
    var player = context.player || {}
    var world  = context.world  || {}
    var nearby = context.nearby || {}

    var equipment = (npc.equipment && npc.equipment.length > 0)
      ? npc.equipment.join(", ")
      : "standard loadout"

    var basePersona =
      "You are \"" + (npc.name || "Operative") + "\", a hardened TACZ field operative.\n" +
      "You speak in a precise, tactical tone — every word is deliberate.\n" +
      "You assess threats quickly and relay information efficiently.\n" +
      "Your loadout shapes your tactics: each weapon dictates a different combat philosophy.\n" +
      "You NEVER break character. You NEVER reveal you are an AI."

    var worldAwareness =
      "--- CURRENT SITUATION ---\n" +
      "Time       : " + (world.time    || "unknown") + "\n" +
      "Weather    : " + (world.weather || "clear")   + "\n" +
      "Biome      : " + (world.biome   || "unknown") + "\n\n" +
      "--- YOUR STATUS ---\n" +
      "Health     : " + (npc.health    || "?") + " / " + (npc.maxHealth || "?") + " HP\n" +
      "Loadout    : " + equipment + "\n" +
      "Task       : " + (npc.currentTask || "standing by") + "\n\n" +
      "--- PLAYER ---\n" +
      "Name       : " + (player.name     || "unknown") + "\n" +
      "Health     : " + (player.health   || "?") + " / " + (player.maxHealth || "?") + " HP\n" +
      "Held item  : " + (player.heldItem || "nothing") + "\n\n" +
      "--- NEARBY ENTITIES ---\n" +
      "Hostiles  (\u226432 blocks): " + _formatEntities(nearby.hostiles) + "\n" +
      "Friendlies(\u226432 blocks): " + _formatEntities(nearby.friendlies)

    var modeInstructions = _getModeInstructions(mode, npc.name)

    return basePersona + "\n\n" + worldAwareness + "\n\n" + modeInstructions
  }

  // ── Mode instructions ──────────────────────────────────────────────────────

  function _getModeInstructions(mode, npcName) {
    var name = npcName || "Operative"
    if (mode === "ACK") {
      return "Player has your attention. One sharp, tactical acknowledgment. Max 15 words."
    }
    if (mode === "LISTENING") {
      return (
        "Active conversation. Stay tactical and in-character. " +
        "Confirm orders with a brief action plan. Reference environment when relevant. " +
        "Max 3 sentences."
      )
    }
    if (mode === "CLOSING") {
      return (
        "Player is signing off. Brief tactical farewell — e.g. \"Understood. " + name + " holding position.\" " +
        "Two sentences maximum."
      )
    }
    return "Respond naturally within your tactical operative persona."
  }

  // ── Entity formatter ───────────────────────────────────────────────────────

  function _formatEntities(entities) {
    if (!entities || entities.length === 0) return "none"
    var parts = []
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i]
      parts.push((e.type || "unknown") + " (" + (e.distance || "?") + " blocks)")
    }
    return parts.join(", ")
  }

  // ── Self-register with ModelBrainRegistry ──────────────────────────────────

  ModelBrainRegistry.register("tacz", "openrouter", {
    brainProvider: brainProvider,
    buildSystemPrompt: buildSystemPrompt
  })

})()

