// core/tacz_models/gemini/model_brain.js
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Gemini brain logic for TACZ-module NPCs.
//
// Defines HOW the Gemini AI provider is prompted when driving a TACZ NPC.
// Builds the system prompt sent to the Gemini API, incorporating full
// game-state awareness (time, weather, biome, health, nearby entities, etc.).
//
// The NPC's in-game weapon / loadout is conveyed via context.npc.equipment.
// The folder name (gemini/) identifies the AI provider only.
//
// This file self-registers with ModelBrainRegistry on load.
// Load order: load this file AFTER ai_manager.js (which defines ModelBrainRegistry).

var _TACZ_GEMINI_BRAIN = (function() {

  var brainProvider = "gemini"

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
      "You are \"" + (npc.name || "Soldier") + "\", a battle-ready TACZ operative.\n" +
      "You speak in a clipped, professional military tone — calm under pressure, direct, always mission-focused.\n" +
      "You are loyal to your unit and treat unknown players with measured caution.\n" +
      "Your current loadout determines how you approach threats: heavy weapons = direct assault, light weapons = stealth and flanking.\n" +
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
    var name = npcName || "Soldier"
    if (mode === "ACK") {
      return (
        "A player has right-clicked you. " +
        "Respond with ONE short, sharp military acknowledgment (max 15 words). " +
        "Signal you are alert and listening."
      )
    }
    if (mode === "LISTENING") {
      return (
        "You are in an active conversation with the player. " +
        "Stay in your military persona at all times. " +
        "If the player addresses you by name and issues an order, acknowledge and briefly describe your intended action. " +
        "Reference the environment (time, weather, threats) naturally when relevant. " +
        "Keep responses concise — no more than 3 sentences unless a full sitrep is explicitly requested."
      )
    }
    if (mode === "CLOSING") {
      return (
        "The player is ending the conversation. " +
        "Deliver a crisp military sign-off (e.g. \"Copy that. " + name + " out.\", \"Roger. Standing by.\"). " +
        "Maximum 2 sentences."
      )
    }
    return "Respond naturally within your military persona."
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

  ModelBrainRegistry.register("tacz", "gemini", {
    brainProvider: brainProvider,
    buildSystemPrompt: buildSystemPrompt
  })

})()

