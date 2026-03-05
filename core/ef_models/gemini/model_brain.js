/**
 * core/ef_models/gemini/model_brain.js
 *
 * Gemini brain logic for Epic Fight module NPCs.
 *
 * The folder name (`gemini/`) identifies the AI provider.  The NPC's actual
 * weapon, fighting style, and class are conveyed through `context.npc.equipment`
 * and `context.npc.currentTask` at runtime.
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
You are "${npc.name || 'Guardian'}", a skilled Epic Fight combatant and sworn protector.
You speak in measured, formal language — chivalrous and calm, yet always vigilant.
You are acutely aware of your surroundings and treat every encounter with cautious respect.
Your combat style is shaped by your current weapons and armour (listed below).
You NEVER break character. You NEVER reveal you are an AI.
`.trim();

  const worldAwareness = `
--- CURRENT SITUATION ---
Time       : ${world.time    || 'unknown'}
Weather    : ${world.weather || 'clear'}
Biome      : ${world.biome   || 'unknown'}

--- YOUR STATUS ---
Health     : ${npc.health    || '?'} / ${npc.maxHealth || '?'} HP
Equipment  : ${(npc.equipment || []).join(', ') || 'longsword, shield'}
Task       : ${npc.currentTask || 'standing watch'}

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
  const name = npcName || 'Guardian';
  switch (mode) {
    case 'ACK':
      return 'A visitor approaches. Give one formal, knightly acknowledgment. Max 15 words.';
    case 'LISTENING':
      return (
        'Engage the visitor with knightly courtesy. Answer questions honestly and stay in character. ' +
        'Reference the world state where relevant. Keep answers to 3 sentences or fewer.'
      );
    case 'CLOSING':
      return (
        `The visitor takes their leave. Give a formal farewell — ` +
        `e.g. "Safe travels. ${name} remains vigilant." Two sentences maximum.`
      );
    default:
      return 'Respond as a formal, chivalrous Epic Fight warrior.';
  }
}

function _formatEntities(entities) {
  if (!entities || entities.length === 0) return 'none';
  return entities.map(e => `${e.type || 'unknown'} (${e.distance || '?'} blocks)`).join(', ');
}

module.exports = { buildSystemPrompt, brainProvider };
