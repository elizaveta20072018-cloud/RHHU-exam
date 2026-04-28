import { TOPICS, CATEGORIES, getTopic, readyTopics, allFlashcards, allMcq } from './data/topics.js';

// ——— Прогресс ———
const STORAGE_KEY = 'rhhu_progress_v1';

function loadProgress() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored) return defaultProgress();
    return { ...defaultProgress(), ...stored };
  } catch {
    return defaultProgress();
  }
}
function defaultProgress() {
  return {
    topicsStudied: {},      // { topicId: true }
    mcqStats: {},           // { topicId: { correct, total } }
    recentAnswers: [],      // [{ correct: bool }] — последние RECENT_WINDOW ответов в тесте
    flashcardsSeen: {},     // { topicId: { idx: true } }
    streak: {},             // { topicId: N } — серия правильных ответов подряд (без подсказки)
    lessons: {},            // { topicId: { stage, completed } } — прогресс в режиме "Изучение"
    daily: { lastDate: null, doneToday: 0 },
  };
}

const RECENT_WINDOW = 20; // окно «свежей» точности

// После скольких правильных ответов подряд скрывать "Подробнее" при правильном ответе.
const STREAK_THRESHOLD = 3;
function saveProgress() { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
let progress = loadProgress();

// ——— Роутер ———
const app = document.getElementById('app');
const navButtons = document.querySelectorAll('.modes button');
const views = {
  dashboard: renderDashboard,
  study:     renderStudy,
  lesson:    renderLesson,        // ?id=N
  topics:    renderTopicsList,
  topic:     renderTopicDetail,   // ?id=N
  flashcards: renderFlashcards,
  test:      renderTest,
  daily:     renderDaily,
};

function navigate(view, params = {}) {
  const hash = '#' + view + (params.id ? `?id=${params.id}` : '');
  if (location.hash !== hash) location.hash = hash;
  else render();
}
window.addEventListener('hashchange', render);

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
});

function parseHash() {
  const h = location.hash.replace('#', '') || 'dashboard';
  const [view, qs] = h.split('?');
  const params = {};
  if (qs) qs.split('&').forEach((kv) => { const [k, v] = kv.split('='); params[k] = decodeURIComponent(v); });
  return { view, params };
}

function render() {
  const { view, params } = parseHash();
  const fn = views[view] || renderDashboard;
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  app.innerHTML = '';
  fn(params);
  updateProgressSummary();
}

