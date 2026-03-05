// core/brain_factory.js — Handles instantiation of AI brain providers.
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// BrainFactory reads the master_config brain provider config and returns
// the correct brain instance (GeminiBrain, OpenRouterBrain, etc.).
//
// Load Order (required before this file):
//   1. core/gemini_brain.js
//   2. core/openrouter_brain.js   (optional, if using OpenRouter)
//   3. core/brain_factory.js      (this file)
//
// Adding a new provider:
//   1. Create a brain wrapper (e.g. core/my_brain.js) exposing a create(config) function.
//   2. Load it before brain_factory.js.
//   3. Call BrainFactory.register("my_provider", MyBrain) after loading.
//   4. Add provider config to master_config.json under brain_providers.

var BrainFactory = (function() {

  // Built-in providers — populated once init() is called.
  var _providers = {}

  function _registerBuiltins() {
    if (typeof GeminiBrain !== "undefined") {
      _providers["gemini"] = GeminiBrain
    }
    if (typeof OpenRouterBrain !== "undefined") {
      _providers["openrouter"] = OpenRouterBrain
    }
  }

  return {

    // Call once after all brain files have been loaded.
    init: function() {
      _registerBuiltins()
    },

    // Create and return a brain instance for the given provider key.
    // config is the provider block from master_config.json.
    create: function(providerKey, config) {
      var provider = _providers[providerKey]
      if (!provider) {
        throw new Error(
          "BrainFactory: unknown provider '" + providerKey + "'. " +
          "Registered: " + Object.keys(_providers).join(", ")
        )
      }
      return provider.create(config)
    },

    // Register a custom brain provider at runtime.
    // provider must expose a create(config) function.
    register: function(key, provider) {
      if (_providers[key]) {
        LLM_LOG("BrainFactory: overwriting existing provider '" + key + "'.")
      }
      _providers[key] = provider
    },

    // List all currently registered provider keys.
    list: function() {
      return Object.keys(_providers)
    }

  }

})()

