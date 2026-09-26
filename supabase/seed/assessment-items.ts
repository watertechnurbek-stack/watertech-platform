import { itemWriteToRow, type ItemRowWrite, type ItemWrite } from "@/lib/attestation/schemas";

// Staging seed for the attestation item bank (docs/ATTESTATION.md §10): eight
// Part A items per day, Uzbek and Russian, every fact taken from the content
// this app ships with — lib/content/faq.ts, products.ts, packages.ts,
// competitors.ts, objections.ts and scripts.ts — and named in `sourceRef`.
// Nothing here comes from the SOP steps, which are still placeholder text.
//
// They land as DRAFTS: an admin reads each one in /admin/assessments/items and
// publishes it (the publish checks run then). Written in the editor's own
// shape (ItemWrite, the options' "correct" boxes) and mapped by the same
// itemWriteToRow the admin's save uses, so a seeded row is exactly what the
// editor would have written. tests/unit/seed/assessment-items.test.ts parses
// every item with the save schema and runs the publish checks on it.
//
// Eight per day is below the default draw sizes (12 / 12 / 10 / 6): staging
// either adds items or lowers `itemCount` in /admin/assessments/settings
// before a day can start (S05 refuses a short bank).

type SeedItem = Omit<ItemWrite, "status" | "version">;

function option(id: string, text: string, textRu: string, correct = false): ItemWrite["options"][number] {
  return { id, text, textRu, correct };
}

