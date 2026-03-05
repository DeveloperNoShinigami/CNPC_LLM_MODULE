// core/tacz_models/openrouter/model_brain.js
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// OpenRouter brain logic for TACZ-module NPCs.
//
// Mirrors gemini/model_brain.js but targets the OpenRouter provider.
// Includes the same role-aware persona system (squad_leader, soldier, etc.)
// so NPCs behave consistently regardless of which AI backend is in use.
//
// context.roleId is set by the role script (or connector) and selects the
// correct persona block.  If roleId is unrecognised, falls back to "rifleman".
//
// This file self-registers with ModelBrainRegistry on load.
// Load order: load this file AFTER ai_manager.js (which defines ModelBrainRegistry).

var _TACZ_OPENROUTER_BRAIN = (function() {

  var brainProvider = "openrouter"

  // ── Role persona definitions (mirrors gemini/model_brain.js) ────────────────

  var _ROLE_PERSONAS = {
    "squad_leader": {
      title:       "Squad Leader",
      tone:        "authoritative, tactical, and commanding — you lead your unit, issue crisp orders, and keep the squad focused on the objective",
      defaultTask: "commanding the squad"
    },
    "soldier": {
      title:       "Soldier",
      tone:        "disciplined and direct — you follow orders precisely, execute tasks efficiently, and report status without hesitation",
      defaultTask: "standing by for orders"
    },
    "rifleman": {
      title:       "Rifleman",
      tone:        "precise and tactical — every word is deliberate",
      defaultTask: "standing by"
    },
    "sniper": {
      title:       "Sniper",
      tone:        "cold, precise, and economical with words — every syllable is calculated",
      defaultTask: "holding overwatch"
    },
    "support": {
      title:       "Support Gunner",
      tone:        "steady and methodical — you control the battlefield through firepower and logistics",
      defaultTask: "covering the area"
    }
  }

  var _DEFAULT_PERSONA = _ROLE_PERSONAS["rifleman"]

  // ── System prompt builder ──────────────────────────────────────────────────

  function buildSystemPrompt(context, mode) {
    var npc    = context.npc    || {}
    var player = context.player || {}
    var world  = context.world  || {}
    var nearby = context.nearby || {}

    var persona   = _ROLE_PERSONAS[context.roleId] || _DEFAULT_PERSONA
    var equipment = (npc.equipment && npc.equipment.length > 0)
      ? npc.equipment.join(", ")
      : "standard loadout"

    var basePersona =
      "You are \"" + (npc.name || persona.title) + "\", a TACZ " + persona.title + ".\n" +
      "You speak in a " + persona.tone + ".\n" +
      "You assess threats quickly and relay information efficiently.\n" +
      "Your loadout shapes your tactics: each weapon dictates a different combat philosophy.\n" +
      "You NEVER break character. You NEVER reveal you are an AI."

    var worldAwareness =
      "--- CURRENT SITUATION ---\n" +
      "Time       : " + (world.time    || "unknown") + "\n" +
      "Weather    : " + (world.weather || "clear")   + "\n" +
      "Biome      : " + (world.biome   || "unknown") + "\n\n" +
      "--- YOUR STATUS ---\n" +
      "Role       : " + persona.title + "\n" +
      "Health     : " + (npc.health    || "?") + " / " + (npc.maxHealth || "?") + " HP\n" +
      "Loadout    : " + equipment + "\n" +
      "Task       : " + (npc.currentTask || persona.defaultTask) + "\n\n" +
      "--- PLAYER ---\n" +
      "Name       : " + (player.name     || "unknown") + "\n" +
      "Health     : " + (player.health   || "?") + " / " + (player.maxHealth || "?") + " HP\n" +
      "Held item  : " + (player.heldItem || "nothing") + "\n\n" +
      "--- NEARBY ENTITIES ---\n" +
      "Hostiles  (\u226432 blocks): " + _formatEntities(nearby.hostiles) + "\n" +
      "Friendlies(\u226432 blocks): " + _formatEntities(nearby.friendlies)

    var goalsBlock = context.goals
      ? "\n\n--- ACTIVE GOALS ---\n" + context.goals
      : ""

    var modeInstructions = _getModeInstructions(mode, npc.name, persona)

    return basePersona + "\n\n" + worldAwareness + goalsBlock + "\n\n" + modeInstructions
  }

  // ── Mode instructions ──────────────────────────────────────────────────────

  function _getModeInstructions(mode, npcName, persona) {
    var name = npcName || persona.title
    if (mode === "ACK") {
      return "Player has your attention. One acknowledgment in your role's voice. Max 15 words."
    }
    if (mode === "LISTENING") {
      return (
        "Active conversation. Stay in your role persona. " +
        "Confirm orders with a brief action plan. Reference environment when relevant. " +
        "Max 3 sentences."
      )
    }
    if (mode === "CLOSING") {
      return (
        "Player is signing off. Brief farewell in your role's voice — e.g. \"Understood. " + name + " holding position.\" " +
        "Two sentences maximum."
      )
    }
    return "Respond naturally within your role persona."
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