// ——— Хелперы ———
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function categoryTag(catKey) {
  const c = CATEGORIES[catKey];
  return el('span', { class: `tag ${c.cls}` }, c.label);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function computeAccuracy() {
  const mcqTotal = Object.values(progress.mcqStats).reduce((s, x) => s + x.total, 0);
  const mcqCorrect = Object.values(progress.mcqStats).reduce((s, x) => s + x.correct, 0);
  const allAcc = mcqTotal ? Math.round((mcqCorrect / mcqTotal) * 100) : null;
  const recent = progress.recentAnswers || [];
  const recentCorrect = recent.filter((a) => a.correct).length;
  const recentAcc = recent.length ? Math.round((recentCorrect / recent.length) * 100) : null;
  return { mcqTotal, mcqCorrect, allAcc, recent, recentCorrect, recentAcc };
}

function updateProgressSummary() {
  const ready = readyTopics().length;
  const studied = Object.keys(progress.topicsStudied).length;
  const { mcqTotal, allAcc, recent, recentAcc } = computeAccuracy();
  const recentTxt = recent.length ? `точность за ${recent.length}: ${recentAcc}%` : 'точность: пока нет ответов';
  const allTxt = mcqTotal ? ` · всего: ${allAcc}%` : '';
  document.getElementById('progress-summary').textContent =
    `Тем готово: ${ready}/36 · изучено: ${studied} · ${recentTxt}${allTxt}`;
}

document.getElementById('reset-progress').addEventListener('click', () => {
  if (confirm('Сбросить ВЕСЬ прогресс? Это удалит уроки, серии и статистику.')) {
    progress = defaultProgress();
    saveProgress();
    render();
  }
});

document.getElementById('reset-stats').addEventListener('click', () => {
  if (confirm('Сбросить только статистику теста (точность, серии, последние 20 ответов)? Уроки и отметки об изученных темах сохранятся.')) {
    progress.mcqStats = {};
    progress.recentAnswers = [];
    progress.streak = {};
    saveProgress();
    render();
  }
});

// ——— ДАШБОРД ———
function renderDashboard() {
  const ready = readyTopics().length;
  const studied = Object.keys(progress.topicsStudied).length;
  const { mcqTotal, allAcc, recent, recentAcc } = computeAccuracy();

  app.append(
    el('h1', { class: 'h1' }, 'Подготовка к вступительному экзамену'),
    el('p', { class: 'muted' }, 'Магистратура РГГУ · «Брендинг и деловая репутация» · 36 тем · ежедневная практика.'),

    el('div', { class: 'stat-grid' },
      stat(ready + '/36', 'тем готово'),
      stat(studied, 'изучено вами'),
      stat(mcqTotal, 'ответов в тесте'),
      statAccuracy(recentAcc, recent.length, allAcc, mcqTotal),
    ),

    el('div', { class: 'card' },
      el('div', { class: 'h2' }, 'С чего начать'),
      el('p', { class: 'muted' }, 'Если темы пока знакомы слабо — иди в раздел «Изучение»: каждая тема разбирается лесенкой (прочитать → закрепить карточками → проверить тестом). Когда освоишься — переключайся на «Карточки» и «Ежедневный микс» для повторения.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', onClick: () => navigate('study') }, '📖 К изучению'),
        el('button', { class: 'btn secondary', onClick: () => navigate('daily') }, 'Ежедневный микс'),
      ),
    ),

    el('div', { class: 'card' },
      el('div', { class: 'h2' }, 'Прогресс по темам'),
      progressBar(ready, 36, 'Контент готов'),
      progressBar(studied, 36, 'Изучено'),
    ),
  );
}

function stat(num, lbl) {
  return el('div', { class: 'stat' },
    el('div', { class: 'num' }, String(num)),
    el('div', { class: 'lbl' }, lbl),
  );
}

function statAccuracy(recentAcc, recentN, allAcc, allN) {
  const main = recentN ? `${recentAcc}%` : '—';
  const lbl = recentN ? `точность за ${recentN}` : 'точность (нет ответов)';
  const sub = allN ? `за всё время: ${allAcc}% (${allN})` : '';
  return el('div', { class: 'stat' },
    el('div', { class: 'num' }, main),
    el('div', { class: 'lbl' }, lbl),
    sub ? el('div', { class: 'lbl', style: 'margin-top:4px;text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-dim);' }, sub) : null,
  );
}

function progressBar(value, max, label) {
  const pct = Math.round((value / max) * 100);
  return el('div', {},
    el('div', { class: 'muted', style: 'display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;' },
      el('span', {}, label), el('span', {}, `${value}/${max}`)),
    el('div', { class: 'progress' }, el('span', { style: `width:${pct}%` })),
  );
}

// ——— СПИСОК ТЕМ ———
function renderTopicsList() {
  app.append(el('h1', { class: 'h1' }, 'Темы'));

  const filter = el('select', {
    onChange: (e) => { currentFilter = e.target.value; renderList(); },
  },
    el('option', { value: 'all' }, 'Все категории'),
    ...Object.entries(CATEGORIES).map(([k, c]) =>
      el('option', { value: k }, c.label)),
  );
  let currentFilter = 'all';

  app.append(el('div', { class: 'row', style: 'margin-bottom:12px;align-items:center;' },
    el('span', { class: 'muted' }, 'Фильтр:'), filter,
  ));

  const listEl = el('div', { class: 'topic-list' });
  app.append(listEl);

  function renderList() {
    listEl.innerHTML = '';
    const filtered = TOPICS.filter((t) => currentFilter === 'all' || t.category === currentFilter);
    filtered.forEach((t) => listEl.appendChild(topicRow(t)));
  }
  renderList();
}

