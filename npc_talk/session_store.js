// npc_talk/session_store.js — In-memory persistence for NPC conversation sessions.
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Each session stores:
//   state      : "IDLE" | "LISTENING"
//   history    : array of {role, parts:[{text}]} turns (Gemini-compatible format)
//   lastActive : timestamp (ms) for idle-timeout enforcement
//
// For persistence across server restarts, swap _sessions for a Java-backed
// file or database store using the same get/set/reset/remove interface.

var SessionStore = (function() {

  var _sessions = {}

  function _createSession(entityId) {
    return {
      entityId:   entityId,
      state:      "IDLE",
      history:    [],
      lastActive: _now()
    }
  }

  function _now() {
    return java.lang.System.currentTimeMillis()
  }

  return {

    // Get the session for an entity; creates a fresh IDLE session if none exists.
    get: function(entityId) {
      if (!_sessions[entityId]) {
        _sessions[entityId] = _createSession(entityId)
      }
      return _sessions[entityId]
    },

    // Check if an entity has an active session.
    has: function(entityId) {
      return !!_sessions[entityId]
    },

    // Update the talk state for an entity's session.
    setState: function(entityId, state) {
      var session = SessionStore.get(entityId)
      session.state = state
      session.lastActive = _now()
    },

    // Append a conversation turn to the session history.
    // role: "user" | "model"
    addTurn: function(entityId, role, text) {
      var session = SessionStore.get(entityId)
      session.history.push({"role": role, "parts": [{"text": text}]})
      session.lastActive = _now()
    },

    // Retrieve the conversation history for an entity.
    getHistory: function(entityId) {
      return SessionStore.get(entityId).history
    },

    // Reset a session back to IDLE and clear its conversation history.
    reset: function(entityId) {
      _sessions[entityId] = _createSession(entityId)
    },

    // Remove a session entirely (e.g. on NPC death / chunk unload).
    remove: function(entityId) {
      delete _sessions[entityId]
    },

    // Evict all sessions that have been idle for longer than timeoutMs.
    // Returns an array of evicted entity IDs.
    evictIdle: function(timeoutMs) {
      var now = _now()
      var evicted = []
      for (var id in _sessions) {
        if ((now - _sessions[id].lastActive) > timeoutMs) {
          delete _sessions[id]
          evicted.push(id)
        }
      }
      return evicted
    },

    // Return a snapshot of all active sessions (for debugging).
    dump: function() {
      var results = []
      for (var id in _sessions) {
        results.push(_sessions[id])
      }
      return results
    }

  }

})()

