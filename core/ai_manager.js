/**
 * ai_manager.js — MASTER AI MANAGER
 *
 * Global entry point for the LLM_MODULE_SYSTEM. The AI Manager:
 *
 *  1. Reads `master_config.json` to determine enabled modules and brain providers.
 *  2. Dynamically loads each enabled module's connector and configuration.
 *  3. Routes NPC interaction events from connectors to the correct model brain
 *     found in `core/[modname]_models/[providerName]/model_brain.js`.
 *  4. Manages brain instantiation via BrainFactory and caches them in BrainRegistry.
 *  5. Exposes an `interact()` method that any connector can call.
 *
 * ──────────────────────────────────────────────────────────────
 * PLUGGABLE ARCHITECTURE
 * ──────────────────────────────────────────────────────────────
 * Third-party developers can add a new module by:
 *   1. Creating a folder under `modules/<modname>/`.
 *   2. Adding the module entry to `core/master_config.json`.
 *   3. The AI Manager will automatically pick it up on next start.
 *
 * ──────────────────────────────────────────────────────────────
 * BRAIN ROUTING PATH
 * ──────────────────────────────────────────────────────────────
 * The `[providerName]` directory under each `[modname]_models/` folder
 * identifies the AI brain provider (e.g. "gemini", "openrouter", "llama"),
 * NOT an in-game item or weapon model.  The NPC's actual weapon / loadout
 * is passed at runtime inside the `context` object.
 *
 *   connector reports → ai_manager.interact(moduleId, entityId, providerName, context)
 *       → loads core/[modname]_models/[providerName]/model_brain.js
 *       → model_brain builds system prompt using context (incl. loadout/weapons)
 *       → BrainFactory creates / retrieves AI provider brain
 *       → response returned to connector
 */

'use strict';

const path = require('path');
const fs = require('fs');

const BrainFactory = require('./brain_factory');
const BrainRegistry = require('./brain_registry');
const TalkManager = require('../npc_talk/talk_manager');

// ── Load global config ───────────────────────────────────────────────────────
const CONFIG_PATH = path.resolve(__dirname, 'master_config.json');
const masterConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

// ── Module connector cache ───────────────────────────────────────────────────
/** @type {Map<string, object>} moduleId → connector instance */
const _connectors = new Map();

// ── Brain instance cache (per entityId) ─────────────────────────────────────
/** @type {Map<string, object>} entityId → brain instance */
const _brainCache = new Map();

// ── Model brain module cache ─────────────────────────────────────────────────
/** @type {Map<string, object>} "moduleId:modelName" → model_brain module */
const _modelBrainCache = new Map();

// ────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve and load the model_brain module for a given module + AI provider name.
 *
 * Path convention: core/[modname]_models/[providerName]/model_brain.js
 *
 * The `providerName` folder identifies the AI brain provider (e.g. "gemini",
 * "openrouter", "llama"), NOT an in-game weapon or item model.  The NPC's
 * actual weapon / loadout is passed at runtime inside the context object.
 *
 * @param {string} moduleId      - e.g. "tacz", "epic_fight"
 * @param {string} providerName  - AI provider name, e.g. "gemini", "openrouter"
 * @returns {object}             - The model_brain module (must export buildSystemPrompt)
 */
function _loadModelBrain(moduleId, providerName) {
  const cacheKey = `${moduleId}:${providerName}`;
  if (_modelBrainCache.has(cacheKey)) {
    return _modelBrainCache.get(cacheKey);
  }

  const brainPath = path.resolve(
    __dirname,
    `${moduleId}_models`,
    providerName,
    'model_brain.js'
  );

  if (!fs.existsSync(brainPath)) {
    throw new Error(
      `AIManager: model brain not found at "${brainPath}". ` +
      `Create core/${moduleId}_models/${providerName}/model_brain.js to define the AI behaviour ` +
      `for the "${moduleId}" module using the "${providerName}" provider.`
    );
  }

  const brainModule = require(brainPath);
  _modelBrainCache.set(cacheKey, brainModule);
  return brainModule;
}

/**
 * Retrieve (or lazily create) a brain instance for an entity.
 *
 * @param {string} entityId    - NPC entity ID
 * @param {string} providerKey - Brain provider key (e.g. "gemini")
 * @returns {object}           - Brain instance with think() / thinkWithHistory()
 */
function _getBrainInstance(entityId, providerKey) {
  if (_brainCache.has(entityId)) {
    return _brainCache.get(entityId);
  }

  const providerConfig = masterConfig.brain_providers[providerKey];
  if (!providerConfig) {
    throw new Error(
      `AIManager: no brain provider config found for "${providerKey}".`
    );
  }

  const brain = BrainFactory.create(providerKey, providerConfig);
  _brainCache.set(entityId, brain);
  return brain;
}

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ────────────────────────────────────────────────────────────────────────────