function topicRow(t) {
  const studied = progress.topicsStudied[t.id];
  const isReady = t.status === 'ready';
  return el('div', {
    class: 'topic-item' + (studied ? ' studied' : ''),
    onClick: () => navigate('topic', { id: t.id }),
  },
    el('div', { class: 'num' }, String(t.id)),
    el('div', { class: 'body' },
      el('div', { class: 'title' }, t.title),
      el('div', {},
        categoryTag(t.category),
        el('span', { class: 'tag' }, isReady ? 'Контент готов' : 'В работе'),
        studied ? el('span', { class: 'tag', style: 'color:var(--good)' }, '✓ изучено') : null,
      ),
    ),
  );
}

// ——— ДЕТАЛЬ ТЕМЫ ———
function renderTopicDetail({ id }) {
  const t = getTopic(id);
  if (!t) return app.append(el('p', { class: 'empty' }, 'Тема не найдена.'));

  app.append(
    el('button', { class: 'btn ghost', onClick: () => navigate('topics') }, '← К списку'),
    el('h1', { class: 'h1', style: 'margin-top:14px' }, `${t.id}. ${t.title}`),
    el('div', { style: 'margin-bottom:14px' }, categoryTag(t.category)),
  );

  if (t.status !== 'ready') {
    app.append(el('div', { class: 'card empty' },
      'Контент по этой теме ещё не подготовлен. После того как появятся материалы из источников программы РГГУ, тема будет наполнена.'));
    return;
  }

  app.append(
    el('div', { class: 'card summary' }, ...t.summary.map((p) => el('p', {}, p))),
    el('div', { class: 'card' },
      el('div', { class: 'h2' }, 'Ключевые тезисы'),
      el('ul', { class: 'keypoints' }, ...t.keyPoints.map((p) => el('li', {}, p))),
    ),
    el('div', { class: 'card sources' },
      el('div', { class: 'h2' }, 'Источники'),
      ...t.sources.map((s) =>
        el('div', {}, el('a', { href: s.url, target: '_blank', rel: 'noopener' }, '↗ ' + s.title))),
    ),
    el('div', { class: 'row' },
      el('button', { class: 'btn', onClick: () => { progress.topicsStudied[t.id] = true; saveProgress(); render(); } },
        progress.topicsStudied[t.id] ? '✓ Изучено' : 'Отметить как изученное'),
      el('button', { class: 'btn secondary', onClick: () => startFlashcardsForTopic(t.id) }, 'Карточки темы'),
      el('button', { class: 'btn secondary', onClick: () => startTestForTopic(t.id) }, 'Тест по теме'),
    ),
  );

  if (t.open?.length) {
    app.append(
      el('div', { class: 'card' },
        el('div', { class: 'h2' }, 'Открытые вопросы для устного ответа'),
        ...t.open.map((o) => el('details', {},
          el('summary', { style: 'cursor:pointer;font-weight:600' }, o.q),
          el('p', { class: 'muted', style: 'margin-top:8px' }, o.model),
        )),
      ),
    );
  }
}

// ——— КАРТОЧКИ ———
let flashState = null; // { cards, idx, revealed }

