// Обрезка статей, которые не удалось дописать.
//
// ЗАЧЕМ. Три статьи обрываются на полуслове, и дописать их нельзя: модель
// отказывается продолжать текст (stop_reason: refusal, см. finishTruncated).
// Оставлять как есть — значит показывать читателю фразу, оборванную на
// середине слова. Обрезка до последнего целого предложения теряет
// ненаписанное заключение, но убирает видимый дефект.
//
// Оригинал сохраняется в bodyBeforeTrim — обрезка обратима.
//
// Запуск:
//   node scripts/trimUnfinished.js          — показать, что отсечётся
//   node scripts/trimUnfinished.js --apply  — обрезать
import "dotenv/config";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");
const ENDS_OK = /[.!?:»)"'\]]$/;

/** Конец последнего целого предложения. -1, если такого нет вовсе. */
function lastCompleteEnd(text) {
  // Ищем знак конца предложения, за которым идёт пробел или конец текста.
  // Точка внутри «т.е.», в числе или в URL таким образом не считается
  // концом: за ней нет пробела либо следом идёт строчная буква.
  const re = /[.!?»)"'\]](?=\s|$)/g;
  let end = -1, m;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index + 1, m.index + 40);
    if (/^\s+[a-zа-яё]/.test(after)) continue; // «и т.д. далее» — не конец
    end = m.index;
  }
  return end;
}

function trim(body) {
  let cut = body.slice(0, lastCompleteEnd(body) + 1);
  // Повисший заголовок раздела в конце смысла не имеет: под ним пусто.
  cut = cut.replace(/\n+#{1,6} [^\n]*$/, "");
  // Повисший пункт списка — тоже.
  cut = cut.replace(/\n+[-*] [^\n]*$/, "");
  return cut.trimEnd();
}

await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL);
const col = mongoose.connection.db.collection("syntheses");
const docs = await col.find({ "finishRefused.reason": "refusal" })
  .project({ title: 1, body: 1, wordCount: 1, bodyBeforeTrim: 1 }).toArray();

console.log(APPLY ? "=== ОБРЕЗКА ===" : "=== ВХОЛОСТУЮ (без --apply ничего не пишется) ===");
console.log("статей:", docs.length, "\n");

for (const d of docs) {
  if (d.bodyBeforeTrim) { console.log("уже обрезана:", d.title.slice(0, 60)); continue; }
  const cut = trim(d.body);
  const lost = d.body.length - cut.length;
  const words = cut.split(/\s+/).filter(Boolean).length;
  console.log("=".repeat(64));
  console.log("СТАТЬЯ:", d.title.slice(0, 70));
  console.log("было знаков:", d.body.length, "| станет:", cut.length, "| отсечётся:", lost);
  console.log("слов:", d.wordCount, "->", words);
  console.log("БЫЛО в конце:  ..." + JSON.stringify(d.body.trimEnd().slice(-110)));
  console.log("СТАНЕТ в конце:..." + JSON.stringify(cut.slice(-110)));
  console.log("кончается знаком препинания:", ENDS_OK.test(cut));
  if (APPLY) {
    await col.updateOne({ _id: d._id }, { $set: {
      bodyBeforeTrim: d.body, body: cut, wordCount: words, trimmedAt: new Date() } });
    console.log("ЗАПИСАНО");
  }
}
await mongoose.disconnect();
