/**
 * modules/epic_fight/epic_fight_connector.js
 *
 * Epic Fight Module Connector — SHELL IMPLEMENTATION
 *
 * This is a minimal shell connector for the Epic Fight mod integration.
 * It follows the same connector contract as tacz_connector.js and can be
 * expanded by third-party developers to add full Epic Fight NPC support.
 *
 * ──────────────────────────────────────────────────────────────
 * TO FULLY IMPLEMENT THIS MODULE:
 * ──────────────────────────────────────────────────────────────
 *  1. Fill in the `onNPCInteract` event handler with Epic Fight / CNPC API calls.
 *  2. Add a `utils/` subfolder with context_builder, loadout_manager, etc.
 *  3. Create `core/ef_models/[providerName]/model_brain.js` for each AI provider
 *     you want to support (a Gemini example already exists).
 *  4. Set `"enabled": true` for the `epic_fight` module in `core/master_config.json`.
 *
 * ──────────────────────────────────────────────────────────────
 * CONNECTOR CONTRACT
 * ──────────────────────────────────────────────────────────────
 * Every connector MUST export:
 *   init(manager)           — Receives AIManager reference on startup.
 *   onNPCInteract(event)    — Entry point for NPC interaction events.
 *   onNPCRemoved(entityId)  — Cleanup when NPC leaves the world.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const CONFIG_PATH    = path.resolve(__dirname, 'epic_fight_config.json');
const epicFightConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

let _manager = null;

const EpicFightConnector = {

  /**
   * Initialise the connector.
   *
   * @param {object} manager - AIManager instance
   */
  init(manager) {
    _manager = manager;
    console.log('[EpicFightConnector] Shell initialised. Implement onNPCInteract() to enable full functionality.');
  },

  /**
   * Handle an NPC interaction event.
   *
   * TODO: Replace the stub below with real Epic Fight / CNPC API integration.
   *
   * @param {object} event
   * @param {string} event.entityId
   * @param {string} event.npcName
   * @param {string} event.playerMsg
   * @param {object} [event.npcRawData]
   * @param {object} [event.playerData]
   * @param {object} [event.worldData]
   * @param {object} [event.nearbyData]
   * @returns {Promise<string>}
   */
  async onNPCInteract(event) {
    if (!_manager) {
      throw new Error('[EpicFightConnector] onNPCInteract called before init().');
    }

    const {
      entityId,
      npcName   = 'Guardian',
      playerMsg = '',
      npcRawData  = {},
      playerData  = {},
      worldData   = {},
      nearbyData  = {},
    } = event;

    const providerName = _resolveProvider(entityId);

    // Build a minimal context (replace with full ContextBuilder when implementing)
    const context = {
      npc: {
        name:        npcRawData.name     || npcName,
        health:      npcRawData.health   ?? 20,
        maxHealth:   npcRawData.maxHealth ?? 20,
        equipment:   npcRawData.equipment || [],
        currentTask: npcRawData.currentTask || 'standing watch',
      },
      player: {
        name:      playerData.name     || 'Player',
        health:    playerData.health   ?? 20,
        maxHealth: playerData.maxHealth ?? 20,
        heldItem:  playerData.heldItem || 'nothing',
      },
      world: {
        time:    worldData.time    || 'unknown',
        weather: worldData.weather || 'clear',
        biome:   worldData.biome   || 'unknown',
      },
      nearby: {
        hostiles:   (nearbyData.hostiles   || []),
        friendlies: (nearbyData.friendlies || []),
      },
    };

    return _manager.interact('epic_fight', entityId, providerName, context, playerMsg);
  },

  /**
   * Clean up when an NPC leaves the world.
   *
   * @param {string} entityId
   */
  onNPCRemoved(entityId) {
    if (_manager) {
      const TalkManager = require('../../npc_talk/talk_manager');
      TalkManager.onNPCRemoved(entityId);
    }
  },
};

function _resolveProvider(entityId) {
  const assignments = epicFightConfig.npc_assignments || {};
  if (assignments[entityId]) {
    const role = assignments[entityId].role || 'warrior';
    return epicFightConfig.roles?.[role]?.brain_provider || epicFightConfig.default_brain_provider || 'gemini';
  }
  return epicFightConfig.default_brain_provider || 'gemini';
}

module.exports = EpicFightConnector;