function renderFlashcards() {
  if (!flashState) flashState = { cards: shuffle(allFlashcards()), idx: 0, revealed: false };
  if (flashState.cards.length === 0) {
    app.append(el('div', { class: 'empty' }, 'Карточек ещё нет — наполните хотя бы одну тему.'));
    return;
  }

  const card = flashState.cards[flashState.idx];
  const t = getTopic(card.topicId);

  app.append(
    el('h1', { class: 'h1' }, 'Карточки'),
    el('p', { class: 'muted' }, `Тема ${t.id}: ${t.title}`),
    el('div', { class: 'card flashcard', onClick: () => { flashState.revealed = !flashState.revealed; render(); } },
      el('div', { class: 'q' }, card.q),
      flashState.revealed ? el('div', { class: 'a' }, card.a) : null,
      el('div', { class: 'hint' }, flashState.revealed ? 'Клик — скрыть ответ' : 'Клик — показать ответ'),
    ),
    flashState.revealed ? topicDetailsBlock(t, false) : null,
    el('div', { class: 'nav-row' },
      el('button', { class: 'btn secondary', onClick: () => { flashState.idx = (flashState.idx - 1 + flashState.cards.length) % flashState.cards.length; flashState.revealed = false; render(); } }, '← Назад'),
      el('span', { class: 'muted nav-counter' }, `${flashState.idx + 1} / ${flashState.cards.length}`),
      el('button', { class: 'btn', onClick: () => {
        progress.flashcardsSeen[card.topicId] ||= {};
        progress.flashcardsSeen[card.topicId][card.idx] = true;
        saveProgress();
        flashState.idx = (flashState.idx + 1) % flashState.cards.length;
        flashState.revealed = false;
        render();
      } }, 'Дальше →'),
    ),
    el('div', { class: 'sub-actions' },
      el('button', { class: 'link-btn', onClick: () => { flashState = null; render(); } }, '↻ Перетасовать колоду'),
    ),
  );
}

function startFlashcardsForTopic(topicId) {
  const t = getTopic(topicId);
  flashState = { cards: shuffle((t.flashcards || []).map((c, i) => ({ ...c, topicId, idx: i }))), idx: 0, revealed: false };
  navigate('flashcards');
}

// ——— Блок "Подробнее по теме" ———
// Раскрывающийся конспект, который показывается после ответа.
// autoOpen=true — раскрыт сразу (используется при неправильном ответе).
function topicDetailsBlock(t, autoOpen) {
  const paragraphs = (t.summary || []).slice(0, 3).map((p) => el('p', {}, p));
  const points = (t.keyPoints || []).slice(0, 6).map((p) => el('li', {}, p));

  const attrs = { class: 'details-block' };
  if (autoOpen) attrs.open = '';

  return el('details', attrs,
    el('summary', { class: 'details-summary' }, '📖 Подробнее по теме'),
    el('div', { class: 'details-body' },
      el('div', { class: 'muted', style: 'margin-bottom:8px;font-size:13px;' }, `Тема ${t.id}: ${t.title}`),
      ...paragraphs,
      points.length ? el('div', { class: 'h2', style: 'font-size:15px;margin-top:12px;' }, 'Ключевые тезисы') : null,
      points.length ? el('ul', { class: 'keypoints' }, ...points) : null,
      el('div', { style: 'margin-top:12px;' },
        el('a', {
          href: '#topic?id=' + t.id,
          class: 'btn ghost',
          style: 'text-decoration:none;display:inline-block;',
        }, 'Открыть полную карточку темы →'),
      ),
    ),
  );
}

// ——— ТЕСТ (MCQ) ———
let testState = null; // { questions, idx, picked, score }

