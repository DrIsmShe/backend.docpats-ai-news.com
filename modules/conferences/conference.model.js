import mongoose from "mongoose";

// Конференция — не новость, и живёт по другим правилам.
//
// Новость публикуется сразу: ошибка в ленте стоит доверия. Конференция
// публикуется ТОЛЬКО через руки человека (status: "draft" по умолчанию), и
// причина не в перестраховке. Индустрия хищнических конференций — OMICS,
// WASET и их клоны — рассылает врачам приглашения на мероприятия, которых
// нет, и по тексту сайта они выглядят убедительнее настоящих. Модель их не
// отличит. Отличит человек, посмотрев на организатора.
//
// Второе отличие: у новости есть дата публикации, у конференции — четыре
// даты, и самая ценная не начало, а дедлайн. Начало пропустить нельзя,
// дедлайн подачи тезисов — запросто, и именно ради него сюда возвращаются.

const conferenceSchema = new mongoose.Schema(
  {
    // ── Что это ────────────────────────────────────────────────────────
    title: { type: String, required: true, trim: true },
    organizer: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },

    // Грубые корзины, а не точные специальности. В справочнике врачей
    // (server/common/models/DoctorProfile/specialityOfDoctor.js) 102
    // наименования и 14 категорий; размечать по 102 модель не умеет —
    // между "Cardiologist" и "Interventional Cardiologist" она гадает.
    // По 14 корзинам разметка устойчива, а точность добирает сам врач,
    // отмечая нужные категории в настройках.
    //
    // Пустой массив — легальное значение: конференция без специальности
    // (ИИ в медицине, право, управление клиникой) интересна всем.
    categories: { type: [String], default: [], index: true },

    // ── Когда ──────────────────────────────────────────────────────────
    startDate: { type: Date, default: null, index: true },
    endDate: { type: Date, default: null },
    // Дедлайны — то, ради чего рубрика существует. Сортировка по умолчанию
    // идёт по ближайшему из них, а не по дате начала.
    registrationDeadline: { type: Date, default: null },
    abstractDeadline: { type: Date, default: null },

    // ── Где ────────────────────────────────────────────────────────────
    city: { type: String, default: "", trim: true },
    country: { type: String, default: "", trim: true, index: true },
    format: {
      type: String,
      enum: ["onsite", "online", "hybrid"],
      default: "onsite",
    },

    // ── Ссылки и происхождение ─────────────────────────────────────────
    url: { type: String, required: true, trim: true },
    sourceSlug: { type: String, default: "", trim: true, lowercase: true },
    sourceUrl: { type: String, default: "", trim: true },

    // ── Подробности со СТРАНИЦЫ САМОЙ КОНФЕРЕНЦИИ ──────────────────────
    //
    // Страница «Events» общества даёт только название, даты и место —
    // остального там физически нет. Дедлайны, стоимость, программа и условия
    // участия живут на собственном сайте мероприятия, и добираются вторым
    // проходом (enrichConference). Поэтому поля пустые до тех пор, пока этот
    // проход не отработает, — и это нормальное состояние, а не потеря данных.
    program: { type: [String], default: [] }, // темы, треки, ключевые сессии
    audience: { type: String, default: "", trim: true }, // кому адресована
    conditions: { type: String, default: "", trim: true }, // условия участия и регистрации
    venue: { type: String, default: "", trim: true }, // площадка
    detailsFetchedAt: { type: Date, default: null },

    // ── Признаки, заменяющие рейтинг ───────────────────────────────────
    // Рейтинга на старте быть не может: некому ставить, а пустые звёзды
    // выглядят хуже их отсутствия. Пока сортируем по проверяемым фактам.
    cmeCredits: { type: String, default: "", trim: true },
    price: { type: String, default: "", trim: true },
    language: { type: String, default: "en", trim: true },

    // ── Модерация ──────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "published", "rejected"],
      default: "draft",
      index: true,
    },
    // Что именно не сошлось при автоматических проверках. Заполняется
    // экстрактором, читается человеком в модерации: он должен видеть, на
    // что смотреть, а не перепроверять всю карточку целиком.
    validationFlags: { type: [String], default: [] },
    aiConfidence: { type: Number, default: 0 },
    rejectedReason: { type: String, default: "", trim: true },
    reviewedAt: { type: Date, default: null },

    // Дедуп: один конгресс приходит из пяти источников. Хеш считаем по
    // нормализованному названию + году начала, а не по URL: у одного
    // мероприятия URL у каждого источника свой.
    contentHash: { type: String, required: true, unique: true },

    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },

    translations: {
      type: Map,
      // Поля перечислены полностью и намеренно: Mongoose молча отбрасывает
      // всё, чего нет в подсхеме. Пока здесь стояли только title и
      // description, перевод программы, аудитории и условий выполнялся,
      // оплачивался — и терялся на записи, а витрина показывала английский
      // оригинал рядом с переведённым описанием.
      of: new mongoose.Schema(
        {
          title: { type: String, default: "" },
          description: { type: String, default: "" },
          audience: { type: String, default: "" },
          conditions: { type: String, default: "" },
          program: { type: [String], default: [] },
        },
        { _id: false },
      ),
      default: {},
    },
    translationStatus: {
      type: String,
      enum: ["pending", "done", "failed"],
      default: "pending",
    },
  },
  { timestamps: true },
);

// Витрина всегда фильтрует по status и отсекает прошедшее — этим двум
// полям и нужен составной индекс.
conferenceSchema.index({ status: 1, startDate: 1 });
conferenceSchema.index({ status: 1, categories: 1, startDate: 1 });
conferenceSchema.index({ status: 1, country: 1, startDate: 1 });
conferenceSchema.index({ status: 1, registrationDeadline: 1 });

const Conference = mongoose.model("Conference", conferenceSchema);

export default Conference;