const DAY_1: SeedItem[] = [
  {
    id: "d1-kafolat-muddati",
    day: 1,
    topic: "company",
    kind: "single",
    difficulty: 1,
    prompt: "WaterTech polipropilen quvurlariga qancha muddat kafolat beriladi?",
    promptRu: "Какой срок гарантии даётся на полипропиленовые трубы WaterTech?",
    options: [
      option("a", "10 yil", "10 лет", true),
      option("b", "5 yil", "5 лет"),
      option("c", "25 yil", "25 лет"),
      option("d", "50 yil", "50 лет"),
    ],
    explanation: "FAQ: WaterTech mahsulotlariga 10 yil kafolat beriladi; 50 yil — foydalanish muddati.",
    explanationRu: "FAQ: на продукцию WaterTech даётся гарантия 10 лет; 50 лет — это срок службы.",
    sourceRef: "faq:product-1",
  },
  {
    id: "d1-foydalanish-muddati",
    day: 1,
    topic: "company",
    kind: "single",
    difficulty: 2,
    prompt: "WaterTech quvurlarining foydalanish muddati qancha?",
    promptRu: "Каков срок службы труб WaterTech?",
    options: [
      option("a", "10 yil", "10 лет"),
      option("b", "50 yil", "50 лет", true),
      option("c", "15 yil", "15 лет"),
      option("d", "100 yil", "100 лет"),
    ],
    explanation: "FAQ: foydalanish muddati 50 yil; 10 yil — kafolat muddati, ularni adashtirmang.",
    explanationRu: "FAQ: срок службы 50 лет; 10 лет — срок гарантии, не путайте их.",
    sourceRef: "faq:product-1",
  },
  {
    id: "d1-sertifikatlar",
    day: 1,
    topic: "company",
    kind: "multi",
    difficulty: 2,
    prompt: "WaterTech mahsulotlari qaysi sertifikatlarga ega? (bir nechta javob)",
    promptRu: "Какие сертификаты есть у продукции WaterTech? (несколько ответов)",
    options: [
      option("a", "ISO", "ISO", true),
      option("b", "GOST", "ГОСТ", true),
      option("c", "CE", "CE"),
      option("d", "UL", "UL"),
    ],
    explanation: "FAQ: WaterTech mahsulotlari ISO va GOST sertifikatlariga ega.",
    explanationRu: "FAQ: продукция WaterTech имеет сертификаты ISO и ГОСТ.",
    sourceRef: "faq:product-2",
  },
  {
    id: "d1-mahsulot-liniyalari",
    day: 1,
    topic: "product-lines",
    kind: "single",
    difficulty: 1,
    prompt: "WaterTech katalogi qaysi ikki mahsulot liniyasidan iborat?",
    promptRu: "Из каких двух продуктовых линий состоит каталог WaterTech?",
    options: [
      option("a", "PPR (issiq va sovuq suv) va kanalizatsiya", "ППР (горячая и холодная вода) и канализация", true),
      option("b", "Faqat PPR quvurlar", "Только трубы ППР"),
      option("c", "PE sug'orish tizimlari va baklar", "ПЭ-системы полива и баки"),
      option("d", "Metall-plastik quvurlar va radiatorlar", "Металлопластиковые трубы и радиаторы"),
    ],
    explanation: "Katalog: har bir mahsulot PPR yoki kanalizatsiya liniyasiga tegishli.",
    explanationRu: "Каталог: каждый товар относится к линии ППР или к канализации.",
    sourceRef: "product:truba-ppr",
  },
  {
    id: "d1-segmentlar",
    day: 1,
    topic: "product-lines",
    kind: "single",
    difficulty: 2,
    prompt: "Mahsulotlarimiz qaysi uchta segment (brend) uchun ishlab chiqariladi?",
    promptRu: "Для каких трёх сегментов (брендов) выпускается наша продукция?",
    options: [
      option("a", "WaterTech, AquaPower, AquaTherm", "WaterTech, AquaPower, AquaTherm", true),
      option("b", "WaterTech, AlfaTherm, PlasTherm", "WaterTech, AlfaTherm, PlasTherm"),
      option("c", "WaterTech, Fox Pipes, Asia Plas", "WaterTech, Fox Pipes, Asia Plas"),
      option("d", "AquaPower, Sheffaf Plas, Jip Plas", "AquaPower, Sheffaf Plas, Jip Plas"),
    ],
    explanation: "Skript, «Raqobatdan ustunligimiz»: WaterTech, AquaPower va AquaTherm; qolganlari — raqobatchilar.",
    explanationRu: "Скрипт, «Преимущества перед конкурентами»: WaterTech, AquaPower и AquaTherm; остальные — конкуренты.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d1-texnologiya",
    day: 1,
    topic: "value-proposition",
    kind: "single",
    difficulty: 1,
    prompt: "Mahsulotlarimiz qaysi mamlakat texnologiyasi asosida ishlab chiqariladi?",
    promptRu: "По технологии какой страны производится наша продукция?",
    options: [
      option("a", "Germaniya", "Германия", true),
      option("b", "Xitoy", "Китай"),
      option("c", "Turkiya", "Турция"),
      option("d", "Italiya", "Италия"),
    ],
    explanation: "Skript, taqdimot (F): Germaniya texnologiyasi asosida, asl polipropilendan.",
    explanationRu: "Скрипт, презентация (F): по немецкой технологии, из первичного полипропилена.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d1-asosiy-afzallik",
    day: 1,
    topic: "value-proposition",
    kind: "single",
    difficulty: 2,
    prompt: "Taqdimotda (FAB) mahsulotimizning asosiy afzalligi sifatida nima aytiladi?",
    promptRu: "Что называется главным преимуществом нашей продукции в презентации (FAB)?",
    options: [
      option(
        "a",
        "5–7 bar yuqori bosim va yuqori haroratga chidaydi, 10 yil rasmiy kafolat",
        "Выдерживает высокое давление 5–7 бар и высокую температуру, официальная гарантия 10 лет",
        true
      ),
      option("b", "Eng past narx, kafolatsiz sotiladi", "Самая низкая цена, продаётся без гарантии"),
      option("c", "Faqat sovuq suv uchun arzon quvurlar", "Дешёвые трубы только для холодной воды"),
      option("d", "Mel qo'shilgani uchun qattiqroq quvurlar", "Более твёрдые трубы за счёт добавления мела"),
    ],
    explanation: "Skript, taqdimot (A): 5–7 bar bosim, yuqori harorat, 10 yil kafolat va tez almashtirish.",
    explanationRu: "Скрипт, презентация (A): давление 5–7 бар, высокая температура, гарантия 10 лет и быстрая замена.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d1-alfatherm-modeli",
    day: 1,
    topic: "competitor",
    kind: "single",
    difficulty: 3,
    prompt: "Asosiy raqobatchilardan biri AlfaTherm qanday savdo modeli bilan ishlaydi?",
    promptRu: "По какой модели продаж работает AlfaTherm, один из главных конкурентов?",
    options: [
      option(
        "a",
        "Dilersiz — zavod skladidan to'g'ridan-to'g'ri do'konlarga sotadi",
        "Без дилеров — продаёт напрямую со склада завода в магазины",
        true
      ),
      option("b", "Faqat rasmiy dilerlar orqali sotadi", "Продаёт только через официальных дилеров"),
      option("c", "Faqat onlayn do'kon orqali sotadi", "Продаёт только через интернет-магазин"),
      option("d", "Faqat qurilish kompaniyalariga sotadi", "Продаёт только строительным компаниям"),
    ],
    explanation: "Raqobatchilar: AlfaTherm dilersiz, zavod skladidan do'konlarga sotadi; xavf darajasi — yuqori.",
    explanationRu: "Конкуренты: AlfaTherm работает без дилеров, со склада завода в магазины; уровень угрозы — высокий.",
    sourceRef: "competitor:alfa-therm",
  },
];