function renderTest() {
  if (!testState) testState = newTestState(allMcq());
  if (testState.questions.length === 0) {
    app.append(el('div', { class: 'empty' }, 'Вопросов теста пока нет — наполните хотя бы одну тему.'));
    return;
  }

  const q = testState.questions[testState.idx];
  const t = getTopic(q.topicId);
  const streak = progress.streak[q.topicId] || 0;
  const picked = testState.picked;
  const peeked = testState.peeked;
  const isCorrect = picked != null && picked === q.correct;

  // Когда показывать блок "Подробнее" после ответа:
  //  - если подсказка уже использована — не показываем (он уже был открыт)
  //  - если ответ неверный — раскрытым
  //  - если верный, но серия по теме < порога — свёрнутым
  //  - если верный и серия достигла порога — не показываем
  let showDetails = null; // null | 'open' | 'closed'
  if (picked != null && !peeked) {
    if (!isCorrect) showDetails = 'open';
    else if (streak < STREAK_THRESHOLD) showDetails = 'closed';
  }

  app.append(
    el('h1', { class: 'h1' }, 'Тест'),
    el('p', { class: 'muted' },
      `Вопрос ${testState.idx + 1} из ${testState.questions.length} · Тема ${t.id}: ${t.title}` +
      (streak > 0 ? ` · 🔥 серия по теме: ${streak}` : '')),
    el('div', { class: 'card mcq' },
      el('div', { class: 'q' }, q.q),

      // Подсказка до ответа: блок "Подробнее", помеченный как использованная попытка.
      peeked && picked == null
        ? el('div', { class: 'peeked-note' }, '⚠ Подсказка использована — попытка не будет засчитана в статистику.')
        : null,
      peeked && picked == null ? topicDetailsBlock(t, true) : null,

      el('div', { class: 'options', style: peeked && picked == null ? 'margin-top:14px;' : '' },
        ...q.options.map((opt, i) => {
          let cls = 'option';
          if (picked != null) {
            cls += ' disabled';
            if (i === q.correct) cls += ' correct';
            else if (i === picked) cls += ' wrong';
          }
          return el('button', {
            class: cls,
            onClick: () => {
              if (testState.picked != null) return;
              testState.picked = i;
              const correct = i === q.correct;
              if (!testState.peeked) {
                progress.mcqStats[q.topicId] ||= { correct: 0, total: 0 };
                progress.mcqStats[q.topicId].total += 1;
                if (correct) {
                  progress.mcqStats[q.topicId].correct += 1;
                  progress.streak[q.topicId] = (progress.streak[q.topicId] || 0) + 1;
                  testState.score += 1;
                } else {
                  progress.streak[q.topicId] = 0;
                }
                progress.recentAnswers ||= [];
                progress.recentAnswers.push({ correct });
                if (progress.recentAnswers.length > RECENT_WINDOW) progress.recentAnswers.shift();
                saveProgress();
              }
              render();
            },
          }, opt);
        }),
      ),

      // Кнопка "Не уверен" — только до ответа и до использования подсказки.
      picked == null && !peeked
        ? el('div', { style: 'margin-top:12px;' },
            el('button', {
              class: 'btn ghost',
              onClick: () => { testState.peeked = true; render(); },
            }, '🤔 Не уверен — показать материал'))
        : null,

      picked != null && q.explanation
        ? el('div', { class: 'explanation' }, q.explanation) : null,

      showDetails ? topicDetailsBlock(t, showDetails === 'open') : null,

      // Маленькая подсказка про адаптивную подачу, если блок скрылся из-за серии.
      picked != null && isCorrect && !peeked && streak >= STREAK_THRESHOLD
        ? el('div', { class: 'muted', style: 'margin-top:10px;font-size:13px;' },
            `✓ Верно. Серия по теме ${streak} — материал больше не показывается автоматически. Чтобы открыть конспект, перейдите к теме №${t.id}.`)
        : null,
    ),
    el('div', { class: 'row' },
      picked != null
        ? el('button', { class: 'btn', onClick: () => {
            if (testState.idx < testState.questions.length - 1) {
              testState.idx += 1; testState.picked = null; testState.peeked = false;
            } else {
              alert(`Готово. Результат: ${testState.score} из ${testState.questions.length}.`);
              testState = null;
            }
            render();
          } }, testState.idx < testState.questions.length - 1 ? 'Следующий →' : 'Завершить')
        : el('button', { class: 'btn', disabled: true }, 'Выберите вариант'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn ghost', onClick: () => { testState = null; render(); } }, 'Перезапустить'),
    ),
  );
}

function newTestState(pool, limit = null) {
  const qs = shuffle(pool);
  return { questions: limit ? qs.slice(0, limit) : qs, idx: 0, picked: null, peeked: false, score: 0 };
}

function startTestForTopic(topicId) {
  const t = getTopic(topicId);
  testState = newTestState((t.mcq || []).map((q, i) => ({ ...q, topicId, idx: i })));
  navigate('test');
}

// ——— ЕЖЕДНЕВНЫЙ МИКС ———
function renderDaily() {
  const today = new Date().toISOString().slice(0, 10);
  const flash = allFlashcards();
  const mcq = allMcq();

  app.append(
    el('h1', { class: 'h1' }, 'Ежедневный микс'),
    el('p', { class: 'muted' }, `Дата: ${today}. Микс из 5 карточек и 5 тестовых вопросов из всех готовых тем.`),
  );

  if (!flash.length && !mcq.length) {
    app.append(el('div', { class: 'empty' }, 'Пока нет готовых тем. Наполните хотя бы одну.'));
    return;
  }

  app.append(
    el('div', { class: 'card' },
      el('div', { class: 'h2' }, 'Сегодняшний набор'),
      el('p', { class: 'muted' }, 'Микс выбирается случайным образом каждый раз. Прогресс по карточкам и тесту учитывается в общей статистике.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', onClick: () => {
          flashState = { cards: shuffle(flash).slice(0, 5), idx: 0, revealed: false };
          progress.daily = { lastDate: today, doneToday: (progress.daily.lastDate === today ? progress.daily.doneToday : 0) };
          saveProgress();
          navigate('flashcards');
        } }, '5 карточек'),
        el('button', { class: 'btn', onClick: () => {
          testState = newTestState(mcq, 5);
          navigate('test');
        } }, '5 вопросов теста'),
      ),
    ),
  );
}

