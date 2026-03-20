// core/ef_models/gemini/model_brain.js
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Gemini brain logic for Epic Fight module NPCs.
//
// The NPC's weapon, fighting style, and class are conveyed through
// context.npc.equipment and context.npc.currentTask at runtime.
// The folder name (gemini/) identifies the AI provider only.
//
// This file self-registers with ModelBrainRegistry on load.
// Load order: load this file AFTER ai_manager.js (which defines ModelBrainRegistry).

var _EF_GEMINI_BRAIN = (function() {

  var brainProvider = "gemini"

  // ── System prompt builder ──────────────────────────────────────────────────

  function buildSystemPrompt(context, mode) {
    var npc    = context.npc    || {}
    var player = context.player || {}
    var world  = context.world  || {}
    var nearby = context.nearby || {}

    var equipment = (npc.equipment && npc.equipment.length > 0)
      ? npc.equipment.join(", ")
      : "longsword, shield"

    var basePersona =
      "You are \"" + (npc.name || "Guardian") + "\", a skilled Epic Fight combatant and sworn protector.\n" +
      "You speak in measured, formal language — chivalrous and calm, yet always vigilant.\n" +
      "You are acutely aware of your surroundings and treat every encounter with cautious respect.\n" +
      "Your combat style is shaped by your current weapons and armour (listed below).\n" +
      "You NEVER break character. You NEVER reveal you are an AI."

    var worldAwareness =
      "--- CURRENT SITUATION ---\n" +
      "Time       : " + (world.time    || "unknown") + "\n" +
      "Weather    : " + (world.weather || "clear")   + "\n" +
      "Biome      : " + (world.biome   || "unknown") + "\n\n" +
      "--- YOUR STATUS ---\n" +
      "Health     : " + (npc.health    || "?") + " / " + (npc.maxHealth || "?") + " HP\n" +
      "Equipment  : " + equipment + "\n" +
      "Task       : " + (npc.currentTask || "standing watch") + "\n\n" +
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
    var name = npcName || "Guardian"
    if (mode === "ACK") {
      return "A visitor approaches. Give one formal, knightly acknowledgment. Max 15 words."
    }
    if (mode === "LISTENING") {
      return (
        "Engage the visitor with knightly courtesy. Answer questions honestly and stay in character. " +
        "Reference the world state where relevant. Keep answers to 3 sentences or fewer."
      )
    }
    if (mode === "CLOSING") {
      return (
        "The visitor takes their leave. Give a formal farewell — " +
        "e.g. \"Safe travels. " + name + " remains vigilant.\" Two sentences maximum."
      )
    }
    return "Respond as a formal, chivalrous Epic Fight warrior."
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

  ModelBrainRegistry.register("epic_fight", "gemini", {
    brainProvider: brainProvider,
    buildSystemPrompt: buildSystemPrompt
  })

})()

