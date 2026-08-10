// config/ai.js
// Единственное место, где решается, какая модель используется. Раньше файл был
// написан на CommonJS (module.exports) внутри проекта с "type": "module" —
// первый же import из него уронил бы процесс на старте со SyntaxError, поэтому
// его никто не подключал, а имена моделей разъехались по коду хардкодом.
//
// Значения по умолчанию совпадают с тем, что было прибито в коде, — подключение
// конфига само по себе ничего не меняет. Чтобы сменить модель, правьте .env.

const DEFAULTS = {
  openaiModel: "gpt-4.1-mini",
  embeddingModel: "text-embedding-3-small",
  anthropicModel: "claude-sonnet-4-5",
  // Перевод исторически идёт на другой модели, чем классификация, — держим её
  // отдельным ключом, чтобы смена OPENAI_MODEL не переставляла заодно переводы.
  translationModel: "gpt-4o-mini",
};

export function getAIConfig() {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || DEFAULTS.openaiModel,
    embeddingModel: process.env.EMBEDDING_MODEL || DEFAULTS.embeddingModel,
    anthropicModel: process.env.ANTHROPIC_MODEL || DEFAULTS.anthropicModel,
    translationModel:
      process.env.TRANSLATION_MODEL || DEFAULTS.translationModel,
  };
}

// Короткие геттеры для мест, которым нужно только имя модели. Читают env при
// каждом вызове, а не один раз при импорте: порядок загрузки модулей в ESM
// нестабилен, и кэширование значения на уровне модуля может поймать состояние
// до того, как dotenv успел отработать.
export const openaiModel = () => getAIConfig().openaiModel;
export const embeddingModel = () => getAIConfig().embeddingModel;
export const anthropicModel = () => getAIConfig().anthropicModel;
export const translationModel = () => getAIConfig().translationModel;

export default getAIConfig;