// ——— ИЗУЧЕНИЕ (лесенка) ———
// Линейный урок по теме: прочитать → закрепить (3 карточки) → проверить (3 теста) → готово.
let lessonState = null;
const LESSON_PRACTICE_COUNT = 3;
const LESSON_TEST_COUNT = 3;
const STAGE_LABELS = { read: '📖 Прочитать', practice: '💡 Закрепить', test: '✓ Проверить', done: '🎉 Готово' };

function renderStudy() {
  const ready = readyTopics();
  const lessons = progress.lessons || {};
  const completedCount = ready.filter((t) => lessons[t.id]?.completed).length;
  const inProgress = ready.find((t) => lessons[t.id]?.stage && !lessons[t.id]?.completed);
  const nextNew = ready.find((t) => !lessons[t.id]);

  app.append(
    el('h1', { class: 'h1' }, 'Изучение тем'),
    el('p', { class: 'muted' }, 'Лесенка: прочитать конспект → закрепить тремя карточками → проверить тремя вопросами. Можно прервать и продолжить позже.'),
    el('div', { class: 'card' },
      el('div', { class: 'row', style: 'align-items:center' },
        el('div', { style: 'flex:1' },
          el('div', { style: 'font-size:14px;color:var(--text-dim);margin-bottom:4px' }, 'Пройдено уроков'),
          el('div', { style: 'font-size:22px;font-weight:700' }, `${completedCount} / ${ready.length}`),
        ),
        inProgress
          ? el('button', { class: 'btn', onClick: () => startLesson(inProgress.id, true) }, `▶ Продолжить тему ${inProgress.id}`)
          : (nextNew
              ? el('button', { class: 'btn', onClick: () => startLesson(nextNew.id) }, `▶ Начать с темы ${nextNew.id}`)
              : el('span', { class: 'muted' }, 'Все темы пройдены ✓')),
      ),
      el('div', { class: 'progress', style: 'margin-top:12px' },
        el('span', { style: `width:${Math.round(completedCount / ready.length * 100)}%` })),
    ),
  );

  const list = el('div', { class: 'topic-list' });
  ready.forEach((t) => {
    const lesson = lessons[t.id];
    const studied = lesson?.completed;
    const inProg = lesson?.stage && !studied;
    list.appendChild(
      el('div', {
        class: 'topic-item' + (studied ? ' studied' : ''),
        onClick: () => startLesson(t.id, !!inProg),
      },
        el('div', { class: 'num' }, String(t.id)),
        el('div', { class: 'body' },
          el('div', { class: 'title' }, t.title),
          el('div', {},
            categoryTag(t.category),
            el('span', { class: 'tag' }, studied ? '✓ изучено' : (inProg ? `⏸ ${STAGE_LABELS[lesson.stage]}` : 'не начато')),
          ),
        ),
      ),
    );
  });
  app.appendChild(list);
}