const DAY_2: SeedItem[] = [
  {
    id: "d2-ppr-diametrlari",
    day: 2,
    topic: "sizes",
    kind: "single",
    difficulty: 1,
    prompt: "PPR quvurlari katalogda qaysi diametrlarda bor?",
    promptRu: "В каких диаметрах трубы ППР есть в каталоге?",
    options: [
      option("a", "Ø20, Ø25, Ø32, Ø40, Ø50, Ø63", "Ø20, Ø25, Ø32, Ø40, Ø50, Ø63", true),
      option("b", "Ø16, Ø20, Ø25, Ø32", "Ø16, Ø20, Ø25, Ø32"),
      option("c", "Ø50, Ø75, Ø110, Ø160", "Ø50, Ø75, Ø110, Ø160"),
      option("d", "Ø63, Ø75, Ø90, Ø110", "Ø63, Ø75, Ø90, Ø110"),
    ],
    explanation: "Katalog, «Труба ППР»: Ø20 dan Ø63 gacha — 20, 25, 32, 40, 50, 63.",
    explanationRu: "Каталог, «Труба ППР»: от Ø20 до Ø63 — 20, 25, 32, 40, 50, 63.",
    sourceRef: "product:truba-ppr",
  },
  {
    id: "d2-kanalizatsiya-muftasi",
    day: 2,
    topic: "sizes",
    kind: "single",
    difficulty: 2,
    prompt: "Kanalizatsiya muftasi qaysi diametrlarda bor?",
    promptRu: "В каких диаметрах есть канализационная муфта?",
    options: [
      option("a", "Ø50, Ø75, Ø110, Ø160", "Ø50, Ø75, Ø110, Ø160", true),
      option("b", "Ø20, Ø25, Ø32, Ø40", "Ø20, Ø25, Ø32, Ø40"),
      option("c", "Ø40, Ø50, Ø63", "Ø40, Ø50, Ø63"),
      option("d", "Ø110, Ø125, Ø200", "Ø110, Ø125, Ø200"),
    ],
    explanation: "Katalog, «Муфта» (kanalizatsiya): Ø50, Ø75, Ø110, Ø160.",
    explanationRu: "Каталог, «Муфта» (канализация): Ø50, Ø75, Ø110, Ø160.",
    sourceRef: "product:mufta",
  },
  {
    id: "d2-issiq-suv-harorati",
    day: 2,
    topic: "pressure",
    kind: "single",
    difficulty: 1,
    prompt: "Issiq suv uchun quvurlarimiz necha gradus haroratga mo'ljallangan?",
    promptRu: "На какую температуру рассчитаны наши трубы для горячей воды?",
    options: [
      option("a", "80 °C", "80 °C", true),
      option("b", "60 °C", "60 °C"),
      option("c", "95 °C", "95 °C"),
      option("d", "120 °C", "120 °C"),
    ],
    explanation: "FAQ: issiq suv quvurlari 80 gradus haroratga mo'ljallangan.",
    explanationRu: "FAQ: трубы для горячей воды рассчитаны на 80 градусов.",
    sourceRef: "faq:product-4",
  },
  {
    id: "d2-ishchi-bosim",
    day: 2,
    topic: "pressure",
    kind: "single",
    difficulty: 2,
    prompt: "Taqdimotga ko'ra, quvurlarimiz qanday bosimga chidaydi?",
    promptRu: "Какое давление, согласно презентации, выдерживают наши трубы?",
    options: [
      option("a", "5–7 bar", "5–7 бар", true),
      option("b", "1–2 bar", "1–2 бар"),
      option("c", "25–30 bar", "25–30 бар"),
      option("d", "Bosimga chidamlilik aytilmaydi", "Стойкость к давлению не указывается"),
    ],
    explanation: "Skript, taqdimot (A): quvurlar 5–7 bar yuqori bosimga va yuqori haroratga chidaydi.",
    explanationRu: "Скрипт, презентация (A): трубы выдерживают высокое давление 5–7 бар и высокую температуру.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d2-xomashyo",
    day: 2,
    topic: "materials",
    kind: "single",
    difficulty: 1,
    prompt: "WaterTech quvurlari qanday xomashyodan tayyorlanadi?",
    promptRu: "Из какого сырья изготавливаются трубы WaterTech?",
    options: [
      option("a", "Asl polipropilen, mel qo'shilmaydi", "Первичный полипропилен, без добавления мела", true),
      option("b", "Qayta ishlangan polipropilen va mel", "Вторичный полипропилен и мел"),
      option("c", "PVX (polivinilxlorid)", "ПВХ (поливинилхлорид)"),
      option("d", "Metall-plastik", "Металлопластик"),
    ],
    explanation: "FAQ va skript: asl polipropilen; boshqa brendlardagidek mel qo'shilmaydi.",
    explanationRu: "FAQ и скрипт: первичный полипропилен; мел, как у других брендов, не добавляется.",
    sourceRef: "faq:product-3",
  },
  {
    id: "d2-armirlangan-quvur",
    day: 2,
    topic: "materials",
    kind: "single",
    difficulty: 2,
    prompt: "Katalogdagi armirlangan PPR quvur nima bilan armirlangan?",
    promptRu: "Чем армирована армированная труба ППР из каталога?",
    options: [
      option("a", "Shisha tola bilan", "Стекловолокном", true),
      option("b", "Alyuminiy folga bilan", "Алюминиевой фольгой"),
      option("c", "Po'lat sim bilan", "Стальной проволокой"),
      option("d", "Mis qatlam bilan", "Медным слоем"),
    ],
    explanation: "Katalog: «Труба ППР армированная стекловолокном» — shisha tola bilan armirlangan, Ø20–Ø63.",
    explanationRu: "Каталог: «Труба ППР армированная стекловолокном» — армирована стекловолокном, Ø20–Ø63.",
    sourceRef: "product:truba-ppr-armirovannaya-steklovoloknom",
  },
  {
    id: "d2-fiting-kalibrovkasi",
    day: 2,
    topic: "installation",
    kind: "single",
    difficulty: 2,
    prompt: "Usta «fitinglar quvurga tushmaydi» desa, qaysi fakt bilan javob beramiz?",
    promptRu: "Мастер говорит: «фитинги не садятся на трубу». Каким фактом мы отвечаем?",
    options: [
      option(
        "a",
        "Fitinglar Yevropa standartlarida aniq kalibrovka qilingan — tez va xatosiz o'rnatiladi",
        "Фитинги точно откалиброваны по европейским стандартам — монтаж быстрый и без ошибок",
        true
      ),
      option("b", "Fitingni bolg'a bilan urib kiritish mumkin", "Фитинг можно забить молотком"),
      option("c", "Fitinglar faqat metall quvurlarga mos keladi", "Фитинги подходят только к металлическим трубам"),
      option("d", "Fitinglar kalibrovkasiz, shuning uchun arzon", "Фитинги без калибровки, поэтому дешевле"),
    ],
    explanation: "E'tiroz «Fitinglar mos kelmaydi»: Yevropa standartidagi aniq kalibrovka, maxsus kafolat, sinov to'plami.",
    explanationRu: "Возражение «Фитинги не подходят»: точная калибровка по европейским стандартам, особая гарантия, тестовый набор.",
    sourceRef: "objection:obj-fitting",
  },
  {
    id: "d2-plastherm-yetkazish",
    day: 2,
    topic: "comparison",
    kind: "single",
    difficulty: 3,
    prompt: "Yangi mijozga yetkazib berish sharti bo'yicha biz PlasTherm'dan qanday farq qilamiz?",
    promptRu: "Чем мы отличаемся от PlasTherm по условиям доставки для нового клиента?",
    options: [
      option(
        "a",
        "Bizda yangi mijozga yetkazish kompaniya hisobidan; PlasTherm kamida 4 tonnadan bepul yetkazadi",
        "У нас доставка новому клиенту за счёт компании; PlasTherm доставляет бесплатно от 4 тонн",
        true
      ),
      option("b", "Ikkalasida ham yetkazish faqat mijoz hisobidan", "У обоих доставка только за счёт клиента"),
      option(
        "c",
        "PlasTherm har qanday hajmni bepul yetkazadi, biz esa yo'q",
        "PlasTherm бесплатно доставляет любой объём, а мы — нет"
      ),
      option("d", "Biz faqat 1 furadan bepul yetkazamiz", "Мы доставляем бесплатно только от одной фуры"),
    ],
    explanation: "FAQ: yangi mijozlarga yetkazish kompaniya hisobidan. Raqobatchilar: PlasTherm — kamida 20 m³ (4 t) olinsa bepul.",
    explanationRu: "FAQ: новым клиентам доставка за счёт компании. Конкуренты: PlasTherm — бесплатно от 20 м³ (4 т).",
    sourceRef: "competitor:plas-therm",
  },
];

