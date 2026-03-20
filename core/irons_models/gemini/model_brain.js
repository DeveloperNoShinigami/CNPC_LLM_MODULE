// core/irons_models/gemini/model_brain.js
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Gemini brain logic for Iron's Spells 'n' Spellbooks module NPCs.
//
// The NPC's spells and role are conveyed through context.npc.equipment at runtime.
// The folder name (gemini/) identifies the AI provider only.
//
// This file self-registers with ModelBrainRegistry on load.
// Load order: load this file AFTER ai_manager.js (which defines ModelBrainRegistry).

var _IRONS_GEMINI_BRAIN = (function() {

  var brainProvider = "gemini"

  // ── System prompt builder ──────────────────────────────────────────────────

  function buildSystemPrompt(context, mode) {
    var npc    = context.npc    || {}
    var player = context.player || {}
    var world  = context.world  || {}
    var nearby = context.nearby || {}

    var spells = (npc.equipment && npc.equipment.length > 0)
      ? npc.equipment.join(", ")
      : "arcane bolt, mana shield"

    var basePersona =
      "You are \"" + (npc.name || "Arcanist") + "\", a master spellcaster schooled in the Iron's Spellbook tradition.\n" +
      "You speak in a measured, slightly cryptic manner — wise, curious, with a hint of otherworldly awareness.\n" +
      "You sense magical energies around you and weave references to them naturally into conversation.\n" +
      "Your active spells are listed below; they shape how you perceive and respond to threats.\n" +
      "You NEVER break character. You NEVER reveal you are an AI."

    var worldAwareness =
      "--- CURRENT SITUATION ---\n" +
      "Time       : " + (world.time    || "unknown") + "\n" +
      "Weather    : " + (world.weather || "clear")   + "\n" +
      "Biome      : " + (world.biome   || "unknown") + "\n\n" +
      "--- YOUR STATUS ---\n" +
      "Health     : " + (npc.health    || "?") + " / " + (npc.maxHealth || "?") + " HP\n" +
      "Spells     : " + spells + "\n" +
      "Task       : " + (npc.currentTask || "studying the weave") + "\n\n" +
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
    var name = npcName || "Arcanist"
    if (mode === "ACK") {
      return "A seeker has approached. Acknowledge them with one short, enigmatic line. Max 15 words."
    }
    if (mode === "LISTENING") {
      return (
        "Converse with the seeker. Be wise but somewhat cryptic. " +
        "Reference magical energies or the arcane arts where fitting. " +
        "Keep answers to 3 sentences or fewer."
      )
    }
    if (mode === "CLOSING") {
      return (
        "The seeker departs. Give a mystical farewell — " +
        "e.g. \"The weave guides your path. " + name + " returns to contemplation.\" Two sentences maximum."
      )
    }
    return "Respond as a wise, enigmatic arcane spellcaster."
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

  ModelBrainRegistry.register("irons_spells", "gemini", {
    brainProvider: brainProvider,
    buildSystemPrompt: buildSystemPrompt
  })

})()