function startLesson(topicId, resume = false) {
  const saved = (progress.lessons || {})[topicId];
  const startStage = (resume && saved?.stage && !saved.completed) ? saved.stage : 'read';
  lessonState = {
    topicId,
    stage: startStage,
    practiceIdx: 0,
    practiceRevealed: false,
    testIdx: 0,
    testPicked: null,
    testScore: 0,
  };
  navigate('lesson', { id: topicId });
}

function renderLesson({ id }) {
  const topicId = Number(id);
  if (!lessonState || lessonState.topicId !== topicId) startLesson(topicId, true);
  const t = getTopic(lessonState.topicId);
  if (!t || t.status !== 'ready') {
    return app.append(el('p', { class: 'empty' }, 'Тема не найдена или ещё не наполнена.'));
  }

  app.append(
    el('button', { class: 'btn ghost', onClick: () => navigate('study') }, '← К списку изучения'),
    el('h1', { class: 'h1', style: 'margin-top:14px' }, `Тема ${t.id}: ${t.title}`),
    el('div', { style: 'margin-bottom:14px' }, categoryTag(t.category)),
    lessonStepsBar(lessonState.stage),
  );

  if (lessonState.stage === 'read')     return renderLessonRead(t);
  if (lessonState.stage === 'practice') return renderLessonPractice(t);
  if (lessonState.stage === 'test')     return renderLessonTest(t);
  if (lessonState.stage === 'done')     return renderLessonDone(t);
}

function lessonStepsBar(currentStage) {
  const order = ['read', 'practice', 'test', 'done'];
  const cur = order.indexOf(currentStage);
  return el('div', { class: 'lesson-steps' },
    ...order.map((s, i) => el('div', {
      class: 'lesson-step' + (i === cur ? ' current' : '') + (i < cur ? ' done' : ''),
    }, STAGE_LABELS[s])),
  );
}

function renderLessonRead(t) {
  app.append(
    el('div', { class: 'card summary' }, ...t.summary.map((p) => el('p', {}, p))),
    el('div', { class: 'card' },
      el('div', { class: 'h2' }, 'Ключевые тезисы'),
      el('ul', { class: 'keypoints' }, ...t.keyPoints.map((p) => el('li', {}, p))),
    ),
    el('div', { class: 'card sources' },
      el('div', { class: 'h2' }, 'Источники'),
      ...t.sources.map((s) =>
        el('div', {}, el('a', { href: s.url, target: '_blank', rel: 'noopener' }, '↗ ' + s.title))),
    ),
    el('div', { class: 'lesson-actions' },
      el('button', { class: 'btn', onClick: () => advanceLesson('practice') }, 'Прочитала — закрепить карточками →'),
    ),
  );
}

function renderLessonPractice(t) {
  const cards = t.flashcards || [];
  const limit = Math.min(LESSON_PRACTICE_COUNT, cards.length);
  if (limit === 0) { advanceLesson('test'); return; }

  const card = cards[lessonState.practiceIdx];
  app.append(
    el('p', { class: 'muted', style: 'text-align:center' }, `Карточка ${lessonState.practiceIdx + 1} из ${limit}`),
    el('div', { class: 'card flashcard', onClick: () => { lessonState.practiceRevealed = !lessonState.practiceRevealed; render(); } },
      el('div', { class: 'q' }, card.q),
      lessonState.practiceRevealed ? el('div', { class: 'a' }, card.a) : null,
      el('div', { class: 'hint' }, lessonState.practiceRevealed ? 'Клик — скрыть' : 'Клик — показать ответ'),
    ),
    el('div', { class: 'lesson-actions' },
      el('button', {
        class: 'btn',
        onClick: () => {
          if (lessonState.practiceIdx + 1 < limit) {
            lessonState.practiceIdx += 1;
            lessonState.practiceRevealed = false;
            render();
          } else {
            advanceLesson('test');
          }
        },
      }, lessonState.practiceIdx + 1 < limit ? 'Понятно — следующая →' : 'Дальше — проверить тестом →'),
    ),
  );
}

