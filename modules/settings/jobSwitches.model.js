// modules/settings/jobSwitches.model.js
//
// Переключатели фоновых задач: сбор новостей, генерация статей, перевод,
// конференции.
//
// ЗАЧЕМ В БАЗЕ, А НЕ В ПЕРЕМЕННЫХ ОКРУЖЕНИЯ. Выключатели через окружение
// в проекте уже есть (DISABLE_SCHEDULERS, CONFERENCE_INGESTION), но они
// требуют перезапуска процесса: чтобы остановить генерацию, надо зайти на
// сервер, поправить .env и перезапустить pm2. Владелец так делать не
// будет, а остановить генерацию иногда нужно срочно — когда кончились
// деньги на модели или когда выходит брак.
//
// Поэтому состояние лежит в базе, а задачи спрашивают его перед каждым
// запуском. Переключение действует немедленно и переживает перезапуск.
//
// ОДНА ЗАПИСЬ НА ВСЮ БАЗУ. Поле key всегда "jobs": так документ находится
// без знания его идентификатора, а уникальный индекс не даёт развестись
// двум состояниям, между которыми потом гадать, какое настоящее.

import mongoose from "mongoose";

const jobSwitchSchema = new mongoose.Schema(
  {
    key: { type: String, default: "jobs", unique: true, index: true },

    // true — задача работает, false — пропускается.
    //
    // По умолчанию всё включено: неизвестное состояние должно означать
    // «как было», а не «всё остановлено». Пустая база не должна тихо
    // выключить генерацию.
    ingestion: { type: Boolean, default: true },
    synthesis: { type: Boolean, default: true },
    translation: { type: Boolean, default: true },
    conferences: { type: Boolean, default: true },

    // Кто и когда переключил — чтобы через месяц было понятно, почему
    // статьи не выходят.
    updatedBy: { type: String, default: null },
    lastChange: { type: String, default: null },
  },
  { timestamps: true, collection: "job_switches" },
);

export default mongoose.models.JobSwitch ||
  mongoose.model("JobSwitch", jobSwitchSchema);
