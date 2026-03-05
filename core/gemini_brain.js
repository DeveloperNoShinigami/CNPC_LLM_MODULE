/**
 * gemini_brain.js — Module-agnostic wrapper for the Google Gemini API.
 *
 * This class wraps the Gemini generative AI SDK and exposes a single
 * `think(systemPrompt, userMessage)` interface that any module's model_brain
 * can call without knowing which underlying AI provider is being used.
 *
 * Environment variable required:
 *   GEMINI_API_KEY — Your Google AI Studio API key.
 *
 * Dependency:
 *   npm install @google/generative-ai
 */

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiBrain {
  /**
   * @param {object} config
   * @param {string} config.api_key_env      - Name of the env var holding the API key
   * @param {string} [config.model]          - Gemini model name (default: gemini-1.5-flash)
   * @param {number} [config.temperature]    - Sampling temperature (default: 0.85)
   * @param {number} [config.max_output_tokens] - Max tokens per response (default: 512)
   */
  constructor(config = {}) {
    const apiKey = process.env[config.api_key_env || 'GEMINI_API_KEY'];
    if (!apiKey) {
      throw new Error(
        `GeminiBrain: missing API key. Set the "${config.api_key_env || 'GEMINI_API_KEY'}" environment variable.`
      );
    }

    this._modelName = config.model || 'gemini-1.5-flash';
    this._generationConfig = {
      temperature: config.temperature !== undefined ? config.temperature : 0.85,
      maxOutputTokens: config.max_output_tokens || 512,
    };

    this._client = new GoogleGenerativeAI(apiKey);
    this._model = this._client.getGenerativeModel({ model: this._modelName });
  }

  /**
   * Send a prompt to Gemini and return the text response.
   *
   * @param {string} systemPrompt  - Role / persona instructions for the NPC
   * @param {string} userMessage   - The player's latest message or game-state query
   * @returns {Promise<string>}    - The AI's response text
   */
  async think(systemPrompt, userMessage) {
    const fullPrompt = `${systemPrompt}\n\n[Player]: ${userMessage}`;

    const result = await this._model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: this._generationConfig,
    });

    const response = result.response;
    return response.text().trim();
  }

  /**
   * Conduct a multi-turn conversation with Gemini using chat history.
   *
   * @param {string}   systemPrompt - Persona instructions
   * @param {object[]} history      - Array of {role, parts} objects from previous turns
   * @param {string}   userMessage  - Latest player message
   * @returns {Promise<string>}
   */
  async thinkWithHistory(systemPrompt, history, userMessage) {
    const chat = this._model.startChat({
      history: history,
      generationConfig: this._generationConfig,
      systemInstruction: systemPrompt,
    });

    const result = await chat.sendMessage(userMessage);
    return result.response.text().trim();
  }
}

module.exports = GeminiBrain;
