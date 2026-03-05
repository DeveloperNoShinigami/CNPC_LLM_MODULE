/**
 * npc_talk/interaction_logic.js
 *
 * Parsing logic for player speech and orders directed at NPCs.
 *
 * Responsibilities:
 *   - Detect whether a player message is an ORDER vs general conversation.
 *   - Extract the target NPC name and command from an order phrase.
 *   - Detect closing / dismissal phrases.
 *   - Normalise raw player input before forwarding to the AI.
 *
 * ─────────────────────────────────────────────────────────────
 * ORDER SYNTAX
 * ─────────────────────────────────────────────────────────────
 *   "[NPCName], <natural language command>"
 *   e.g. "Alpha, fall back to the checkpoint."
 *        "Vadim, cover the east corridor."
 *
 * ─────────────────────────────────────────────────────────────
 * CLOSING SYNTAX
 * ─────────────────────────────────────────────────────────────
 *   Any message containing a phrase from master_config > talk_settings > closing_phrases
 *   e.g. "that is all, Alpha", "dismissed", "at ease"
 */

'use strict';

// ── Order detection ───────────────────────────────────────────────────────────

/**
 * Determine whether a player message is an order addressed to a specific NPC.
 * Orders follow the pattern: "<name>, <command>" or "<name>: <command>".
 *
 * @param {string} message   - Raw player input
 * @param {string} npcName   - The name of the NPC being addressed
 * @returns {boolean}
 */
function isOrder(message, npcName) {
  if (!message || !npcName) return false;
  const pattern = new RegExp(`^\\s*${_escapeRegex(npcName)}\\s*[,:]\\s*`, 'i');
  return pattern.test(message);
}

/**
 * Extract the command part from an order message.
 * Returns the full message unchanged if it is not an order.
 *
 * @param {string} message  - Raw player input
 * @param {string} npcName  - The name of the NPC
 * @returns {string}        - The command text only
 */
function extractCommand(message, npcName) {
  if (!isOrder(message, npcName)) return message;
  const pattern = new RegExp(`^\\s*${_escapeRegex(npcName)}\\s*[,:]\\s*`, 'i');
  return message.replace(pattern, '').trim();
}

// ── Closing phrase detection ──────────────────────────────────────────────────

/**
 * Detect whether a player message contains a conversation-closing phrase.
 *
 * @param {string}   message        - Raw player input
 * @param {string[]} closingPhrases - Array of phrases from master_config
 * @returns {boolean}
 */
function isClosingPhrase(message, closingPhrases = []) {
  if (!message || typeof message !== 'string') return false;
  const lower = message.toLowerCase().trim();
  return closingPhrases.some(phrase => lower.includes(phrase.toLowerCase()));
}

// ── Input normalisation ───────────────────────────────────────────────────────

/**
 * Sanitise and normalise raw player input before sending to the AI.
 *
 * - Trims whitespace.
 * - Collapses multiple spaces into one.
 * - Truncates to `maxLength` characters (default 500).
 *
 * @param {string} message
 * @param {number} [maxLength=500]
 * @returns {string}
 */
function normalise(message, maxLength = 500) {
  if (!message || typeof message !== 'string') return '';
  return message
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Parse a raw player message and return a structured intent object.
 *
 * @param {string}   message        - Raw player input
 * @param {string}   npcName        - Name of the NPC receiving the message
 * @param {string[]} closingPhrases - Array from master_config
 * @returns {{type: 'ORDER'|'CLOSING'|'CONVERSATION', text: string, rawMessage: string}}
 */
function parse(message, npcName, closingPhrases = []) {
  const clean = normalise(message);

  if (isClosingPhrase(clean, closingPhrases)) {
    return { type: 'CLOSING', text: clean, rawMessage: message };
  }

  if (isOrder(clean, npcName)) {
    return { type: 'ORDER', text: extractCommand(clean, npcName), rawMessage: message };
  }

  return { type: 'CONVERSATION', text: clean, rawMessage: message };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  isOrder,
  extractCommand,
  isClosingPhrase,
  normalise,
  parse,
};
