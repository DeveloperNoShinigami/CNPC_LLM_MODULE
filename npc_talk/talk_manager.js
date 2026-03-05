// npc_talk/talk_manager.js — Two-state talk interaction state machine.
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// States:   IDLE  ←→  LISTENING
//
//  IDLE      — Right-click triggers one-line ACK response, then → LISTENING.
//  LISTENING — Full multi-turn conversation. Returns to IDLE on closing phrase
//              or when the idle timeout fires (call TalkManager.tick() periodically).
//
// Depends on: npc_talk/session_store.js (must be loaded first)

var TalkManager = (function() {

  var _idleTimeoutMs = 30000

  return {

    // Configure the idle timeout (called by AIManager.init() after reading config).
    setIdleTimeout: function(ms) {
      _idleTimeoutMs = ms
    },

    // Get the current talk state for an entity.
    // Returns "IDLE" or "LISTENING".
    getState: function(entityId) {
      return SessionStore.get(entityId).state
    },

    // Transition an entity's talk state.
    // Moving back to IDLE clears conversation history.
    transition: function(entityId, newState) {
      if (newState !== "IDLE" && newState !== "LISTENING") {
        throw new Error("TalkManager: invalid state '" + newState + "'. Must be IDLE or LISTENING.")
      }
      var current = SessionStore.get(entityId).state
      if (current === newState) return
      if (newState === "IDLE") {
        SessionStore.reset(entityId)
      } else {
        SessionStore.setState(entityId, newState)
      }
    },

    // Append a conversation turn to the entity's history.
    // role: "user" | "model"
    addTurn: function(entityId, role, text) {
      SessionStore.addTurn(entityId, role, text)
    },

    // Retrieve the entity's conversation history.
    // Returns an array of {role, parts:[{text}]} objects (Gemini-compatible).
    getHistory: function(entityId) {
      return SessionStore.getHistory(entityId)
    },

    // Called when an NPC is removed from the world (death, despawn, chunk unload).
    onNPCRemoved: function(entityId) {
      SessionStore.remove(entityId)
    },

    // Enforce idle timeouts across all active sessions.
    // Call this periodically (e.g. every 10 seconds via an NPC timer script).
    // Returns an array of entity IDs whose sessions timed out and were reset.
    tick: function() {
      return SessionStore.evictIdle(_idleTimeoutMs)
    }

  }

})()

