/**
 * brain_factory.js — Handles instantiation of AI brain providers.
 *
 * The BrainFactory reads the global master_config and returns the correct
 * brain class instance (Gemini, Llama, etc.) based on the provider key.
 *
 * Adding a new provider:
 *   1. Create a wrapper class in core/ (e.g. `llama_brain.js`)
 *   2. Register it in the PROVIDERS map below.
 *   3. Add provider config to master_config.json under `brain_providers`.
 */

'use strict';

const GeminiBrain = require('./gemini_brain');

/**
 * Map of provider keys → constructor functions.
 * Third-party developers can call BrainFactory.register() to add their own.
 */
const PROVIDERS = {
  gemini: GeminiBrain,
};

class BrainFactory {
  /**
   * Create and return a brain instance for the requested provider.
   *
   * @param {string} providerKey  - The provider key (e.g. "gemini", "llama")
   * @param {object} config       - The provider config block from master_config.json
   * @returns {object}            - Instantiated brain that exposes `think()` and `thinkWithHistory()`
   */
  static create(providerKey, config) {
    const BrainClass = PROVIDERS[providerKey];
    if (!BrainClass) {
      throw new Error(
        `BrainFactory: unknown provider "${providerKey}". ` +
        `Registered providers: ${Object.keys(PROVIDERS).join(', ')}`
      );
    }
    return new BrainClass(config);
  }

  /**
   * Register a custom brain provider at runtime.
   * This is the extension point for third-party module developers.
   *
   * @param {string}   key         - Unique provider key (e.g. "my_local_llm")
   * @param {Function} BrainClass  - Class constructor; must implement think() and thinkWithHistory()
   */
  static register(key, BrainClass) {
    if (PROVIDERS[key]) {
      console.warn(`BrainFactory: overwriting existing provider "${key}".`);
    }
    PROVIDERS[key] = BrainClass;
  }

  /**
   * List all currently registered provider keys.
   *
   * @returns {string[]}
   */
  static list() {
    return Object.keys(PROVIDERS);
  }
}

module.exports = BrainFactory;