const DAY_3: SeedItem[] = [
  {
    id: "d3-skript-bosqichlari",
    day: 3,
    topic: "funnel",
    kind: "single",
    difficulty: 3,
    prompt: "«Target orqali tushgan lidlar» skriptida bosqichlar qaysi tartibda keladi?",
    promptRu: "В каком порядке идут этапы скрипта «Лиды с таргета»?",
    options: [
      option(
        "a",
        "Munosabat → Ehtiyoj → Taqdimot → Raqobatdan ustunlik → E'tiroz → Yakuniy qadam",
        "Контакт → Потребность → Презентация → Преимущества перед конкурентами → Возражения → Завершение",
        true
      ),
      option(
        "b",
        "Taqdimot → Munosabat → Yakuniy qadam → Ehtiyoj → E'tiroz → Raqobatdan ustunlik",
        "Презентация → Контакт → Завершение → Потребность → Возражения → Преимущества перед конкурентами"
      ),
      option(
        "c",
        "Ehtiyoj → Yakuniy qadam → Taqdimot → E'tiroz → Munosabat → Raqobatdan ustunlik",
        "Потребность → Завершение → Презентация → Возражения → Контакт → Преимущества перед конкурентами"
      ),
      option(
        "d",
        "Yakuniy qadam → E'tiroz → Taqdimot → Raqobatdan ustunlik → Ehtiyoj → Munosabat",
        "Завершение → Возражения → Презентация → Преимущества перед конкурентами → Потребность → Контакт"
      ),
    ],
    explanation: "Skript: munosabat o'rnatish, ehtiyojni aniqlash, mahsulot taqdimoti, raqobatdan ustunlik, e'tiroz, yakuniy qadam.",
    explanationRu: "Скрипт: установление контакта, выявление потребности, презентация, преимущества, возражения, завершение.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d3-menejer-uchrashuvi",
    day: 3,
    topic: "funnel",
    kind: "single",
    difficulty: 2,
    prompt: "Yakuniy qadamda menejer bilan uchrashuvni nima uchun taklif qilamiz?",
    promptRu: "Зачем на завершающем этапе мы предлагаем встречу с менеджером?",
    options: [
      option(
        "a",
        "Hajmga mos shaxsiy chegirmalar va moslashuvchan to'lov usullarini muhokama qilish uchun",
        "Чтобы обсудить персональные скидки под объём и гибкие условия оплаты",
        true
      ),
      option("b", "Mijozdan shikoyat yozdirish uchun", "Чтобы клиент написал жалобу"),
      option("c", "Oldin sotilgan mahsulotni qaytarib olish uchun", "Чтобы забрать ранее проданный товар"),
      option("d", "Shartnomani bekor qilish uchun", "Чтобы расторгнуть договор"),
    ],
    explanation: "Skript, «Menejer taklifi»: shaxsiy chegirmalar va muddatli to'lov/nasiya — menejer hujjatlar va sinov to'plami bilan boradi.",
    explanationRu: "Скрипт, «Предложение менеджера»: персональные скидки и рассрочка — менеджер приезжает с документами и тестовым набором.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d3-lid-manbasi",
    day: 3,
    topic: "lead-creation",
    kind: "single",
    difficulty: 1,
    prompt: "«Target orqali tushgan lid» qayerdan keladi?",
    promptRu: "Откуда приходит «лид с таргета»?",
    options: [
      option(
        "a",
        "Instagram yoki Facebook reklamasi orqali qoldirilgan so'rovdan",
        "Из заявки, оставленной через рекламу в Instagram или Facebook",
        true
      ),
      option("b", "Ko'chadagi bannerdan", "С уличного баннера"),
      option("c", "Raqobatchi o'tkazib bergan mijozdan", "От клиента, которого передал конкурент"),
      option("d", "Birjadagi tenderdan", "Из тендера на бирже"),
    ],
    explanation: "Skript, «Kirish»: mijoz Instagram/Facebook orqali quvurlarga qiziqish bildirgan — shu so'rov eslatiladi.",
    explanationRu: "Скрипт, «Вступление»: клиент проявил интерес к трубам через Instagram/Facebook — оператор напоминает об этой заявке.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d3-vaqt-sorash",
    day: 3,
    topic: "lead-creation",
    kind: "single",
    difficulty: 1,
    prompt: "Lidga qo'ng'iroq boshida, tanishgandan keyin operator nimani so'raydi?",
    promptRu: "О чём оператор просит в начале звонка по лиду, сразу после знакомства?",
    options: [
      option("a", "2 daqiqa vaqt ajratishga ruxsat", "Разрешения уделить 2 минуты", true),
      option("b", "Darhol buyurtma hajmini", "Сразу назвать объём заказа"),
      option("c", "Bank rekvizitlarini", "Банковские реквизиты"),
      option("d", "Raqobatchilarning narxlarini", "Цены конкурентов"),
    ],
    explanation: "Skript: «Murojaatingiz yuzasidan 2 daqiqa vaqtingizni olaman, qarshi emasmisiz?»",
    explanationRu: "Скрипт: «По вашему обращению займу 2 минуты, вы не против?»",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d3-mijoz-haqida",
    day: 3,
    topic: "ideal-client",
    kind: "multi",
    difficulty: 2,
    prompt: "Ehtiyojni aniqlashdan oldin operator mijoz haqida nimalarni aniqlaydi? (bir nechta javob)",
    promptRu: "Что оператор выясняет о клиенте до выявления потребности? (несколько ответов)",
    options: [
      option(
        "a",
        "Faoliyat turi: do'kon, ulgurji savdo yoki qurilish kompaniyasi",
        "Вид деятельности: магазин, оптовая торговля или строительная компания",
        true
      ),
      option("b", "Manzili", "Адрес", true),
      option("c", "Do'kon rahbarimi yoki sotuvchi", "Руководитель магазина или продавец", true),
      option("d", "Oilaviy ahvoli", "Семейное положение"),
      option("e", "Oylik maoshi", "Размер зарплаты"),
    ],
    explanation: "Skript, «Faoliyatni aniqlash» va «QQS tasdig'i»: faoliyat turi, manzil, rahbar yoki sotuvchi.",
    explanationRu: "Скрипт, «Определение деятельности» и «Подтверждение НДС»: вид деятельности, адрес, руководитель или продавец.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d3-qurilish-taminotchisi",
    day: 3,
    topic: "ideal-client",
    kind: "single",
    difficulty: 2,
    prompt: "Qurilish kompaniyasi bilan ishlaganda kim bilan gaplashish kerak?",
    promptRu: "С кем нужно говорить, работая со строительной компанией?",
    options: [
      option("a", "Ta'minotchi — xarid uchun mas'ul xodim", "Со снабженцем — ответственным за закупки", true),
      option("b", "Qorovul", "С охранником"),
      option("c", "Istalgan ishchi", "С любым рабочим"),
      option("d", "Kompaniyaning mijozi", "С клиентом компании"),
    ],
    explanation: "Skript, «QQS tasdig'i»: qurilish kompaniyasidan bo'lsa — ta'minotchi bo'lishi kerak.",
    explanationRu: "Скрипт, «Подтверждение НДС»: если это строительная компания — собеседником должен быть снабженец.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d3-aniq-yakun",
    day: 3,
    topic: "task-setting",
    kind: "single",
    difficulty: 1,
    prompt: "Qo'ng'iroq qanday yakunlanishi shart?",
    promptRu: "Как обязательно должен завершаться звонок?",
    options: [
      option("a", "Aniq kun va vaqti belgilangan keyingi qadam bilan", "Следующим шагом с конкретным днём и временем", true),
      option("b", "Mijoz «o'ylab ko'raman» desa — shu bilan", "Если клиент сказал «подумаю» — на этом"),
      option("c", "Mijoz o'zi qayta qo'ng'iroq qilishini kutib", "Ожиданием, что клиент перезвонит сам"),
      option("d", "Faqat prays yuborib, muddatsiz", "Только отправкой прайса, без срока"),
    ],
    explanation: "Skript, «MUHIM»: maqsadsiz javoblar qabul qilinmaydi — operator aniq kun/vaqt bilan yakunlaydi.",
    explanationRu: "Скрипт, «ВАЖНО»: ответы без цели не принимаются — оператор завершает конкретным днём и временем.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d3-qayta-aloqa-vaqti",
    day: 3,
    topic: "task-setting",
    kind: "single",
    difficulty: 2,
    prompt: "Qayta aloqa vaqtini qaysi taklif to'g'ri belgilaydi?",
    promptRu: "Какое предложение правильно назначает время повторной связи?",
    options: [
      option(
        "a",
        "«Yakshanba 14:00 yoki dushanba 10:00 qulaymi?» — ikkita aniq variant",
        "«Вам удобно в воскресенье в 14:00 или в понедельник в 10:00?» — два конкретных варианта",
        true
      ),
      option("b", "«Bo'sh bo'lsangiz, o'zingiz qo'ng'iroq qiling»", "«Когда будете свободны, позвоните сами»"),
      option("c", "«Keyingi hafta bir kun bog'lanaman»", "«Свяжусь как-нибудь на следующей неделе»"),
      option("d", "«Kerak bo'lsa, yozarsiz»", "«Если нужно — напишете»"),
    ],
    explanation: "Skript, «Aniq qayta aloqa vaqti»: ikkita aniq kun va soat taklif qilinadi.",
    explanationRu: "Скрипт, «Точное время повторной связи»: предлагаются два конкретных дня и часа.",
    sourceRef: "script:lead-orqali-tushgan",
  },
];

