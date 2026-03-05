/**
 * brain_registry.js — Internal registry mapping entity/NPC IDs to specific brain roles.
 *
 * The BrainRegistry acts as an in-memory lookup table so the AI Manager can quickly
 * resolve which brain instance and role is bound to a given NPC entity.
 *
 * Structure of a registry entry:
 * {
 *   entityId  : string   — Unique NPC entity identifier
 *   moduleId  : string   — Which module owns this NPC (e.g. "tacz", "epic_fight")
 *   modelName : string   — The model/archetype name (e.g. "m4a1", "sword_fighter")
 *   brainRole : string   — Role string from the module config (e.g. "rifleman", "mage")
 *   brainRef  : object   — Live reference to the brain instance (set after first load)
 * }
 */

'use strict';

class BrainRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this._registry = new Map();
  }

  /**
   * Register an NPC entity with its module, model, and role assignment.
   *
   * @param {string} entityId   - Unique NPC entity ID
   * @param {string} moduleId   - Module that owns this NPC
   * @param {string} modelName  - Model/archetype for this NPC
   * @param {string} brainRole  - Role assigned to this NPC
   */
  register(entityId, moduleId, modelName, brainRole) {
    this._registry.set(entityId, {
      entityId,
      moduleId,
      modelName,
      brainRole,
      brainRef: null,
    });
  }

  /**
   * Attach a live brain instance to an already-registered entity.
   *
   * @param {string} entityId - Unique NPC entity ID
   * @param {object} brainRef - The instantiated brain object
   */
  attachBrain(entityId, brainRef) {
    const entry = this._registry.get(entityId);
    if (!entry) {
      throw new Error(`BrainRegistry: entity "${entityId}" is not registered.`);
    }
    entry.brainRef = brainRef;
  }

  /**
   * Retrieve the full registry entry for an entity.
   *
   * @param {string} entityId
   * @returns {object|null}
   */
  get(entityId) {
    return this._registry.get(entityId) || null;
  }

  /**
   * Check whether an entity is already registered.
   *
   * @param {string} entityId
   * @returns {boolean}
   */
  has(entityId) {
    return this._registry.has(entityId);
  }

  /**
   * Remove an entity from the registry (e.g. on NPC death / chunk unload).
   *
   * @param {string} entityId
   */
  unregister(entityId) {
    this._registry.delete(entityId);
  }

  /**
   * Return all registered entries for a given module.
   *
   * @param {string} moduleId
   * @returns {object[]}
   */
  getByModule(moduleId) {
    const results = [];
    for (const entry of this._registry.values()) {
      if (entry.moduleId === moduleId) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Return a snapshot of all registry entries (useful for debugging).
   *
   * @returns {object[]}
   */
  dump() {
    return Array.from(this._registry.values());
  }

  /** Clear the entire registry. */
  clear() {
    this._registry.clear();
  }
}

module.exports = new BrainRegistry();
