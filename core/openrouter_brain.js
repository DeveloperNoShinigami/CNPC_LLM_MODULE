// core/openrouter_brain.js — Wrapper for the OpenRouter API
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
// Uses Java HTTP for API calls and java.lang.Thread for async execution.
//
// OpenRouter proxies many models (GPT-4o, Claude, Mistral, Llama, etc.)
// through a single OpenAI-compatible endpoint.
//
// SETUP:
//   Set your OpenRouter API key in core/master_config.json under
//   brain_providers.openrouter.api_key, then pick a model string
//   from https://openrouter.ai/models (e.g. "openai/gpt-4o-mini").
//
// USAGE:
//   Load this file before brain_factory.js.
//   OpenRouterBrain.create(config) returns a brain instance with:
//     brain.think(systemPrompt, userMessage, callback)
//     brain.thinkWithHistory(systemPrompt, history, userMessage, callback)
//   Callbacks receive (errorMsg, responseText).

var OpenRouterBrain = (function() {

  var ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
  var REFERER   = "https://github.com/DeveloperNoShinigami/CNPC_LLM_MODULE"

  // ── HTTP helper ─────────────────────────────────────────────────────────────

  function _httpPost(urlString, jsonBody, apiKey) {
    var urlObj = new java.net.URL(urlString)
    var conn = urlObj.openConnection()
    conn.setRequestMethod("POST")
    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
    conn.setRequestProperty("Authorization", "Bearer " + apiKey)
    conn.setRequestProperty("HTTP-Referer", REFERER)
    conn.setRequestProperty("X-Title", "CNPC_LLM_MODULE")
    conn.setDoOutput(true)
    conn.setConnectTimeout(15000)
    conn.setReadTimeout(30000)

    var os = conn.getOutputStream()
    var bytes = (new java.lang.String(jsonBody)).getBytes("UTF-8")
    os.write(bytes)
    os.flush()
    os.close()

    var responseCode = conn.getResponseCode()
    var is = (responseCode >= 200 && responseCode < 300)
      ? conn.getInputStream()
      : conn.getErrorStream()

    var reader = new java.io.BufferedReader(new java.io.InputStreamReader(is, "UTF-8"))
    var sb = new java.lang.StringBuilder()
    var line
    while ((line = reader.readLine()) !== null) {
      sb.append(line)
    }
    reader.close()
    conn.disconnect()

    if (responseCode < 200 || responseCode >= 300) {
      throw new Error("OpenRouter HTTP " + responseCode + ": " + sb.toString())
    }
    return sb.toString()
  }

  // ── Request builder ─────────────────────────────────────────────────────────
  // Converts Gemini-format history {role, parts:[{text}]} to OpenAI message format.

  function _buildRequestBody(modelName, systemPrompt, history, userMessage, temperature, maxTokens) {
    var messages = [{"role": "system", "content": systemPrompt}]
    for (var i = 0; i < history.length; i++) {
      var turn = history[i]
      var role = (turn.role === "model") ? "assistant" : turn.role
      messages.push({"role": role, "content": turn.parts[0].text})
    }
    messages.push({"role": "user", "content": "[Player]: " + userMessage})
    return JSON.stringify({
      "model": modelName,
      "messages": messages,
      "temperature": temperature,
      "max_tokens": maxTokens
    })
  }

  // ── Brain instance constructor ───────────────────────────────────────────────

  function OpenRouterBrainInstance(config) {
    this.apiKey = config.api_key || ""
    this.modelName = config.model || "openai/gpt-4o-mini"
    this.temperature = (config.temperature !== undefined) ? config.temperature : 0.85
    this.maxTokens = config.max_tokens || 512
  }

  // ── think(systemPrompt, userMessage, callback) ───────────────────────────────

  OpenRouterBrainInstance.prototype.think = function(systemPrompt, userMessage, callback) {
    var self = this
    var thread = new java.lang.Thread(new java.lang.Runnable({
      run: function() {
        try {
          var body = _buildRequestBody(
            self.modelName, systemPrompt, [], userMessage, self.temperature, self.maxTokens
          )
          var raw = _httpPost(ENDPOINT, body, self.apiKey)
          var parsed = JSON.parse(raw)
          var text = parsed.choices[0].message.content
          callback(null, text.trim())
        } catch (e) {
          callback(String(e), null)
        }
      }
    }))
    thread.setDaemon(true)
    thread.start()
  }

  // ── thinkWithHistory(systemPrompt, history, userMessage, callback) ───────────

  OpenRouterBrainInstance.prototype.thinkWithHistory = function(systemPrompt, history, userMessage, callback) {
    var self = this
    var thread = new java.lang.Thread(new java.lang.Runnable({
      run: function() {
        try {
          var body = _buildRequestBody(
            self.modelName, systemPrompt, history, userMessage, self.temperature, self.maxTokens
          )
          var raw = _httpPost(ENDPOINT, body, self.apiKey)
          var parsed = JSON.parse(raw)
          var text = parsed.choices[0].message.content
          callback(null, text.trim())
        } catch (e) {
          callback(String(e), null)
        }
      }
    }))
    thread.setDaemon(true)
    thread.start()
  }

  // ── Public factory ───────────────────────────────────────────────────────────

  return {
    create: function(config) {
      if (!config.api_key) {
        throw new Error("OpenRouterBrain: missing api_key in config.")
      }
      return new OpenRouterBrainInstance(config)
    }
  }

})()