function renderLessonTest(t) {
  const qs = t.mcq || [];
  const limit = Math.min(LESSON_TEST_COUNT, qs.length);
  if (limit === 0) { advanceLesson('done'); return; }

  const q = qs[lessonState.testIdx];
  const picked = lessonState.testPicked;

  app.append(
    el('p', { class: 'muted', style: 'text-align:center' }, `Вопрос ${lessonState.testIdx + 1} из ${limit}`),
    el('div', { class: 'card mcq' },
      el('div', { class: 'q' }, q.q),
      el('div', { class: 'options' },
        ...q.options.map((opt, i) => {
          let cls = 'option';
          if (picked != null) {
            cls += ' disabled';
            if (i === q.correct) cls += ' correct';
            else if (i === picked) cls += ' wrong';
          }
          return el('button', {
            class: cls,
            onClick: () => {
              if (lessonState.testPicked != null) return;
              lessonState.testPicked = i;
              if (i === q.correct) lessonState.testScore += 1;
              render();
            },
          }, opt);
        }),
      ),
      picked != null && q.explanation
        ? el('div', { class: 'explanation' }, q.explanation) : null,
      picked != null && picked !== q.correct
        ? topicDetailsBlock(t, true) : null,
    ),
    picked != null
      ? el('div', { class: 'lesson-actions' },
          el('button', {
            class: 'btn',
            onClick: () => {
              if (lessonState.testIdx + 1 < limit) {
                lessonState.testIdx += 1;
                lessonState.testPicked = null;
                render();
              } else {
                advanceLesson('done');
              }
            },
          }, lessonState.testIdx + 1 < limit ? 'Следующий →' : 'Завершить урок →'))
      : null,
  );
}

function renderLessonDone(t) {
  progress.lessons ||= {};
  progress.lessons[t.id] = { stage: 'done', completed: true };
  progress.topicsStudied[t.id] = true;
  saveProgress();

  const ready = readyTopics();
  const next = ready.find((x) => !progress.lessons[x.id]?.completed);
  const tested = Math.min(LESSON_TEST_COUNT, (t.mcq || []).length);

  app.append(
    el('div', { class: 'card', style: 'text-align:center;padding:40px 20px' },
      el('div', { style: 'font-size:48px;margin-bottom:8px' }, '🎉'),
      el('div', { class: 'h1', style: 'margin:0 0 8px' }, 'Тема изучена!'),
      el('p', { class: 'muted' }, `Результат теста: ${lessonState.testScore} из ${tested}.`),
      el('div', { class: 'lesson-actions', style: 'margin-top:16px' },
        next
          ? el('button', { class: 'btn', onClick: () => startLesson(next.id) }, `▶ Следующая тема: №${next.id}`)
          : el('span', { class: 'muted' }, '✓ Все доступные темы пройдены — поздравляю!'),
        el('button', { class: 'btn secondary', onClick: () => navigate('study') }, 'К списку изучения'),
      ),
    ),
  );
}

function advanceLesson(toStage) {
  lessonState.stage = toStage;
  // сбрасываем индексы при переходе на новый этап
  if (toStage === 'practice') { lessonState.practiceIdx = 0; lessonState.practiceRevealed = false; }
  if (toStage === 'test')     { lessonState.testIdx = 0; lessonState.testPicked = null; lessonState.testScore = 0; }
  progress.lessons ||= {};
  progress.lessons[lessonState.topicId] = { stage: toStage, completed: toStage === 'done' };
  saveProgress();
  render();
}

// ——— Старт ———
render();
