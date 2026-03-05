/**
 * modules/tacz/tacz_connector.js
 *
 * TACZ Module Connector — Bridge between TACZ NPCs and the Core AI Manager.
 *
 * This connector:
 *   1. Receives NPC interaction events from the TACZ / CNPC mod layer.
 *   2. Resolves the NPC's role and AI provider from tacz_config.json.
 *   3. Builds a rich game-state context via ContextBuilder.
 *   4. Enriches context with loadout data from LoadoutManager.
 *   5. Forwards the interaction to AIManager.interact() with the correct
 *      providerName so the master manager loads
 *      core/tacz_models/[providerName]/model_brain.js.
 *   6. Returns the AI-generated response back to the caller.
 *
 * ──────────────────────────────────────────────────────────────
 * CONNECTOR CONTRACT
 * ──────────────────────────────────────────────────────────────
 * Every connector MUST export:
 *   init(manager)           — Called by AIManager on startup; receives manager ref.
 *   onNPCInteract(event)    — Main entry point for NPC right-click / talk events.
 *   onNPCRemoved(entityId)  — Called when an NPC leaves the world.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const ContextBuilder  = require('./utils/context_builder');
const LoadoutManager  = require('./utils/loadout_manager');
const GoalsLoader     = require('./utils/goals_loader');

// ── Load TACZ config ──────────────────────────────────────────────────────────
const CONFIG_PATH = path.resolve(__dirname, 'tacz_config.json');
const taczConfig  = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

/** Reference to the AIManager; injected via init(). */
let _manager = null;

// ── Connector object ──────────────────────────────────────────────────────────

const TACZConnector = {

  /**
   * Initialise the connector.
   * Called automatically by AIManager.init() when this module is enabled.
   *
   * @param {object} manager - The AIManager instance
   */
  init(manager) {
    _manager = manager;
    console.log('[TACZConnector] Initialised and linked to AIManager.');
  },

  /**
   * Handle an NPC interaction event (right-click or chat message directed at NPC).
   *
   * @param {object} event
   * @param {string} event.entityId    - Unique NPC entity ID
   * @param {string} event.npcName     - Display name of the NPC
   * @param {string} event.playerMsg   - Player's message (empty string on right-click)
   * @param {object} event.npcRawData  - Raw NPC data from CNPC API
   * @param {object} event.playerData  - Raw player data
   * @param {object} event.worldData   - Raw world/environment data
   * @param {object} event.nearbyData  - Raw nearby-entity data
   * @returns {Promise<string>}        - AI-generated NPC response
   */
  async onNPCInteract(event) {
    if (!_manager) {
      throw new Error('[TACZConnector] onNPCInteract called before init().');
    }

    const {
      entityId,
      npcName,
      playerMsg = '',
      npcRawData  = {},
      playerData  = {},
      worldData   = {},
      nearbyData  = {},
    } = event;

    // ── 1. Resolve role and provider ────────────────────────────────────────
    const assignment = _resolveAssignment(entityId, npcName);
    const providerName = assignment.brain_provider || taczConfig.default_brain_provider || 'gemini';

    // ── 2. Enrich NPC raw data with loadout ─────────────────────────────────
    const enrichedNPCData = {
      ...npcRawData,
      name:      npcRawData.name      || npcName,
      equipment: LoadoutManager.toEquipmentArray(entityId).length > 0
        ? LoadoutManager.toEquipmentArray(entityId)
        : npcRawData.equipment,
    };

    // ── 3. Build game-state context ─────────────────────────────────────────
    const context = ContextBuilder.build({
      npcData:    enrichedNPCData,
      playerData,
      worldData,
      nearbyData,
    });

    // Attach role goals to context for optional use by model_brain
    context.goals = GoalsLoader.formatForPrompt(assignment.role);

    // ── 4. Forward to AIManager ─────────────────────────────────────────────
    const response = await _manager.interact(
      'tacz',
      entityId,
      providerName,
      context,
      playerMsg
    );

    return response;
  },

  /**
   * Handle an NPC being removed from the world (death, despawn, chunk unload).
   * Cleans up any session or loadout data associated with the entity.
   *
   * @param {string} entityId
   */
  onNPCRemoved(entityId) {
    LoadoutManager.remove(entityId);
    if (_manager) {
      const TalkManager = require('../../npc_talk/talk_manager');
      TalkManager.onNPCRemoved(entityId);
    }
  },
};

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Resolve the role assignment for an NPC entity.
 * Falls back to "rifleman" if the entity is not explicitly mapped.
 *
 * @param {string} entityId
 * @param {string} npcName
 * @returns {{ role: string, brain_provider: string }}
 */
function _resolveAssignment(entityId, npcName) {
  const assignments = taczConfig.npc_assignments || {};

  // Direct entity ID lookup
  if (assignments[entityId]) {
    const a = assignments[entityId];
    const roleConfig = taczConfig.roles?.[a.role] || {};
    return {
      role:           a.role || 'rifleman',
      brain_provider: roleConfig.brain_provider || taczConfig.default_brain_provider || 'gemini',
    };
  }

  // Fall back to default role
  const defaultRole = 'rifleman';
  const defaultRoleConfig = taczConfig.roles?.[defaultRole] || {};
  return {
    role:           defaultRole,
    brain_provider: defaultRoleConfig.brain_provider || taczConfig.default_brain_provider || 'gemini',
  };
}

module.exports = TACZConnector;
