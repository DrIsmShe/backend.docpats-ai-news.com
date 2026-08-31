// scripts/finishTruncated.js
//
// Дописывает статьи, оборванные лимитом вывода.
//
// Почти все статьи обрывались на полуслове: у них просили 5000 слов, а
// потолок вывода стоял такой, что заданный объём приходился ровно на
// него. Причина устранена, но уже опубликованные статьи сами себя не
// допишут.
//
// Дописывание, а не перегенерация: текст до обрыва написан нормально, и
// выбрасывать его значит платить дважды за то, что уже есть.
//
// ОБРАТИМО: исходный текст сохраняется в bodyBeforeFix. Если стык выйдет
// плохим, статью можно вернуть одной командой.
//
// Запуск:  node scripts/finishTruncated.js [сколько]

import mongoose from "mongoose";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

dotenv.config();

// Сколько статей за прогон. Ищем первый ЧИСЛОВОЙ аргумент, а не второй по
// счёту: иначе флаг на его месте превратил бы предел в NaN и цикл не сделал
// бы ни одного шага.
const LIMIT = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 3);
const client = new Anthropic({ timeout: 900_000, maxRetries: 0 });

// Сколько текста показать модели как контекст. Вся статья не нужна: важно
// последнее — тема, на которой оборвались, и интонация автора.
const TAIL_CHARS = 4000;

const ENDS_OK = /[.!?:»)"'\]]$/;

function isTruncated(body) {
  return !ENDS_OK.test(String(body || "").trimEnd());
}

async function continueArticle(article) {
  const body = article.body;
  const tail = body.slice(-TAIL_CHARS);

  const prompt = `Ты — главный редактор медицинского издания. Статья ниже ОБОРВАНА: генерация упёрлась в лимит и текст закончился посреди фразы, иногда посреди слова.

Твоя задача — ДОПИСАТЬ её до конца.

ЗАГОЛОВОК СТАТЬИ:
${article.title}

ПОСЛЕДНИЙ ФРАГМЕНТ (именно здесь текст оборвался):
${tail}

ПРАВИЛА:
- Начни ровно с того места, где текст оборвался. Никаких вводных, никаких «продолжим».
- ВАЖНО ПРО ПЕРВЫЙ СИМВОЛ. Посмотри на последнее слово фрагмента. Если оно оборвано на середине — первым же символом допиши его окончание, БЕЗ пробела. Если последнее слово целое — начни ответ С ПРОБЕЛА, иначе твой текст слипнется с предыдущим словом.
- Не повторяй уже написанное.
- Сохрани стиль, тон и уровень строгости оригинала.
- Сохрани разметку markdown: ## для разделов, [1], [2] для ссылок на источники.
- Доведи начатую мысль до конца, раскрой оставшиеся аспекты темы и заверши статью полноценным заключением.
- Объём — сколько потребуется, чтобы тема была раскрыта: ориентировочно 800-2000 слов.
- Ответь ТОЛЬКО продолжением текста.`;

  const message = await client.messages
    .stream({
      model: "claude-sonnet-4-5",
      max_tokens: 16000,
      messages: [{ role: "user", content: prompt }],
    })
    .finalMessage();

  if (message.stop_reason === "max_tokens") {
    throw new Error("продолжение само оборвалось по лимиту");
  }

  // Отказ модели выглядит снаружи как пустой или обрезанный ответ, и
  // раньше именно так и записывался в лог. Из-за этого три статьи
  // прогонялись раз за разом с диагнозом «пустое продолжение», хотя
  // повтор был заведомо бесполезен: модель не соглашалась продолжать
  // текст. Отказ надо называть отказом.
  if (message.stop_reason === "refusal") {
    throw new Error(
      "модель отказалась продолжать эту статью (stop_reason: refusal) — " +
        "повторять бессмысленно, нужен человек",
    );
  }

  // Текст собираем со ВСЕХ блоков, а не только с первого: ответ не
  // обязан быть одним блоком.
  const text = message.content.map((c) => c.text || "").join("");
  if (!text.trim()) throw new Error("пустое продолжение");
  if (isTruncated(text)) {
    throw new Error("продолжение обрывается на полуслове");
  }
  return text;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL);
  const col = mongoose.connection.db.collection("syntheses");

  const all = await col
    .find({ status: "published" })
    .sort({ createdAt: -1 })
    .project({
      title: 1,
      body: 1,
      wordCount: 1,
      createdAt: 1,
      bodyBeforeFix: 1,
      finishRefused: 1,
    })
    .toArray();

  // Уже дописанные пропускаем: bodyBeforeFix — признак, что здесь работали.
  // Отказы — тоже: модель их продолжать не станет, а каждый заход платный.
  // Снять пометку и попробовать снова: --retry-refused.
  const retryRefused = process.argv.includes("--retry-refused");
  const truncated = all.filter((a) => !a.bodyBeforeFix && isTruncated(a.body));
  const refused = truncated.filter((a) => a.finishRefused);
  const pending = retryRefused ? truncated : truncated.filter((a) => !a.finishRefused);

  console.log(`Оборванных статей: ${truncated.length}. Дописываем ${Math.min(LIMIT, pending.length)}.`);
  if (refused.length && !retryRefused) {
    console.log(`Пропущено отказов модели: ${refused.length} (--retry-refused, чтобы попробовать снова).`);
    for (const a of refused) console.log(`  - ${a.title.slice(0, 70)}`);
  }

  for (const article of pending.slice(0, LIMIT)) {
    console.log(`
${"=".repeat(70)}`);
    console.log(`СТАТЬЯ: ${article.title}`);
    console.log(`Было слов: ${article.wordCount}, знаков: ${article.body.length}`);
    console.log(`ОБРЫВ: ...${article.body.trimEnd().slice(-120)}`);

    try {
      const t0 = Date.now();
      const cont = await continueArticle(article);
      const elapsed = Math.round((Date.now() - t0) / 1000);

      // Склейка. Пробел не добавляем сами: обрыв мог случиться посреди
      // слова, и пробел разорвал бы его окончательно. Ставить или нет —
      // решает модель, она видит фрагмент и понимает, оборвано слово или
      // нет; задание требует начать с пробела, если слово целое.
      //
      // Проверять склейку автоматически нельзя: «множественные» + «мелкие»
      // и «множественных» + «систем» на вид одинаковы, а верен только
      // первый. Поэтому стык печатается — его смотрит человек.
      const merged = article.body + cont;
      const words = merged.split(/\s+/).filter(Boolean).length;

      await col.updateOne(
        { _id: article._id },
        {
          $set: {
            bodyBeforeFix: article.body,
            body: merged,
            wordCount: words,
            finishedAt: new Date(),
          },
        },
      );

      console.log(`
СТЫК (последние 90 знаков старого + первые 200 нового):`);
      console.log(`  ...${article.body.trimEnd().slice(-90)}[СТЫК]${cont.slice(0, 200)}`);
      console.log(`
НОВАЯ КОНЦОВКА: ...${merged.trimEnd().slice(-200)}`);
      console.log(`
Стало слов: ${words} (+${words - article.wordCount}), за ${elapsed}s`);
    } catch (err) {
      console.error(`  НЕ УДАЛОСЬ: ${err.message}`);
      // Отказ помечаем, чтобы следующий прогон не платил за него снова.
      if (/refusal/.test(err.message)) {
        await col.updateOne(
          { _id: article._id },
          { $set: { finishRefused: { at: new Date(), reason: "refusal" } } },
        );
      }
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("Упало:", e.message);
  process.exit(1);
});