const DAY_4: SeedItem[] = [
  {
    id: "d4-narxi-qimmat",
    day: 4,
    topic: "objections",
    kind: "single",
    difficulty: 1,
    prompt: "Mijozning «Narxi qimmat» degani ko'pincha nimani anglatadi?",
    promptRu: "Что чаще всего означает фраза клиента «Дорого»?",
    options: [
      option(
        "a",
        "Boshqa takliflar bilan solishtiryapti va qiymatni ko'rmayapti",
        "Сравнивает с другими предложениями и не видит ценности",
        true
      ),
      option("b", "Umuman xarid qilmoqchi emas", "Вообще не собирается покупать"),
      option("c", "Chegirmasiz raqobatchiga ketadi, boshqa yo'l yo'q", "Без скидки уйдёт к конкуренту, других вариантов нет"),
      option("d", "Mahsulot unga kerak emas", "Продукт ему не нужен"),
    ],
    explanation: "E'tiroz «Narxi qimmat»: mijoz solishtiryapti — biz narxni emas, xavfsizlik va obro' sug'urtasini sotamiz.",
    explanationRu: "Возражение «Дорого»: клиент сравнивает — мы продаём не цену, а надёжность и страховку репутации.",
    sourceRef: "objection:obj-qimmat",
  },
  {
    id: "d4-oylab-koraman",
    day: 4,
    topic: "objections",
    kind: "single",
    difficulty: 2,
    prompt: "Mijoz «O'ylab ko'raman» desa, qaysi javob to'g'ri?",
    promptRu: "Клиент говорит «Я подумаю». Какой ответ правильный?",
    options: [
      option(
        "a",
        "Sababni aniqlashtirish: «Sizni ko'proq nima to'xtatyapti — narxmi yoki nasiya shartlarimi?»",
        "Уточнить причину: «Что вас больше останавливает — цена или условия рассрочки?»",
        true
      ),
      option("b", "«Mayli, o'ylab ko'ring» deb qo'ng'iroqni tugatish", "Сказать «Хорошо, подумайте» и завершить звонок"),
      option("c", "Darhol 30% chegirma taklif qilish", "Сразу предложить скидку 30%"),
      option("d", "Bosim o'tkazib, bugunoq to'lashni talab qilish", "Давить и требовать оплатить сегодня же"),
    ],
    explanation: "E'tiroz «O'ylab ko'raman»: aniq to'xtatuvchi sabab bor — uni savol bilan toping.",
    explanationRu: "Возражение «Я подумаю»: есть конкретная причина — найдите её вопросом.",
    sourceRef: "objection:obj-think",
  },
  {
    id: "d4-risk-qila-olmayman",
    day: 4,
    topic: "objections",
    kind: "single",
    difficulty: 2,
    prompt: "Mijoz «Risk qila olmayman» desa, qaysi dalilni ta'kidlaymiz?",
    promptRu: "Клиент говорит «Не могу рисковать». Какой довод мы подчёркиваем?",
    options: [
      option(
        "a",
        "Marketing va mijozlarni jalb qilishni kompaniya o'z zimmasiga oladi",
        "Маркетинг и привлечение клиентов компания берёт на себя",
        true
      ),
      option("b", "Sotilmasa, pulni ikki baravar qaytaramiz", "Если не продастся — вернём деньги в двойном размере"),
      option("c", "Risk yo'q, chunki narx eng arzon", "Риска нет, потому что цена самая низкая"),
      option("d", "Boshqa do'konlar ham risk qilyapti", "Другие магазины тоже рискуют"),
    ],
    explanation: "E'tiroz «Risk qila olmayman»: ustalar bilan hamkorlik, talab yuqori, mijoz jalb qilishni biz hal qilamiz.",
    explanationRu: "Возражение «Не могу рисковать»: работа с мастерами, высокий спрос, привлечение клиентов берём на себя.",
    sourceRef: "objection:obj-risk",
  },
  {
    id: "d4-alfatherm-chegirmasi",
    day: 4,
    topic: "competitor-claim",
    kind: "single",
    difficulty: 3,
    prompt: "Mijoz: «AlfaTherm 25% gacha chegirma beradi». AlfaTherm chegirmasi haqida qaysi fakt to'g'ri?",
    promptRu: "Клиент: «AlfaTherm даёт скидку до 25%». Какой факт о скидке AlfaTherm верен?",
    options: [
      option("a", "Maksimal 25%: 15% bazaviy + 10% hajm uchun", "Максимум 25%: 15% базовая + 10% за объём", true),
      option("b", "Maksimal 40%, retrobonus bilan", "Максимум 40% с ретробонусом"),
      option("c", "Bazaviy 25%, ustiga hajm uchun 10%", "Базовая 25% и ещё 10% за объём"),
      option("d", "AlfaTherm chegirma bermaydi", "AlfaTherm не даёт скидок"),
    ],
    explanation: "Raqobatchilar: AlfaTherm — bazaviy 15%, hajm uchun 10%, retrobonus 0%, maksimal 25%.",
    explanationRu: "Конкуренты: AlfaTherm — базовая 15%, за объём 10%, ретробонус 0%, максимум 25%.",
    sourceRef: "competitor:alfa-therm",
  },
  {
    id: "d4-muammo-savoli",
    day: 4,
    topic: "discovery",
    kind: "single",
    difficulty: 2,
    prompt: "Ehtiyojni aniqlash bosqichida qaysi savol mijozning muammosini aniqlaydi?",
    promptRu: "Какой вопрос на этапе выявления потребности выясняет проблему клиента?",
    options: [
      option(
        "a",
        "«Raqobatchilar bilan ishlashda sizni nima bezovta qiladi — yetkazish muddatimi yoki fitinglar sifatimi?»",
        "«Что вас беспокоит в работе с конкурентами — сроки доставки или качество фитингов?»",
        true
      ),
      option("b", "«Praysimizni yuborsam bo'ladimi?»", "«Можно отправить вам наш прайс?»"),
      option("c", "«Bugun buyurtma berasizmi?»", "«Оформите заказ сегодня?»"),
      option("d", "«Qaysi kuni ofisga kelasiz?»", "«В какой день приедете в офис?»"),
    ],
    explanation: "Skript, «Muammoni aniqlash»: yetkazish muddati yoki fitinglar sifati bilan bog'liq muammolar so'raladi.",
    explanationRu: "Скрипт, «Выявление проблемы»: спрашиваем о проблемах со сроками доставки или качеством фитингов.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d4-sifatga-ishonch",
    day: 4,
    topic: "closing",
    kind: "multi",
    difficulty: 2,
    prompt: "Katta buyurtmadan oldin sifatga ishonch hosil qilmoqchi bo'lgan mijozga nimalarni taklif qilamiz? (bir nechta javob)",
    promptRu: "Что мы предлагаем клиенту, который хочет убедиться в качестве до крупного заказа? (несколько ответов)",
    options: [
      option("a", "Fiting va quvur namunalarini yuborish", "Отправить образцы фитингов и труб", true),
      option("b", "Zavodga ekskursiya bilan ofisga tashrif", "Визит в офис с экскурсией на завод", true),
      option(
        "c",
        "Sertifikatlar va sinov to'plami bilan menejer uchrashuvi",
        "Встречу с менеджером с сертификатами и тестовым набором",
        true
      ),
      option("d", "Mahsulotni kafolatsiz, arzonroq sotish", "Продать продукцию дешевле, но без гарантии"),
    ],
    explanation: "Skript, «Yakuniy qadam»: namuna yuborish, ofis va zavodga tashrif, menejer hujjatlar va sinov to'plami bilan.",
    explanationRu: "Скрипт, «Завершение»: образцы, визит в офис и на завод, менеджер с документами и тестовым набором.",
    sourceRef: "script:lead-orqali-tushgan",
  },
  {
    id: "d4-optimal-nasiya",
    day: 4,
    topic: "terms",
    kind: "single",
    difficulty: 2,
    prompt: "OPTIMAL NASIYA paketida to'lov sharti qanday?",
    promptRu: "Какие условия оплаты в пакете OPTIMAL NASIYA?",
    options: [
      option("a", "40% avans + 60% nasiya 25 kunga", "40% аванс + 60% рассрочка на 25 дней", true),
      option("b", "50% avans + 50% nasiya 30 kunga", "50% аванс + 50% рассрочка на 30 дней"),
      option("c", "Faqat naqd, 1–7 kun ichida", "Только наличные, в течение 1–7 дней"),
      option("d", "100% nasiya 60 kunga", "100% рассрочка на 60 дней"),
    ],
    explanation: "Paketlar: OPTIMAL NASIYA — 1 Isuzu assortiment, 40% avans + 60% nasiya (25 kun), ~15% chegirma.",
    explanationRu: "Пакеты: OPTIMAL NASIYA — 1 Isuzu ассортимента, 40% аванс + 60% рассрочка (25 дней), скидка ~15%.",
    sourceRef: "package:optimal-nasiya",
  },
  {
    id: "d4-premium-naqd",
    day: 4,
    topic: "terms",
    kind: "single",
    difficulty: 3,
    prompt: "PREMIUM NAQD paketida chegirma va logistika qanday?",
    promptRu: "Какая скидка и логистика в пакете PREMIUM NAQD?",
    options: [
      option("a", "~20% gacha chegirma, logistika 100% bepul", "Скидка до ~20%, логистика 100% бесплатно", true),
      option("b", "~15% chegirma, logistikaning 2% qoplanadi", "Скидка ~15%, покрывается 2% логистики"),
      option("c", "Chegirmasiz, logistika mijoz hisobidan", "Без скидки, логистика за счёт клиента"),
      option("d", "~30% chegirma, logistikaning yarmi qoplanadi", "Скидка ~30%, покрывается половина логистики"),
    ],
    explanation: "Paketlar: PREMIUM NAQD — 1 fura, naqd (1–7 kun), ~20% gacha chegirma, logistika 100% bepul, 1 hafta ichida.",
    explanationRu: "Пакеты: PREMIUM NAQD — 1 фура, наличные (1–7 дней), скидка до ~20%, логистика 100% бесплатно, в течение недели.",
    sourceRef: "package:premium-naqd",
  },
];

/** Every seeded item, day by day, as the editor would hold it — all drafts. */
export const assessmentSeedItems: readonly ItemWrite[] = [...DAY_1, ...DAY_2, ...DAY_3, ...DAY_4].map((item) => ({
  ...item,
  status: "draft",
}));

/** The rows the seed writes into public.assessment_items. */
export function assessmentSeedRows(): ItemRowWrite[] {
  return assessmentSeedItems.map(itemWriteToRow);
}
