// core/ai_manager.js — MASTER AI MANAGER
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
// Uses Java file I/O for config loading. No require() / module system.
//
// ── WHAT IT DOES ────────────────────────────────────────────────────────────
//   1. Reads master_config.json (via Java file I/O) on init().
//   2. Routes NPC interaction events from connectors to the correct model brain
//      looked up in ModelBrainRegistry (each model_brain.js self-registers).
//   3. Manages brain instantiation via BrainFactory and caches them by entityId.
//   4. Exposes an interact() method that any connector can call.
//   5. Enforces two-state conversation (IDLE ↔ LISTENING) via TalkManager.
//
// ── LOAD ORDER ──────────────────────────────────────────────────────────────
//   1. core/gemini_brain.js
//   2. core/openrouter_brain.js          (if using OpenRouter)
//   3. core/brain_factory.js
//   4. core/brain_registry.js
//   5. core/model_brain_registry.js      (see below — inline in this file)
//   6. core/[modname]_models/[provider]/model_brain.js  (each self-registers)
//   7. npc_talk/session_store.js
//   8. npc_talk/talk_manager.js
//   9. npc_talk/interaction_logic.js
//  10. modules/[mod]/[mod]_connector.js
//  11. core/ai_manager.js                (this file — call AIManager.init() last)
//
// ── PLUGGABLE ARCHITECTURE ──────────────────────────────────────────────────
//   Third-party developers add a new module by:
//     1. Creating modules/<modname>/<modname>_connector.js
//     2. Calling AIManager.registerModule(moduleId, connector) at startup.
//     3. Creating core/<modname>_models/<providerName>/model_brain.js and
//        calling ModelBrainRegistry.register(moduleId, providerName, brain)
//        at the bottom of that file.
//
// ── BRAIN ROUTING PATH ──────────────────────────────────────────────────────
//   connector.onNPCInteract(event)
//     → AIManager.interact(moduleId, entityId, providerName, context, playerMsg, callback)
//       → ModelBrainRegistry.get(moduleId, providerName).buildSystemPrompt(context, mode)
//       → BrainFactory.create(providerName, providerConfig).think(...)  [via Thread]
//       → callback(error, responseText)

// ── Inline ModelBrainRegistry ────────────────────────────────────────────────
// Holds references to each loaded model_brain module, keyed by "moduleId:providerName".
// Each model_brain.js file self-registers by calling:
//   ModelBrainRegistry.register("tacz", "gemini", { buildSystemPrompt: fn, brainProvider: "gemini" })

var ModelBrainRegistry = (function() {
  var _brains = {}
  return {
    register: function(moduleId, providerName, brain) {
      _brains[moduleId + ":" + providerName] = brain
    },
    get: function(moduleId, providerName) {
      return _brains[moduleId + ":" + providerName] || null
    }
  }
})()

// ── LLM_LOG helper ────────────────────────────────────────────────────────────
// Lightweight logger; replace body with your preferred CNPC output method.

function LLM_LOG(msg) {
  java.lang.System.out.println("[LLM_MODULE] " + msg)
}

// ── AIManager ─────────────────────────────────────────────────────────────────