const AIManager = {

  /**
   * Initialise the AI Manager.
   * Loads all enabled module connectors and registers them.
   * Call once at server / script startup.
   */
  init() {
    console.log('[AIManager] Initialising LLM_MODULE_SYSTEM v' + masterConfig.version);

    for (const [moduleId, moduleConf] of Object.entries(masterConfig.modules)) {
      if (!moduleConf.enabled) {
        console.log(`[AIManager] Module "${moduleId}" is disabled — skipping.`);
        continue;
      }

      try {
        const connectorPath = path.resolve(__dirname, '..', moduleConf.connector_path);
        const connector = require(connectorPath);

        // Give the connector a reference back to the manager so it can call interact()
        if (typeof connector.init === 'function') {
          connector.init(AIManager);
        }

        _connectors.set(moduleId, connector);
        console.log(`[AIManager] Module "${moduleId}" loaded successfully.`);
      } catch (err) {
        console.error(`[AIManager] Failed to load module "${moduleId}":`, err.message);
      }
    }

    console.log('[AIManager] Initialisation complete.');
  },

  /**
   * MAIN INTERACTION ENTRY POINT
   *
   * Called by a module connector when an NPC interaction event fires.
   *
   * @param {string} moduleId      - Module that owns this NPC (e.g. "tacz", "epic_fight")
   * @param {string} entityId      - Unique NPC entity identifier
   * @param {string} providerName  - AI provider to use for this NPC, e.g. "gemini" or "openrouter".
   *                                 Determines which core/[modname]_models/[providerName]/model_brain.js
   *                                 is loaded.  The NPC's in-game weapon/loadout is passed via context.
   * @param {object} context       - Rich game-state context object (see context_builder.js)
   * @param {string} playerMsg     - The player's message / action trigger
   * @returns {Promise<string>}    - The NPC's AI-generated response
   */
  async interact(moduleId, entityId, providerName, context, playerMsg) {
    // ── 1. Determine conversation state via TalkManager ─────────────────────
    const talkState = TalkManager.getState(entityId);

    if (talkState === 'IDLE') {
      // First contact — return acknowledgment and transition to LISTENING
      TalkManager.transition(entityId, 'LISTENING');
      const ackResponse = await this._generateAck(moduleId, entityId, providerName, context);
      return ackResponse;
    }

    // ── 2. Check if player is dismissing the NPC ────────────────────────────
    if (_isClosingPhrase(playerMsg)) {
      TalkManager.transition(entityId, 'IDLE');
      const closingResponse = await this._generateClosing(moduleId, entityId, providerName, context, playerMsg);
      return closingResponse;
    }

    // ── 3. Full LISTENING conversation turn ─────────────────────────────────
    return this._generateResponse(moduleId, entityId, providerName, context, playerMsg);
  },

  /**
   * Register a custom module connector at runtime.
   * Allows third-party modules to plug into the AI Manager without modifying master_config.json.
   *
   * @param {string} moduleId   - Unique module identifier
   * @param {object} connector  - Connector object; must implement init(manager) and handle events
   */
  registerModule(moduleId, connector) {
    if (_connectors.has(moduleId)) {
      console.warn(`[AIManager] Overwriting existing connector for module "${moduleId}".`);
    }
    if (typeof connector.init === 'function') {
      connector.init(AIManager);
    }
    _connectors.set(moduleId, connector);
    console.log(`[AIManager] External module "${moduleId}" registered.`);
  },

  /**
   * Retrieve the connector for a given module.
   *
   * @param {string} moduleId
   * @returns {object|null}
   */
  getConnector(moduleId) {
    return _connectors.get(moduleId) || null;
  },

  /**
   * Expose the master config (read-only snapshot).
   *
   * @returns {object}
   */
  getConfig() {
    return Object.freeze({ ...masterConfig });
  },

  // ── Private generation helpers ─────────────────────────────────────────────

  async _generateAck(moduleId, entityId, providerName, context) {
    const modelBrain = _loadModelBrain(moduleId, providerName);
    const providerKey = modelBrain.brainProvider || masterConfig.default_brain;
    const brain = _getBrainInstance(entityId, providerKey);

    const systemPrompt = modelBrain.buildSystemPrompt(context, 'ACK');
    const ackMsg = 'Acknowledge my presence with one short military-style line. You are now listening.';

    return brain.think(systemPrompt, ackMsg);
  },

  async _generateClosing(moduleId, entityId, providerName, context, playerMsg) {
    const modelBrain = _loadModelBrain(moduleId, providerName);
    const providerKey = modelBrain.brainProvider || masterConfig.default_brain;
    const brain = _getBrainInstance(entityId, providerKey);

    const systemPrompt = modelBrain.buildSystemPrompt(context, 'CLOSING');
    return brain.think(systemPrompt, playerMsg);
  },

  async _generateResponse(moduleId, entityId, providerName, context, playerMsg) {
    const modelBrain = _loadModelBrain(moduleId, providerName);
    const providerKey = modelBrain.brainProvider || masterConfig.default_brain;
    const brain = _getBrainInstance(entityId, providerKey);

    // Retrieve conversation history for multi-turn context
    const history = TalkManager.getHistory(entityId);
    const systemPrompt = modelBrain.buildSystemPrompt(context, 'LISTENING');

    const response = await brain.thinkWithHistory(systemPrompt, history, playerMsg);

    // Record turns in session history
    TalkManager.addTurn(entityId, 'user', playerMsg);
    TalkManager.addTurn(entityId, 'model', response);

    return response;
  },
};

// ────────────────────────────────────────────────────────────────────────────
// PRIVATE UTILITY
// ────────────────────────────────────────────────────────────────────────────

/**
 * Check if a player message matches a conversation-closing phrase.
 *
 * @param {string} msg
 * @returns {boolean}
 */
function _isClosingPhrase(msg) {
  if (!msg || typeof msg !== 'string') return false;
  const lower = msg.toLowerCase().trim();
  return masterConfig.talk_settings.closing_phrases.some(phrase =>
    lower.includes(phrase.toLowerCase())
  );
}

module.exports = AIManager;
