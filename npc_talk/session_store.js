/**
 * npc_talk/session_store.js
 *
 * Persistence layer for active NPC conversation sessions.
 *
 * Each session stores:
 *   - The current talk state ("IDLE" | "LISTENING")
 *   - Conversation history (array of {role, parts} turns)
 *   - Timestamps for idle-timeout enforcement
 *
 * This module is an in-memory store.  For persistence across server restarts,
 * replace the Map with a file-based or database-backed store.
 */

'use strict';

/**
 * @typedef {object} Session
 * @property {string}   entityId    - NPC entity ID
 * @property {string}   state       - "IDLE" | "LISTENING"
 * @property {object[]} history     - [{role: "user"|"model", parts: [{text: string}]}]
 * @property {number}   lastActive  - Unix timestamp (ms) of last interaction
 */

/** @type {Map<string, Session>} */
const _sessions = new Map();

const SessionStore = {

  /**
   * Get the session for an entity, creating a fresh IDLE session if none exists.
   *
   * @param {string} entityId
   * @returns {Session}
   */
  get(entityId) {
    if (!_sessions.has(entityId)) {
      _sessions.set(entityId, _createSession(entityId));
    }
    return _sessions.get(entityId);
  },

  /**
   * Check if an entity has an active session.
   *
   * @param {string} entityId
   * @returns {boolean}
   */
  has(entityId) {
    return _sessions.has(entityId);
  },

  /**
   * Update the talk state for an entity's session.
   *
   * @param {string} entityId
   * @param {string} state - "IDLE" | "LISTENING"
   */
  setState(entityId, state) {
    const session = SessionStore.get(entityId);
    session.state = state;
    session.lastActive = Date.now();
  },

  /**
   * Append a conversation turn to the entity's session history.
   *
   * @param {string} entityId
   * @param {string} role    - "user" | "model"
   * @param {string} text    - Message content
   */
  addTurn(entityId, role, text) {
    const session = SessionStore.get(entityId);
    session.history.push({ role, parts: [{ text }] });
    session.lastActive = Date.now();
  },

  /**
   * Retrieve the conversation history for an entity.
   *
   * @param {string} entityId
   * @returns {object[]}
   */
  getHistory(entityId) {
    return SessionStore.get(entityId).history;
  },

  /**
   * Reset a session back to IDLE and clear its conversation history.
   *
   * @param {string} entityId
   */
  reset(entityId) {
    _sessions.set(entityId, _createSession(entityId));
  },

  /**
   * Remove a session entirely (e.g. on NPC death / chunk unload).
   *
   * @param {string} entityId
   */
  remove(entityId) {
    _sessions.delete(entityId);
  },

  /**
   * Evict all sessions that have been idle for longer than `timeoutMs`.
   *
   * @param {number} timeoutMs - Idle threshold in milliseconds
   * @returns {string[]}       - Array of evicted entity IDs
   */
  evictIdle(timeoutMs) {
    const now = Date.now();
    const evicted = [];
    for (const [entityId, session] of _sessions.entries()) {
      if (now - session.lastActive > timeoutMs) {
        _sessions.delete(entityId);
        evicted.push(entityId);
      }
    }
    return evicted;
  },

  /**
   * Return a snapshot of all active sessions (useful for debugging).
   *
   * @returns {Session[]}
   */
  dump() {
    return Array.from(_sessions.values());
  },
};

// ── Private helpers ───────────────────────────────────────────────────────────

function _createSession(entityId) {
  return {
    entityId,
    state: 'IDLE',
    history: [],
    lastActive: Date.now(),
  };
}

module.exports = SessionStore;
