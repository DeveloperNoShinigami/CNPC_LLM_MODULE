/**
 * npc_talk/talk_manager.js
 *
 * State machine for NPC two-state talk interaction: IDLE ↔ LISTENING.
 *
 * ─────────────────────────────────────────────────────────────
 * STATE MACHINE
 * ─────────────────────────────────────────────────────────────
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │                        IDLE                          │
 *   │  (Right-click triggers ACK response)                 │
 *   └──────────────────────┬──────────────────────────────┘
 *                          │  transition('LISTENING')
 *                          ▼
 *   ┌─────────────────────────────────────────────────────┐
 *   │                     LISTENING                        │
 *   │  (Full multi-turn conversation)                      │
 *   └──────────────────────┬──────────────────────────────┘
 *                          │  closing phrase OR idle timeout
 *                          ▼
 *                        IDLE
 *
 * ─────────────────────────────────────────────────────────────
 * IDLE TIMEOUT
 * ─────────────────────────────────────────────────────────────
 * Sessions that have been in LISTENING state for longer than the
 * configured `idle_timeout_ms` are automatically reset to IDLE.
 * Call `TalkManager.tick()` on a periodic interval (e.g. every 10 s)
 * to enforce the timeout.
 */

'use strict';

const SessionStore = require('./session_store');

let _idleTimeoutMs = 30_000; // Default; overridden by AIManager after config load

const TalkManager = {

  /**
   * Configure the idle timeout.  Called by AIManager.init() after reading master_config.
   *
   * @param {number} ms
   */
  setIdleTimeout(ms) {
    _idleTimeoutMs = ms;
  },

  /**
   * Get the current talk state for an entity.
   *
   * @param {string} entityId
   * @returns {'IDLE'|'LISTENING'}
   */
  getState(entityId) {
    return SessionStore.get(entityId).state;
  },

  /**
   * Transition an entity's talk state.
   * Resets conversation history when moving back to IDLE.
   *
   * @param {string} entityId
   * @param {'IDLE'|'LISTENING'} newState
   */
  transition(entityId, newState) {
    if (newState !== 'IDLE' && newState !== 'LISTENING') {
      throw new Error(`TalkManager: invalid state "${newState}". Must be "IDLE" or "LISTENING".`);
    }

    const current = SessionStore.get(entityId).state;
    if (current === newState) return; // No-op

    if (newState === 'IDLE') {
      // Clear history when conversation ends
      SessionStore.reset(entityId);
    } else {
      SessionStore.setState(entityId, newState);
    }
  },

  /**
   * Append a conversation turn to the entity's history.
   *
   * @param {string} entityId
   * @param {'user'|'model'} role
   * @param {string} text
   */
  addTurn(entityId, role, text) {
    SessionStore.addTurn(entityId, role, text);
  },

  /**
   * Retrieve the entity's conversation history (array of Gemini-compatible turns).
   *
   * @param {string} entityId
   * @returns {object[]}  [{role: string, parts: [{text: string}]}]
   */
  getHistory(entityId) {
    return SessionStore.getHistory(entityId);
  },

  /**
   * Called when an NPC is removed from the world (death, despawn, chunk unload).
   * Cleans up session data.
   *
   * @param {string} entityId
   */
  onNPCRemoved(entityId) {
    SessionStore.remove(entityId);
  },

  /**
   * Enforce idle timeouts across all active sessions.
   * Call this periodically (e.g. every 10 seconds via setInterval).
   *
   * @returns {string[]} - Array of entity IDs whose sessions timed out and were reset
   */
  tick() {
    return SessionStore.evictIdle(_idleTimeoutMs);
  },
};

module.exports = TalkManager;
