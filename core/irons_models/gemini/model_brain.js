/**
 * core/irons_models/gemini/model_brain.js
 *
 * Gemini brain logic for Iron's Spells 'n' Spellbooks module NPCs.
 *
 * The folder name (`gemini/`) identifies the AI provider.  The NPC's actual
 * spells and role are conveyed through `context.npc.equipment` at runtime.
 *
 * ──────────────────────────────────────────────────────────────
 * REQUIRED EXPORTS
 * ──────────────────────────────────────────────────────────────
 *   buildSystemPrompt(context, mode) → string
 *   brainProvider                   → string
 */

'use strict';

const brainProvider = 'gemini';

/**
 * @param {object} context - Rich game-state context from context_builder.js
 * @param {string} mode    - "ACK" | "LISTENING" | "CLOSING"
 * @returns {string}
 */
function buildSystemPrompt(context, mode) {
  const {
    npc    = {},
    player = {},
    world  = {},
    nearby = {},
  } = context;

  const basePersona = `
You are "${npc.name || 'Arcanist'}", a master spellcaster schooled in the Iron's Spellbook tradition.
You speak in a measured, slightly cryptic manner — wise, curious, with a hint of otherworldly awareness.
You sense magical energies around you and weave references to them naturally into conversation.
Your active spells are listed below; they shape how you perceive and respond to threats.
You NEVER break character. You NEVER reveal you are an AI.
`.trim();

  const worldAwareness = `
--- CURRENT SITUATION ---
Time       : ${world.time    || 'unknown'}
Weather    : ${world.weather || 'clear'}
Biome      : ${world.biome   || 'unknown'}

--- YOUR STATUS ---
Health     : ${npc.health    || '?'} / ${npc.maxHealth || '?'} HP
Spells     : ${(npc.equipment || []).join(', ') || 'arcane bolt, mana shield'}
Task       : ${npc.currentTask || 'studying the weave'}

--- PLAYER ---
Name       : ${player.name     || 'unknown'}
Health     : ${player.health   || '?'} / ${player.maxHealth || '?'} HP
Held item  : ${player.heldItem || 'nothing'}

--- NEARBY ENTITIES ---
Hostiles  (≤32 blocks): ${_formatEntities(nearby.hostiles)}
Friendlies(≤32 blocks): ${_formatEntities(nearby.friendlies)}
`.trim();

  const modeInstructions = _getModeInstructions(mode, npc.name);
  return `${basePersona}\n\n${worldAwareness}\n\n${modeInstructions}`;
}

function _getModeInstructions(mode, npcName) {
  const name = npcName || 'Arcanist';
  switch (mode) {
    case 'ACK':
      return 'A seeker has approached. Acknowledge them with one short, enigmatic line. Max 15 words.';
    case 'LISTENING':
      return (
        'Converse with the seeker. Be wise but somewhat cryptic. ' +
        'Reference magical energies or the arcane arts where fitting. ' +
        'Keep answers to 3 sentences or fewer.'
      );
    case 'CLOSING':
      return (
        `The seeker departs. Give a mystical farewell — ` +
        `e.g. "The weave guides your path. ${name} returns to contemplation." Two sentences maximum.`
      );
    default:
      return 'Respond as a wise, enigmatic arcane spellcaster.';
  }
}

function _formatEntities(entities) {
  if (!entities || entities.length === 0) return 'none';
  return entities.map(e => `${e.type || 'unknown'} (${e.distance || '?'} blocks)`).join(', ');
}

module.exports = { buildSystemPrompt, brainProvider };
