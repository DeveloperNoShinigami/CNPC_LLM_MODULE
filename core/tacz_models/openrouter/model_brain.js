/**
 * core/tacz_models/openrouter/model_brain.js
 *
 * OpenRouter brain logic for TACZ-module NPCs.
 *
 * Mirrors the structure of `gemini/model_brain.js` but targets the OpenRouter
 * provider (which can front many open-source and commercial models via a single
 * API endpoint).  The persona and game-state awareness blocks are identical; only
 * `brainProvider` differs, instructing BrainFactory to instantiate an OpenRouter
 * brain instead of a Gemini one.
 *
 * ──────────────────────────────────────────────────────────────
 * REQUIRED EXPORTS
 * ──────────────────────────────────────────────────────────────
 *   buildSystemPrompt(context, mode) → string
 *   brainProvider                   → string
 *
 * NOTE: Add an "openrouter" entry to master_config.json > brain_providers
 * and create core/openrouter_brain.js (or equivalent) before enabling this.
 */

'use strict';

/** AI provider key — must match a key in master_config.json > brain_providers. */
const brainProvider = 'openrouter';

/**
 * Build the complete system prompt for an OpenRouter-driven TACZ NPC.
 *
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
You are "${npc.name || 'Operative'}", a hardened TACZ field operative.
You speak in a precise, tactical tone — every word is deliberate.
You assess threats quickly and relay information efficiently.
Your loadout shapes your tactics: each weapon dictates a different combat philosophy.
You NEVER break character. You NEVER reveal you are an AI.
`.trim();

  const worldAwareness = `
--- CURRENT SITUATION ---
Time       : ${world.time    || 'unknown'}
Weather    : ${world.weather || 'clear'}
Biome      : ${world.biome   || 'unknown'}

--- YOUR STATUS ---
Health     : ${npc.health    || '?'} / ${npc.maxHealth || '?'} HP
Loadout    : ${(npc.equipment || []).join(', ') || 'standard loadout'}
Task       : ${npc.currentTask || 'standing by'}

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
  const name = npcName || 'Operative';
  switch (mode) {
    case 'ACK':
      return (
        'Player has your attention. One sharp, tactical acknowledgment. Max 15 words.'
      );
    case 'LISTENING':
      return (
        'Active conversation. Stay tactical and in-character. ' +
        'Confirm orders with a brief action plan. Reference environment when relevant. ' +
        'Max 3 sentences.'
      );
    case 'CLOSING':
      return (
        `Player is signing off. Brief tactical farewell — e.g. "Understood. ${name} holding position." ` +
        `Two sentences maximum.`
      );
    default:
      return 'Respond naturally within your tactical operative persona.';
  }
}

function _formatEntities(entities) {
  if (!entities || entities.length === 0) return 'none';
  return entities
    .map(e => `${e.type || 'unknown'} (${e.distance || '?'} blocks)`)
    .join(', ');
}

module.exports = { buildSystemPrompt, brainProvider };