var AIManager = (function() {

  var _config = null
  var _connectors = {}
  var _brainCache = {}    // entityId → brain instance

  // ── Config loader (Java file I/O) ──────────────────────────────────────────

  function _loadConfig(configPath) {
    var file = new java.io.File(configPath)
    if (!file.exists()) {
      throw new Error("AIManager: master_config.json not found at: " + configPath)
    }
    var reader = new java.io.BufferedReader(new java.io.FileReader(file))
    var sb = new java.lang.StringBuilder()
    var line
    while ((line = reader.readLine()) !== null) {
      sb.append(line).append("\n")
    }
    reader.close()
    return JSON.parse(sb.toString())
  }

  // ── Brain instance cache ───────────────────────────────────────────────────

  function _getBrainInstance(entityId, providerKey) {
    if (_brainCache[entityId]) {
      return _brainCache[entityId]
    }
    var providerConfig = _config.brain_providers[providerKey]
    if (!providerConfig) {
      throw new Error("AIManager: no brain_provider config for '" + providerKey + "'.")
    }
    var brain = BrainFactory.create(providerKey, providerConfig)
    _brainCache[entityId] = brain
    return brain
  }

  // ── Closing phrase check ───────────────────────────────────────────────────

  function _isClosingPhrase(msg) {
    if (!msg || typeof msg !== "string") return false
    var lower = msg.toLowerCase().trim()
    var phrases = _config.talk_settings.closing_phrases
    for (var i = 0; i < phrases.length; i++) {
      if (lower.indexOf(phrases[i].toLowerCase()) !== -1) return true
    }
    return false
  }

  // ── Response generation helpers ────────────────────────────────────────────

  function _generateAck(moduleId, entityId, providerName, context, callback) {
    var modelBrain = ModelBrainRegistry.get(moduleId, providerName)
    if (!modelBrain) {
      return callback("AIManager: no model brain for '" + moduleId + ":" + providerName + "'.", null)
    }
    var providerKey = modelBrain.brainProvider || _config.default_brain
    var brain = _getBrainInstance(entityId, providerKey)
    var systemPrompt = modelBrain.buildSystemPrompt(context, "ACK")
    var ackMsg = "Acknowledge my presence with one short military-style line. You are now listening."
    brain.think(systemPrompt, ackMsg, callback)
  }

  function _generateClosing(moduleId, entityId, providerName, context, playerMsg, callback) {
    var modelBrain = ModelBrainRegistry.get(moduleId, providerName)
    if (!modelBrain) {
      return callback("AIManager: no model brain for '" + moduleId + ":" + providerName + "'.", null)
    }
    var providerKey = modelBrain.brainProvider || _config.default_brain
    var brain = _getBrainInstance(entityId, providerKey)
    var systemPrompt = modelBrain.buildSystemPrompt(context, "CLOSING")
    brain.think(systemPrompt, playerMsg, callback)
  }

  function _generateResponse(moduleId, entityId, providerName, context, playerMsg, callback) {
    var modelBrain = ModelBrainRegistry.get(moduleId, providerName)
    if (!modelBrain) {
      return callback("AIManager: no model brain for '" + moduleId + ":" + providerName + "'.", null)
    }
    var providerKey = modelBrain.brainProvider || _config.default_brain
    var brain = _getBrainInstance(entityId, providerKey)
    var history = TalkManager.getHistory(entityId)
    var systemPrompt = modelBrain.buildSystemPrompt(context, "LISTENING")
    brain.thinkWithHistory(systemPrompt, history, playerMsg, function(err, text) {
      if (err) return callback(err, null)
      TalkManager.addTurn(entityId, "user", playerMsg)
      TalkManager.addTurn(entityId, "model", text)
      callback(null, text)
    })
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {

    // Initialise the AI Manager.
    // configPath: absolute path to core/master_config.json (use Java file separator).
    // Call once at server / script startup before handling any NPC events.
    init: function(configPath) {
      _config = _loadConfig(configPath)
      TalkManager.setIdleTimeout(_config.talk_settings.idle_timeout_ms)
      BrainFactory.init()
      LLM_LOG("LLM_MODULE_SYSTEM v" + _config.version + " initialised.")
    },

    // MAIN INTERACTION ENTRY POINT — called by a module connector on NPC event.
    //
    // moduleId    : Module that owns this NPC (e.g. "tacz", "epic_fight")
    // entityId    : Unique NPC entity identifier
    // providerName: AI provider key (e.g. "gemini", "openrouter")
    //               Determines which model brain is used for prompt building.
    // context     : Rich game-state object built by the connector's ContextBuilder
    // playerMsg   : The player's message (empty string on right-click / first contact)
    // callback    : function(errorMsg, responseText)
    interact: function(moduleId, entityId, providerName, context, playerMsg, callback) {
      if (!_config) {
        return callback("AIManager.init() has not been called.", null)
      }

      var talkState = TalkManager.getState(entityId)

      if (talkState === "IDLE") {
        TalkManager.transition(entityId, "LISTENING")
        _generateAck(moduleId, entityId, providerName, context, callback)
        return
      }

      if (_isClosingPhrase(playerMsg)) {
        TalkManager.transition(entityId, "IDLE")
        _generateClosing(moduleId, entityId, providerName, context, playerMsg, callback)
        return
      }

      _generateResponse(moduleId, entityId, providerName, context, playerMsg, callback)
    },

    // Register a custom module connector at runtime.
    // connector must implement: onNPCInteract(event, callback), onNPCRemoved(entityId)
    registerModule: function(moduleId, connector) {
      if (_connectors[moduleId]) {
        LLM_LOG("AIManager: overwriting connector for '" + moduleId + "'.")
      }
      _connectors[moduleId] = connector
      LLM_LOG("AIManager: module '" + moduleId + "' registered.")
    },

    // Retrieve a connector by module ID.
    getConnector: function(moduleId) {
      return _connectors[moduleId] || null
    },

    // Expose the loaded config (for connectors that need it).
    getConfig: function() {
      return _config
    },

    // Force-reset a conversation session (e.g. on NPC death).
    resetSession: function(entityId) {
      TalkManager.onNPCRemoved(entityId)
      delete _brainCache[entityId]
    },

    // Call periodically (every ~10 s) to evict timed-out sessions.
    tick: function() {
      return TalkManager.tick()
    }

  }

})()

