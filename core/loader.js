// core/loader.js — MASTER SCRIPT LOADER
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// This is the SINGLE entry-point that loads the entire LLM_MODULE_SYSTEM.
// Role scripts (e.g. modules/tacz/roles/squad_leader.js) load this file
// first, and every dependency is chained here via load().
//
// A guard variable (LLM_SYSTEM_LOADED) prevents double-loading when multiple
// NPC role scripts are active in the same server session.
//
// ── PATH RESOLUTION ──────────────────────────────────────────────────────────
// All load() calls are anchored to the world/save directory returned by the
// CNPC NpcAPI.  This guarantees the correct path in both single-player and
// dedicated-server environments without any manual configuration:
//
//   var API = Java.type("noppes.npcs.api.NpcAPI")
//   load(API.getLevelDir() + "scripts/ecmascript/LLM_MODULE/core/loader.js")
//
// loader.js calls Java.type("noppes.npcs.api.NpcAPI").getLevelDir() itself
// to derive LLM_BASE_PATH when it has not already been set by the caller.
//
// ── USAGE ────────────────────────────────────────────────────────────────────
//   Role scripts do NOT need to set LLM_BASE_PATH manually.
//   They simply resolve the loader path the same way and call load():
//
//     var _API = Java.type("noppes.npcs.api.NpcAPI")
//     var LLM_BASE_PATH = _API.getLevelDir() + "scripts/ecmascript/LLM_MODULE"
//     load(LLM_BASE_PATH + "/core/loader.js")
//
//   After load() returns, all globals (AIManager, TACZConnector,
//   ContextBuilder, LoadoutManager, GoalsLoader, TalkManager, etc.)
//   are available in scope and the system is fully initialised.
//
// ── WHAT IS LOADED ───────────────────────────────────────────────────────────
//   core/
//     gemini_brain.js           — Google Gemini API wrapper
//     openrouter_brain.js       — OpenRouter API wrapper
//     brain_factory.js          — Provider instantiation
//     brain_registry.js         — Entity → brain mapping
//     ai_manager.js             — Master router + ModelBrainRegistry
//     tacz_models/gemini/model_brain.js
//     tacz_models/openrouter/model_brain.js
//     ef_models/gemini/model_brain.js
//     irons_models/gemini/model_brain.js
//   npc_talk/
//     session_store.js
//     talk_manager.js
//     interaction_logic.js
//   modules/tacz/utils/
//     context_builder.js
//     loadout_manager.js
//     goals_loader.js
//   modules/tacz/
//     tacz_connector.js
//
// After loading all files, loader.js calls:
//   AIManager.init(LLM_BASE_PATH + "/core/master_config.json")
//   TACZConnector.init(LLM_BASE_PATH + "/modules/tacz/tacz_config.json")

if (typeof LLM_SYSTEM_LOADED === "undefined") {

  // ── Guard: mark system as loaded immediately to block recursive re-entry ───
  var LLM_SYSTEM_LOADED = true

  // ── Derive LLM_BASE_PATH via NpcAPI if it was not set by the caller ────────
  // NpcAPI.getLevelDir() returns the world/save directory with a trailing
  // separator, so it works identically on servers and in single-player.
  if (typeof LLM_BASE_PATH === "undefined") {
    var _NPC_API  = Java.type("noppes.npcs.api.NpcAPI")
    LLM_BASE_PATH = _NPC_API.getLevelDir() + "scripts/ecmascript/LLM_MODULE"
  }

  var _p = LLM_BASE_PATH   // shorthand

  // ── 1. Brain provider wrappers ─────────────────────────────────────────────
  load(_p + "/core/gemini_brain.js")
  load(_p + "/core/openrouter_brain.js")

  // ── 2. Brain factory + registry ───────────────────────────────────────────
  load(_p + "/core/brain_factory.js")
  load(_p + "/core/brain_registry.js")

  // ── 3. Master AI Manager (also defines ModelBrainRegistry inline) ─────────
  load(_p + "/core/ai_manager.js")

  // ── 4. Model brains — self-register with ModelBrainRegistry on load ───────
  load(_p + "/core/tacz_models/gemini/model_brain.js")
  load(_p + "/core/tacz_models/openrouter/model_brain.js")
  load(_p + "/core/ef_models/gemini/model_brain.js")
  load(_p + "/core/irons_models/gemini/model_brain.js")

  // ── 5. NPC talk layer ─────────────────────────────────────────────────────
  load(_p + "/npc_talk/session_store.js")
  load(_p + "/npc_talk/talk_manager.js")
  load(_p + "/npc_talk/interaction_logic.js")

  // ── 6. TACZ utilities ─────────────────────────────────────────────────────
  load(_p + "/modules/tacz/utils/context_builder.js")
  load(_p + "/modules/tacz/utils/loadout_manager.js")
  load(_p + "/modules/tacz/utils/goals_loader.js")

  // ── 7. TACZ connector ─────────────────────────────────────────────────────
  load(_p + "/modules/tacz/tacz_connector.js")

  // ── 8. Initialise AIManager and TACZ connector with config paths ──────────
  AIManager.init(_p + "/core/master_config.json")
  TACZConnector.init(_p + "/modules/tacz/tacz_config.json")

  LLM_LOG("LLM_MODULE_SYSTEM fully loaded from: " + _p)
}
