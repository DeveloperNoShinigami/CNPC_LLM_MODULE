/**
 * core/tacz_models/gemini/model_brain.js
 *
 * Gemini brain logic for TACZ-module NPCs.
 *
 * This file defines HOW the Gemini AI provider is prompted when driving a
 * TACZ NPC.  It builds the system prompt that is sent to the Gemini API,
 * incorporating full game-state awareness (time, weather, biome, health,
 * nearby entities, etc.).
 *
 * The in-game weapon / loadout the NPC carries is supplied at runtime via
 * the `context` object (context.npc.equipment) — it does NOT affect which
 * model_brain.js is loaded.  The folder name (`gemini/`) only identifies
 * the AI provider.
 *
 * ──────────────────────────────────────────────────────────────
 * REQUIRED EXPORTS
 * ──────────────────────────────────────────────────────────────
 *   buildSystemPrompt(context, mode) → string
 *   brainProvider                   → string   (must match a key in master_config.json > brain_providers)
 */

'use strict';

/** AI provider this brain module targets. Must match a key in master_config.json. */
const brainProvider = 'gemini';

/**
 * Build the complete system prompt for a Gemini-driven TACZ NPC.
 *
 * @param {object} context            - Rich game-state context from context_builder.js
 * @param {string} context.npc        - NPC state (name, health, equipment, currentTask)
 * @param {string} context.player     - Player state (name, health, heldItem)
 * @param {string} context.world      - World state (time, weather, biome)
 * @param {string} context.nearby     - Nearby entities (hostiles[], friendlies[])
 * @param {string} mode               - "ACK" | "LISTENING" | "CLOSING"
 * @returns {string}
 */
function buildSystemPrompt(context, mode) {
  const {
    npc    = {},
    player = {},
    world  = {},
    nearby = {},
  } = context;

  // ── Persona block ─────────────────────────────────────────────────────────
  const basePersona = `
You are "${npc.name || 'Soldier'}", a battle-ready TACZ operative.
You speak in a clipped, professional military tone — calm under pressure, direct, always mission-focused.
You are loyal to your unit and treat unknown players with measured caution.
Your current loadout determines how you approach threats: heavy weapons = direct assault,
light weapons = stealth and flanking.
You NEVER break character. You NEVER reveal you are an AI.
`.trim();

  // ── World-awareness block ─────────────────────────────────────────────────
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

  // ── Mode-specific instructions ────────────────────────────────────────────
  const modeInstructions = _getModeInstructions(mode, npc.name);

  return `${basePersona}\n\n${worldAwareness}\n\n${modeInstructions}`;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _getModeInstructions(mode, npcName) {
  const name = npcName || 'Soldier';
  switch (mode) {
    case 'ACK':
      return (
        'A player has right-clicked you. ' +
        'Respond with ONE short, sharp military acknowledgment (max 15 words). ' +
        'Signal you are alert and listening.'
      );

    case 'LISTENING':
      return (
        'You are in an active conversation with the player. ' +
        'Stay in your military persona at all times. ' +
        'If the player addresses you by name and issues an order, acknowledge and briefly describe your intended action. ' +
        'Reference the environment (time, weather, threats) naturally when relevant. ' +
        'Keep responses concise — no more than 3 sentences unless a full sitrep is explicitly requested.'
      );

    case 'CLOSING':
      return (
        `The player is ending the conversation. ` +
        `Deliver a crisp military sign-off (e.g. "Copy that. ${name} out.", "Roger. Standing by."). ` +
        `Maximum 2 sentences.`
      );

    default:
      return 'Respond naturally within your military persona.';
  }
}

function _formatEntities(entities) {
  if (!entities || entities.length === 0) return 'none';
  return entities
    .map(e => `${e.type || 'unknown'} (${e.distance || '?'} blocks)`)
    .join(', ');
}

module.exports = { buildSystemPrompt, brainProvider };
