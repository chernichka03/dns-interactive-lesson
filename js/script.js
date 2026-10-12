/* Browser-local learning state. No requests, account, storage, or analytics. */
(() => {
  'use strict';
  const lesson = window.DNSLesson;
  if (!lesson) return;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
  const questions = [lesson.mini, lesson.case, lesson.caseFollowup, ...lesson.checks];
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const answers = new Map();
  let currentStep = 1;
  let currentRows = [];

  // Use the rendered card edges, so arrows keep their spacing after resize or zoom.
  function networkRoutes(boxes) {
    const { browser: b, cache: c, resolver: r, server: s } = boxes;
    const gap = 12;
    const queryStart = { x: b.right + gap, y: b.cy + 16 };
    const queryEnd = { x: r.left - gap, y: r.cy };
    const queryTail = { x: queryEnd.x - 22, y: queryEnd.y };
    const controlStart = { x: queryStart.x + 30, y: queryStart.y + 40 };
    const controlEnd = { x: queryTail.x - 10, y: queryTail.y };
    return {
      local: `M${b.cx} ${b.bottom + gap} L${c.cx} ${c.top - gap}`,
      query: `M${queryStart.x} ${queryStart.y} C${controlStart.x} ${controlStart.y} ${controlEnd.x} ${controlEnd.y} ${queryTail.x} ${queryTail.y} L${queryEnd.x} ${queryEnd.y}`,
      answer: `M${queryEnd.x} ${queryEnd.y} L${queryTail.x} ${queryTail.y} C${controlEnd.x} ${controlEnd.y} ${controlStart.x} ${controlStart.y} ${queryStart.x} ${queryStart.y}`,
      web: `M${b.right + gap} ${b.cy} L${s.left - gap} ${s.cy}`,
      dnsLabel: { x: (b.right + r.left) / 2, y: (b.bottom + r.top) / 2 - 8 },
      webLabel: { x: (b.right + s.left) / 2, y: Math.min(b.cy, s.cy) - 18 }
    };
  }

  const networkDiagram = $('#network-diagram');
  const networkLines = $('.network-lines');
  function layoutNetworkDiagram() {
    if (!networkDiagram || !networkLines || typeof networkDiagram.getBoundingClientRect !== 'function') return;
    const bounds = networkDiagram.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    networkDiagram.classList.toggle('is-compact', bounds.width < 560);
    const frame = networkDiagram.getBoundingClientRect();
    const boxes = {};
    $$('.network-node').forEach((node) => {
      const rect = node.getBoundingClientRect();
      boxes[node.dataset.node] = {
        left: rect.left - frame.left, right: rect.right - frame.left,
        top: rect.top - frame.top, bottom: rect.bottom - frame.top,
        cx: (rect.left + rect.right) / 2 - frame.left,
        cy: (rect.top + rect.bottom) / 2 - frame.top
      };
    });
    const routes = networkRoutes(boxes);
    networkLines.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);
    $$('.flow-line').forEach((path) => path.setAttribute('d', routes[path.dataset.path]));
    [['dns', routes.dnsLabel], ['web', routes.webLabel]].forEach(([name, point]) => {
      const label = $(`.wire-label[data-label="${name}"]`);
      label.setAttribute('x', point.x);
      label.setAttribute('y', point.y);
    });
  }

  if (networkDiagram && typeof networkDiagram.getBoundingClientRect === 'function') {
    let layoutFrame = 0;
    const scheduleLayout = () => {
      if (layoutFrame) return;
      layoutFrame = window.requestAnimationFrame(() => {
        layoutFrame = 0;
        layoutNetworkDiagram();
      });
    };
    layoutNetworkDiagram();
    window.addEventListener('resize', scheduleLayout);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(scheduleLayout);
      observer.observe(networkDiagram);
      $$('.network-node').forEach((node) => observer.observe(node));
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleLayout);
  }

  function showStep(number, animate = true) {
    currentStep = Math.max(1, Math.min(lesson.steps.length, number));
    const step = lesson.steps[currentStep - 1];
    $$('.step-tab').forEach((button) => {
      if (Number(button.dataset.step) === currentStep) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    $$('.network-node').forEach((node) => node.classList.toggle('is-active', step.nodes.includes(node.dataset.node)));
    $$('.flow-line').forEach((line) => line.classList.toggle('is-active', line.dataset.path === step.path));
    networkDiagram.classList.toggle('is-returning', step.path === 'answer');
    $('#step-count').textContent = `ШАГ ${currentStep} / ${lesson.steps.length}`;
    $('#step-title').textContent = step.title;
    $('#step-text').textContent = step.text;
    $('#step-detail').textContent = step.detail;
    $('#flow-prev').disabled = currentStep === 1;
    $('#flow-next').disabled = currentStep === lesson.steps.length;
    const packet = $('#dns-packet');
    const motion = $('#packet-motion');
    const path = step.path ? $(`.flow-line[data-path="${step.path}"]`) : null;
    packet.hidden = true;
    packet.setAttribute('visibility', 'hidden');
    if (animate && !reducedMotion && path && typeof motion.beginElement === 'function') {
      motion.setAttribute('path', path.getAttribute('d'));
      packet.hidden = false;
      packet.setAttribute('visibility', 'visible');
      motion.beginElement();
    }
  }

  $$('.step-tab').forEach((button) => button.addEventListener('click', () => showStep(Number(button.dataset.step))));
  $('#flow-next').addEventListener('click', () => showStep(currentStep + 1));
  $('#flow-prev').addEventListener('click', () => showStep(currentStep - 1));
  $('#flow-reset').addEventListener('click', () => showStep(1, false));

  function resetQuestion(id) {
    const root = document.getElementById(id);
    if (!root) return;
    answers.delete(id);
    [...root.querySelectorAll('.answer')].forEach((button) => {
      button.setAttribute('aria-pressed', 'false');
      button.classList.remove('selected', 'correct', 'try-again');
      button.querySelector('.answer-mark').textContent = '';
    });
    const feedback = document.getElementById(`${id}-feedback`);
    feedback.textContent = '';
    feedback.hidden = true;
    feedback.classList.remove('success');
  }

  function updateCase() {
    const firstCorrect = answers.get(lesson.case.id) === true;
    $('#case-evidence').hidden = !firstCorrect;
    if (!firstCorrect) resetQuestion(lesson.caseFollowup.id);
    $('#case-conclusion').hidden = !(firstCorrect && answers.get(lesson.caseFollowup.id) === true);
  }

  function updateCheckSummary() {
    const count = lesson.checks.filter((q) => answers.get(q.id) === true).length;
    const checked = lesson.checks.filter((q) => answers.has(q.id)).length;
    const summary = $('#check-summary');
    summary.classList.toggle('completed', count === lesson.checks.length);
    if (count === lesson.checks.length) summary.textContent = '3 из 3. Главные идеи понятны. Попробуй объяснить путь от имени к адресу без подсказок.';
    else if (checked) summary.textContent = `Сейчас верно: ${count} из 3. Ответы можно изменить. Используй пояснения, чтобы разобраться.`;
    else summary.textContent = '';
  }

  function answerQuestion(id, optionIndex) {
    const question = questionMap.get(id);
    const option = question && question.options[optionIndex];
    if (!option) return;
    const root = document.getElementById(id);
    const buttons = [...root.querySelectorAll('.answer')];
    buttons.forEach((button, index) => {
      const selected = index === optionIndex;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('selected', selected);
      button.classList.toggle('correct', selected && option.correct);
      button.classList.toggle('try-again', selected && !option.correct);
      button.querySelector('.answer-mark').textContent = selected && option.correct ? '✓' : '';
    });
    answers.set(id, option.correct);
    const feedback = document.getElementById(`${id}-feedback`);
    feedback.textContent = option.feedback;
    feedback.hidden = false;
    feedback.classList.toggle('success', option.correct);
    if (id === lesson.mini.id) $('#mini-continue').hidden = !option.correct;
    if (id === lesson.case.id || id === lesson.caseFollowup.id) updateCase();
    if (lesson.checks.some((q) => q.id === id)) updateCheckSummary();
  }

  $$('.question').forEach((root) => [...root.querySelectorAll('.answer')].forEach((button) => {
    button.addEventListener('click', () => answerQuestion(root.dataset.question, Number(button.dataset.option)));
  }));

  $('#case-reset').addEventListener('click', () => {
    resetQuestion(lesson.case.id);
    resetQuestion(lesson.caseFollowup.id);
    updateCase();
    $('#global-status').textContent = 'Кейс сброшен. Можно выбрать первый диагностический шаг.';
  });

  $$('[data-prediction]').forEach((button) => button.addEventListener('click', () => {
    $$('[data-prediction]').forEach((choice) => choice.setAttribute('aria-pressed', String(choice === button)));
    const response = $('#prediction-feedback');
    response.hidden = false;
    response.textContent = 'Всем спасибо за ответ! Теперь давайте разберёмся, как это работает.';
  }));

  function setLookupExplanation(row) {
    $$('.terminal-row').forEach((button) => button.setAttribute('aria-pressed', String(button.id === row.id)));
    $('#lookup-insight-title').textContent = row.title;
    $('#lookup-insight-text').textContent = row.explanation;
  }

  function resetTerminal() {
    currentRows = [];
    $('#lookup-output').replaceChildren();
    $('#lookup-output').hidden = true;
    $('#terminal-placeholder').hidden = false;
    $('#lookup-insight-title').textContent = 'Что означает каждая строка?';
    $('#lookup-insight-text').textContent = 'Вверху - DNS-сервер, к которому обратились. Ниже - ответ для запрошенного имени. Выполни пример и нажми на любую строку.';
  }

  function executeLookup() {
    const scenario = lesson.terminal[$('#lookup-scenario').value] || lesson.terminal.google;
    resetTerminal();
    currentRows = scenario.rows;
    $('#lookup-command').textContent = scenario.command;
    const output = $('#lookup-output');
    currentRows.forEach((row) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = row.id;
      button.className = 'terminal-row';
      button.textContent = row.text;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${row.text.trim()}. Разобрать: ${row.title}`);
      button.addEventListener('click', () => setLookupExplanation(row));
      output.append(button);
    });
    output.hidden = false;
    $('#terminal-placeholder').hidden = true;
  }

  $('#lookup-form').addEventListener('submit', (event) => {event.preventDefault();executeLookup();});
  $('#lookup-scenario').addEventListener('change', () => {
    resetTerminal();
    const scenario = lesson.terminal[$('#lookup-scenario').value] || lesson.terminal.google;
    $('#lookup-command').textContent = scenario.command;
  });

  const menu = $('#menu-toggle');
  function closeMenu() {menu.setAttribute('aria-expanded', 'false');$('#main-nav').classList.remove('is-open');}
  menu.addEventListener('click', () => {
    const expanded = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(expanded));
    $('#main-nav').classList.toggle('is-open', expanded);
  });
  $$('#main-nav a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => {if(event.key === 'Escape') closeMenu();});

  $('#lesson-repeat').addEventListener('click', () => {
    questions.forEach((question) => resetQuestion(question.id));
    $('#mini-continue').hidden = true;
    updateCase();
    updateCheckSummary();
    showStep(1, false);
    $('#lookup-scenario').value = 'google';
    $('#lookup-command').textContent = lesson.terminal.google.command;
    resetTerminal();
    $$('[data-prediction]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
    $('#prediction-feedback').hidden = true;
    $('#prediction-feedback').textContent = '';
    $$('details').forEach((detail) => {detail.open = false;});
    closeMenu();
    const home = $('#home');
    home.scrollIntoView({behavior:reducedMotion ? 'auto' : 'smooth',block:'start'});
    $('#global-status').textContent = 'Урок начат заново. Учебные задания и симуляция сброшены.';
    const heading = $('#home h1');
    heading.setAttribute('tabindex','-1');
    heading.focus({preventScroll:true});
  });

  const navLinks = $$('#main-nav a');
  const navTargets = navLinks.map((link) => ({link,element:document.querySelector(link.getAttribute('href'))}));
  let scrollScheduled = false;
  function updateReadingPosition() {
    scrollScheduled = false;
    const scroll = window.scrollY || 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    $('#reading-progress').style.width = `${max > 0 ? Math.min(100, Math.max(0,scroll / max * 100)) : 0}%`;
    let current = navTargets[0];
    navTargets.forEach((target) => {if(target.element.getBoundingClientRect().top <= 160)current=target;});
    navLinks.forEach((link) => {if(link===current.link)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
  }
  window.addEventListener('scroll', () => {
    if (!scrollScheduled) {scrollScheduled=true;window.requestAnimationFrame(updateReadingPosition);}
  },{passive:true});
  window.addEventListener('resize', updateReadingPosition,{passive:true});
  showStep(1,false);
  updateReadingPosition();
})();
