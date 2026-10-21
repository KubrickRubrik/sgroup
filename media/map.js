// @ts-check
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  const root = /** @type {HTMLElement} */ (document.getElementById('root'));
  const historyBack = /** @type {HTMLButtonElement | null} */ (document.getElementById('history-back'));
  const historyAccept = /** @type {HTMLButtonElement | null} */ (document.getElementById('history-accept'));
  const historyForward = /** @type {HTMLButtonElement | null} */ (document.getElementById('history-forward'));

  historyBack?.addEventListener('click', () => {
    vscode.postMessage({ type: 'history', direction: 'back', pageId: uiState.activePageId });
  });
  historyAccept?.addEventListener('click', () => {
    vscode.postMessage({ type: 'history', direction: 'accept', pageId: uiState.activePageId });
  });
  historyForward?.addEventListener('click', () => {
    vscode.postMessage({ type: 'history', direction: 'forward', pageId: uiState.activePageId });
  });

  const toolbarGroups = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-groups'));
  const toolbarLayout = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-layout'));
  const toolbarCreate = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-create'));
  const toolbarCollapse = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-collapse'));
  const toolbarMore = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-more'));
  const toolbarMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-menu'));
  const toolbarPanels = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-panels'));
  const toolbarPanelsMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-panels-menu'));
  const panelToggleBottom = /** @type {HTMLButtonElement | null} */ (document.getElementById('panel-toggle-bottom'));
  const panelToggleLeft = /** @type {HTMLButtonElement | null} */ (document.getElementById('panel-toggle-left'));
  const panelToggleRight = /** @type {HTMLButtonElement | null} */ (document.getElementById('panel-toggle-right'));

  toolbarLayout?.addEventListener('click', () => {
    closeToolbarMenus();
    postToolbar('toggleLayout');
  });
  toolbarGroups?.addEventListener('click', () => {
    closeToolbarMenus();
    postToolbar('cycleGroups');
  });
  toolbarCreate?.addEventListener('click', () => {
    closeToolbarMenus();
    postToolbar('createMarker');
  });
  toolbarCollapse?.addEventListener('click', () => {
    closeToolbarMenus();
    postToolbar(allTopCollapsed() ? 'expandGroups' : 'collapseGroups');
  });
  toolbarPanels?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!toolbarPanelsMenu) {
      return;
    }
    const open = toolbarPanelsMenu.hidden;
    closeToolbarMenus();
    if (open) {
      toolbarPanelsMenu.hidden = false;
      toolbarPanels?.setAttribute('aria-expanded', 'true');
    }
  });
  toolbarPanelsMenu?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target : null);
    const button = target?.closest('button');
    const action = button?.dataset.action;
    if (!action || button?.disabled) {
      return;
    }
    closeToolbarMenus();
    postToolbar(action);
  });
  toolbarMore?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!toolbarMenu) {
      return;
    }
    const open = toolbarMenu.hidden;
    closeToolbarMenus();
    if (open) {
      toolbarMenu.hidden = false;
    }
  });
  toolbarMenu?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target : null);
    const button = target?.closest('button');
    const action = button?.dataset.action;
    if (!action || button?.disabled) {
      return;
    }
    closeToolbarMenus();
    postToolbar(action);
  });
  const MIME = 'application/vnd.syn3';
  const MAX_DEPTH = 2;
  const PAGE_MIME = 'application/vnd.syn3.page';

  /** @type {{ activePageId?: string, side?: 'left' | 'right' }} */
  const uiState = vscode.getState() || {};
  const bodySide = document.body.getAttribute('data-side');
  if (bodySide === 'left' || bodySide === 'right') {
    uiState.side = bodySide;
    vscode.setState(uiState);
  }
  /** @type {any} */
  let data = null;
  const pager = /** @type {HTMLElement | null} */ (document.getElementById('pager'));
  /** @type {string | null} */
  let pageDragId = null;
  let wheelLock = false;
  /** @type {any} */
  let dragPayload = null;
  /** @type {{ section: HTMLElement, header?: HTMLElement, mode: string } | null} */
  let dropHighlight = null;

  const dropHint = el('div', 'drop-hint');
  dropHint.hidden = true;
  document.body.append(dropHint);

  const dirPopover = el('div', 'dir-popover');
  dirPopover.hidden = true;
  dirPopover.setAttribute('role', 'menu');
  document.body.append(dirPopover);

  /** @type {{ relPath: string, anchor: HTMLElement } | null} */
  let dirPopoverState = null;

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'state') {
      closeDirPopover();
      data = message;
      if (
        message.restorePage &&
        message.activePageId &&
        pages().some((page) => page.id === message.activePageId)
      ) {
        uiState.activePageId = message.activePageId;
        vscode.setState(uiState);
      }
      ensureActivePage();
      setHistoryButtons(message.history);
      setToolbar(activePage() || message);
      setPanelToggles(message.open);
      updatePageMenu();
      applyAppearance(message.appearance);
      renderPager();
      render();
      vscode.postMessage({ type: 'activePage', pageId: uiState.activePageId });
    } else if (message.type === 'openFlags') {
      if (data) {
        data.open = message.open;
      }
      setPanelToggles(message.open);
    } else if (message.type === 'openPage') {
      if (!message.pageId) {
        return;
      }
      if (pages().some((page) => page.id === message.pageId)) {
        setActivePage(message.pageId);
        return;
      }
      rememberSlide(message.pageId);
      uiState.activePageId = message.pageId;
      vscode.setState(uiState);
    } else if (message.type === 'active' && data) {
      data.active = message.active;
      updateActive(true);
    } else if (message.type === 'tabs' && data) {
      data.openPaths = Array.isArray(message.openPaths) ? message.openPaths : [];
      data.focusedPath = typeof message.focusedPath === 'string' ? message.focusedPath : '';
      applyTabMarks();
    } else if (message.type === 'dirListing') {
      fillDirPopover(message);
    }
  });

  function postToolbar(action) {
    vscode.postMessage({ type: 'toolbar', action, pageId: uiState.activePageId });
  }

  function pages() {
    return data && Array.isArray(data.pages) ? data.pages : [];
  }

  function activePage() {
    const list = pages();
    return list.find((page) => page.id === uiState.activePageId) || list[0];
  }

  function ensureActivePage() {
    const list = pages();
    if (list.length === 0) {
      return;
    }
    if (!list.some((page) => page.id === uiState.activePageId)) {
      uiState.activePageId = list[0].id;
      vscode.setState(uiState);
    }
  }

  /** 1 = next page enters from the right, -1 = previous enters from the left. */
  let pendingSlide = 0;
  let isSliding = false;
  let pageSlideToken = 0;
  let renderDeferred = false;
  let renderFromToggle = false;
  let isFolding = false;
  let foldToken = 0;
  const FOLD_MS = 200;
  const FOLD_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const FOLD_TRANSITION =
    'height ' + FOLD_MS + 'ms ' + FOLD_EASE + ', margin-top ' + FOLD_MS + 'ms ' + FOLD_EASE + ', opacity 160ms ease';
  /** @type {((event: TransitionEvent) => void) | null} */
  let slideEndHandler = null;
  let slideTimer = 0;

  function setActivePage(pageId) {
    if (!pages().some((page) => page.id === pageId) || uiState.activePageId === pageId) {
      return;
    }
    rememberSlide(pageId);
    uiState.activePageId = pageId;
    vscode.setState(uiState);
    setHistoryButtons(data && data.history);
    setToolbar(activePage() || data);
    updatePageMenu();
    renderPager();
    render();
    vscode.postMessage({ type: 'activePage', pageId });
  }

  /** Direction from the current page to `pageId`, using the list as it is now. */
  function rememberSlide(pageId) {
    const list = pages();
    const from = list.findIndex((page) => page.id === uiState.activePageId);
    const to = list.findIndex((page) => page.id === pageId);
    if (from < 0 || from === to) {
      pendingSlide = 0;
      return;
    }
    pendingSlide = to < 0 || to > from ? 1 : -1;
  }

  function consumeSlideDirection() {
    const direction = pendingSlide === 1 || pendingSlide === -1 ? pendingSlide : 0;
    pendingSlide = 0;
    return direction;
  }

  function canSlide(direction) {
    const stage = root.parentElement;
    return (
      direction !== 0 &&
      !!stage &&
      stage.classList.contains('page-stage') &&
      root.childElementCount > 0 &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function cancelSlide() {
    pageSlideToken += 1;
    isSliding = false;
    window.clearTimeout(slideTimer);
    if (slideEndHandler) {
      root.removeEventListener('transitionend', slideEndHandler);
      slideEndHandler = null;
    }
    const stage = root.parentElement;
    stage?.querySelectorAll('.page-leaving').forEach((node) => node.remove());
    root.style.transition = '';
    root.style.transform = '';
    root.classList.remove('page-entering');
    if (stage) {
      stage.style.height = '';
      stage.classList.remove('is-sliding');
    }
  }

  function pageGroups() {
    const page = activePage();
    if (!data || !page) {
      return [];
    }
    return data.groups.filter((group) => (group.page || page.id) === page.id);
  }

  function updatePageMenu() {
    const list = pages();
    const max = typeof data?.maxPages === 'number' ? data.maxPages : 3;
    const createBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('menu-create-page'));
    const deleteBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('menu-delete-page'));
    if (createBtn) {
      createBtn.disabled = list.length >= max;
    }
    if (deleteBtn) {
      deleteBtn.disabled = list.length <= 1;
    }
  }

  /** @param {Record<string, { back?: number, forward?: number }> | undefined} history */
  function setHistoryButtons(history) {
    const pageId = uiState.activePageId;
    const pageHistory = history && pageId ? history[pageId] : undefined;
    const back = pageHistory && pageHistory.back ? pageHistory.back : 0;
    const forward = pageHistory && pageHistory.forward ? pageHistory.forward : 0;
    if (historyBack) {
      historyBack.disabled = back === 0;
      historyBack.title = back ? 'Назад (' + back + ')' : 'Назад';
    }
    if (historyForward) {
      historyForward.disabled = forward === 0;
      historyForward.title = forward ? 'Вперёд (' + forward + ')' : 'Вперёд';
    }
    if (historyAccept) {
      historyAccept.hidden = back + forward === 0;
      historyAccept.title = 'Готово';
    }
  }

  function closeToolbarMenus() {
    if (toolbarMenu) {
      toolbarMenu.hidden = true;
    }
    if (toolbarPanelsMenu) {
      toolbarPanelsMenu.hidden = true;
    }
    toolbarPanels?.setAttribute('aria-expanded', 'false');
  }

  /** @param {{ layout?: string, groupsLayout?: string }} message */
  function setToolbar(message) {
    const mode = message.groupsLayout === '1' || message.groupsLayout === '2' || message.groupsLayout === '3'
      ? message.groupsLayout
      : 'flow';
    const groupTitles = {
      flow: 'Groups: Flow — click for 1 column',
      1: 'Groups: 1 column — click for 2 columns',
      2: 'Groups: 2 columns — click for 3 columns',
      3: 'Groups: 3 columns — click for flow',
    };
    if (toolbarGroups) {
      toolbarGroups.title = groupTitles[mode];
      toolbarGroups.querySelectorAll('.tool-icon').forEach((img) => {
        img.hidden = img.getAttribute('data-mode') !== mode;
      });
    }
    if (toolbarLayout) {
      toolbarLayout.title =
        message.layout === 'list' ? 'Toggle Map Layout (List / Chips)' : 'Toggle Map Layout (Chips / List)';
    }
  }

  /** @param {{ bottom?: boolean, left?: boolean, right?: boolean } | undefined} open */
  function setPanelToggles(open) {
    const flags = open || {};
    setPressed(panelToggleBottom, !!flags.bottom);
    setPressed(panelToggleLeft, !!flags.left);
    setPressed(panelToggleRight, !!flags.right);
  }

  /** @param {HTMLButtonElement | null} button @param {boolean} pressed */
  function setPressed(button, pressed) {
    if (!button) {
      return;
    }
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    button.classList.toggle('is-pressed', pressed);
  }

  function isEmptyGroup(group) {
    return (
      group.items.length === 0 &&
      (group.children || []).length === 0 &&
      (group.classes || []).length === 0 &&
      (group.notes || []).length === 0
    );
  }

  function pageCollapsed() {
    const page = activePage();
    return page && page.collapsed ? page.collapsed : {};
  }

  function isCollapsed(groupId) {
    return !!pageCollapsed()[groupId];
  }

  function isLocked(groupOrId) {
    if (typeof groupOrId === 'string') {
      const group = data?.groups?.find((item) => item.id === groupOrId);
      return !!group?.locked;
    }
    return !!groupOrId?.locked;
  }

  /** Top-level groups that can actually fold on the active page. */
  function collapsibleTopGroups() {
    return pageGroups().filter(
      (group) => !group.parent && !isEmptyGroup(group) && !isLocked(group),
    );
  }

  function allTopCollapsed() {
    const groups = collapsibleTopGroups();
    return groups.length > 0 && groups.every((group) => isCollapsed(group.id));
  }

  function setCollapseButton() {
    const groups = collapsibleTopGroups();
    const collapsed = groups.length > 0 && groups.every((group) => isCollapsed(group.id));
    const mode = collapsed ? 'expand' : 'collapse';
    if (toolbarCollapse) {
      toolbarCollapse.disabled = groups.length === 0;
      toolbarCollapse.title = collapsed ? 'Развернуть все группы' : 'Свернуть все группы';
      toolbarCollapse.setAttribute('aria-label', toolbarCollapse.title);
      toolbarCollapse.querySelectorAll('.tool-icon').forEach((img) => {
        img.hidden = img.getAttribute('data-mode') !== mode;
      });
    }
  }

  function persistCollapsed(nextCollapsed) {
    const page = activePage();
    if (!page) {
      return;
    }
    page.collapsed = nextCollapsed;
    vscode.postMessage({
      type: 'setCollapsed',
      pageId: page.id,
      collapsed: nextCollapsed,
      allTopCollapsed: allTopCollapsed(),
    });
  }

  function toggleCollapsed(groupId) {
    if (isLocked(groupId)) {
      return;
    }
    const next = { ...pageCollapsed() };
    if (next[groupId]) {
      delete next[groupId];
    } else {
      next[groupId] = true;
    }
    persistCollapsed(next);
    renderFromToggle = true;
    render();
    renderFromToggle = false;
  }

  /**
   * Parent-card gradient shapes. The slider sets the brightest stop; the rest keep this ratio.
   * Fill peak 9 → 9 / 2 / 0. Border peak 55 → 55 / 18 / 6.
   */
  const CARD_FILL_SHAPE = [9, 2, 0];
  const CARD_BORDER_SHAPE = [55, 18, 6];

  /**
   * @param {number[]} shape
   * @param {number} slider
   * @param {boolean} enabled
   */
  function scaleStops(shape, slider, enabled) {
    const peak = shape[0] || 1;
    const factor = enabled ? slider / peak : 0;
    return shape.map((stop) => Math.round(stop * factor * 10) / 10);
  }

  /** @param {number} value */
  function pct(value) {
    return String(Math.round(value * 10) / 10) + '%';
  }

  /** @param {{ fontGroup?: number, fontSubgroup?: number, fontFolder?: number, fontFile?: number, fontScale?: number, gradientDirection?: number, cardGradient?: boolean, cardFill?: number, cardBorder?: number, bgFolder?: number, bgFile?: number, bgSubgroup?: number, bgClass?: number, bgNote?: number, bgHover?: number, openFileMark?: boolean, openFileAnimate?: boolean, openFileDuration?: number } | undefined} appearance */
  function applyAppearance(appearance) {
    const a = appearance || {};
    const scale = typeof a.fontScale === 'number' ? a.fontScale : 1;
    const base = 'var(--vscode-font-size, 13px)';
    const setSize = (name, factor, fallback) => {
      const value = typeof factor === 'number' ? factor : fallback;
      document.body.style.setProperty(name, 'calc(' + base + ' * ' + value * scale + ')');
    };
    setSize('--size-group', a.fontGroup, 1.15);
    setSize('--size-subgroup', a.fontSubgroup, 1.05);
    setSize('--size-folder', a.fontFolder, 0.95);
    setSize('--size-file', a.fontFile, 0.9);
    const turn = typeof a.gradientDirection === 'number' ? a.gradientDirection : 0;
    document.body.style.setProperty('--gradient-turn', String(turn));

    const num = (value, fallback) => (typeof value === 'number' ? value : fallback);
    const gradientOn = a.cardGradient !== false;
    const fill = scaleStops(CARD_FILL_SHAPE, num(a.cardFill, 9), gradientOn);
    const border = scaleStops(CARD_BORDER_SHAPE, num(a.cardBorder, 55), gradientOn);
    document.body.style.setProperty('--card-fill-0', pct(fill[0]));
    document.body.style.setProperty('--card-fill-1', pct(fill[1]));
    document.body.style.setProperty('--card-fill-2', pct(fill[2]));
    document.body.style.setProperty('--card-border-0', pct(border[0]));
    document.body.style.setProperty('--card-border-1', pct(border[1]));
    document.body.style.setProperty('--card-border-2', pct(border[2]));

    const paints = [
      ['folder', num(a.bgFolder, 4)],
      ['file', num(a.bgFile, 5)],
      ['subgroup', num(a.bgSubgroup, 0)],
      ['class', num(a.bgClass, 8)],
      ['note', num(a.bgNote, 0)],
    ];
    for (const [name, amount] of paints) {
      document.body.style.setProperty('--bg-' + name, pct(amount));
    }
    document.body.style.setProperty('--bg-hover', pct(num(a.bgHover, 10)));
    const duration = num(a.openFileDuration, 1);
    document.body.style.setProperty('--tab-mark-duration', duration + 's');
  }

  function openFileMarks() {
    const a = data?.appearance || {};
    return {
      show: a.openFileMark !== false,
      animate: a.openFileAnimate !== false,
    };
  }

  document.addEventListener('pointerdown', (event) => {
    const target = /** @type {Node | null} */ (event.target);
    if (toolbarMenu && !toolbarMenu.hidden && target && !toolbarMenu.parentElement?.contains(target)) {
      closeToolbarMenus();
    } else if (
      toolbarPanelsMenu &&
      !toolbarPanelsMenu.hidden &&
      target &&
      !toolbarPanelsMenu.parentElement?.contains(target)
    ) {
      closeToolbarMenus();
    }
    if (!dirPopoverState) {
      return;
    }
    if (
      target &&
      (dirPopover.contains(target) || dirPopoverState.anchor.contains(target))
    ) {
      return;
    }
    closeDirPopover();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    closeToolbarMenus();
    if (dirPopoverState) {
      closeDirPopover();
    }
  });

  window.addEventListener('resize', () => {
    if (dirPopoverState) {
      positionDirPopover(dirPopoverState.anchor);
    }
  });

  document.addEventListener(
    'scroll',
    (event) => {
      if (!dirPopoverState) {
        return;
      }
      const target = /** @type {Node | null} */ (event.target);
      if (target && dirPopover.contains(/** @type {Node} */ (target))) {
        return;
      }
      closeDirPopover();
    },
    true,
  );

  document.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null) {
      endDrag();
    }
  });

  function render() {
    if (!data) {
      return;
    }
    const direction = consumeSlideDirection();
    if (isSliding && direction === 0) {
      renderDeferred = true;
      setCollapseButton();
      return;
    }
    if (isFolding && direction === 0 && !renderFromToggle) {
      renderDeferred = true;
      setCollapseButton();
      return;
    }
    renderDeferred = false;
    cancelSlide();

    /** @type {HTMLElement | null} */
    let leaving = null;
    let oldHeight = 0;
    const stage = root.parentElement;
    if (canSlide(direction) && stage) {
      oldHeight = root.offsetHeight;
      leaving = /** @type {HTMLElement} */ (root.cloneNode(true));
      leaving.removeAttribute('id');
      leaving.classList.add('page-leaving');
      leaving.setAttribute('aria-hidden', 'true');
      leaving.inert = true;
      stage.append(leaving);
    }

    paintPage();

    if (!leaving || !stage) {
      return;
    }

    const token = ++pageSlideToken;
    isSliding = true;
    const enterFrom = direction > 0 ? '100%' : '-100%';
    const leaveTo = direction > 0 ? '-100%' : '100%';
    stage.classList.add('is-sliding');
    stage.style.height = Math.max(oldHeight, root.offsetHeight) + 'px';
    root.classList.add('page-entering');
    root.style.transition = 'none';
    root.style.transform = 'translateX(' + enterFrom + ')';

    const outgoing = leaving;
    const done = () => {
      if (pageSlideToken !== token) {
        return;
      }
      pageSlideToken += 1;
      isSliding = false;
      window.clearTimeout(slideTimer);
      if (slideEndHandler) {
        root.removeEventListener('transitionend', slideEndHandler);
        slideEndHandler = null;
      }
      outgoing.remove();
      root.style.transition = '';
      root.style.transform = '';
      root.classList.remove('page-entering');
      stage.style.height = '';
      stage.classList.remove('is-sliding');
      flushDeferredRender();
    };

    slideEndHandler = (event) => {
      if (event.target !== root || event.propertyName !== 'transform') {
        return;
      }
      done();
    };
    root.addEventListener('transitionend', slideEndHandler);
    slideTimer = window.setTimeout(done, 420);

    outgoing.style.transition = 'none';
    outgoing.style.transform = 'translateX(0)';
    void stage.offsetWidth;
    const slideTiming = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)';
    root.style.transition = slideTiming;
    outgoing.style.transition = slideTiming;
    root.style.transform = 'translateX(0)';
    outgoing.style.transform = 'translateX(' + leaveTo + ')';
  }

  function paintPage() {
    const folds = captureFolds();
    foldToken += 1;
    isFolding = false;
    setCollapseButton();
    root.textContent = '';
    const page = activePage();
    const layout = page?.layout || data.layout || 'chips';
    const groupsLayout = page?.groupsLayout || data.groupsLayout || 'flow';
    root.className = 'map-page layout-' + layout + ' groups-' + groupsLayout;
    clearDropHighlights();

    if (data.error) {
      root.append(el('div', 'error', data.error));
    }
    const groups = pageGroups();
    if (groups.length === 0) {
      const emptyText =
        page?.kind === 'notes'
          ? 'No groups yet. Create a marker, then add notes inside it.'
          : 'No markers yet. Right-click a file in the Explorer → "Mark…", or drag files here onto a group.';
      root.append(el('div', 'empty', emptyText));
      return;
    }

    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    for (const group of groups.filter((g) => !g.parent)) {
      root.append(renderGroup(group, byId));
    }
    updateActive();
    applyTabMarks();
    playFolds(folds);
  }

  function flushDeferredRender() {
    if (renderDeferred && !isSliding && !isFolding) {
      renderDeferred = false;
      render();
    }
  }

  /**
   * Groups whose folded state changed since the last paint.
   * @returns {Array<{ id: string, opening: boolean, height: number, marginTop: string, snapshot: HTMLElement | null }>}
   */
  function captureFolds() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return [];
    }
    const ids = new Set(pageGroups().map((group) => group.id));
    /** @type {Array<{ id: string, opening: boolean, height: number, marginTop: string, snapshot: HTMLElement | null }>} */
    const folds = [];
    for (const section of root.querySelectorAll('section.group')) {
      if (!(section instanceof HTMLElement)) {
        continue;
      }
      const id = section.dataset.markerId || '';
      if (!ids.has(id)) {
        continue;
      }
      const wasCollapsed = section.classList.contains('collapsed');
      const nowCollapsed = isCollapsed(id);
      if (wasCollapsed === nowCollapsed) {
        continue;
      }
      const body = section.querySelector(':scope > .children');
      const opening = wasCollapsed && !nowCollapsed;
      folds.push({
        id,
        opening,
        height: body instanceof HTMLElement ? body.offsetHeight : 0,
        marginTop: body instanceof HTMLElement ? getComputedStyle(body).marginTop : '0px',
        snapshot: !opening && body instanceof HTMLElement ? /** @type {HTMLElement} */ (body.cloneNode(true)) : null,
      });
    }
    return folds;
  }

  /**
   * @param {Array<{ id: string, opening: boolean, height: number, marginTop: string, snapshot: HTMLElement | null }>} folds
   */
  function playFolds(folds) {
    if (folds.length === 0) {
      return;
    }
    /** @type {Array<{ section: HTMLElement, opening: boolean, el: HTMLElement | null, height: number, marginTop: string, dots: HTMLElement | null, dotsHeight: number, dotsMargin: string }>} */
    const jobs = [];
    for (const fold of folds) {
      const section = root.querySelector('section.group[data-marker-id="' + CSS.escape(fold.id) + '"]');
      if (!(section instanceof HTMLElement)) {
        continue;
      }
      if (fold.opening) {
        const body = section.querySelector(':scope > .children');
        if (!(body instanceof HTMLElement)) {
          continue;
        }
        jobs.push({
          section,
          opening: true,
          el: body,
          height: body.offsetHeight,
          marginTop: getComputedStyle(body).marginTop,
          dots: null,
          dotsHeight: 0,
          dotsMargin: '0px',
        });
        continue;
      }
      const dots = section.querySelector(':scope > .dots');
      const dotsEl = dots instanceof HTMLElement ? dots : null;
      jobs.push({
        section,
        opening: false,
        el: fold.snapshot,
        height: fold.height,
        marginTop: fold.marginTop,
        dots: dotsEl,
        dotsHeight: dotsEl ? dotsEl.offsetHeight : 0,
        dotsMargin: dotsEl ? getComputedStyle(dotsEl).marginTop : '0px',
      });
    }
    if (jobs.length === 0) {
      return;
    }

    const token = ++foldToken;
    isFolding = true;
    for (const job of jobs) {
      const chevron = job.section.querySelector(':scope > .group-header > .chevron');
      if (chevron instanceof HTMLElement) {
        chevron.style.transition = 'none';
        chevron.style.transform = job.opening ? 'rotate(-90deg)' : 'rotate(0deg)';
      }
      if (job.opening && job.el) {
        primeFold(job.el, '0px', '0px', '1');
      } else if (job.el) {
        job.el.setAttribute('aria-hidden', 'true');
        primeFold(job.el, job.height + 'px', job.marginTop, '1');
        if (job.dots) {
          primeFold(job.dots, '0px', '0px', '0');
          job.section.insertBefore(job.el, job.dots);
        } else {
          job.section.append(job.el);
        }
      }
    }

    void root.offsetWidth;

    for (const job of jobs) {
      const chevron = job.section.querySelector(':scope > .group-header > .chevron');
      if (chevron instanceof HTMLElement) {
        chevron.style.transition = 'transform ' + FOLD_MS + 'ms ' + FOLD_EASE;
        chevron.style.transform = job.opening ? 'rotate(0deg)' : 'rotate(-90deg)';
      }
      if (job.opening && job.el) {
        job.el.style.transition = FOLD_TRANSITION;
        job.el.style.height = job.height + 'px';
        job.el.style.marginTop = job.marginTop;
      } else if (job.el) {
        job.el.style.transition = FOLD_TRANSITION;
        job.el.style.height = '0px';
        job.el.style.marginTop = '0px';
        job.el.style.opacity = '0';
        if (job.dots) {
          job.dots.style.transition = FOLD_TRANSITION;
          job.dots.style.height = job.dotsHeight + 'px';
          job.dots.style.marginTop = job.dotsMargin;
          job.dots.style.opacity = '1';
        }
      }
    }

    window.setTimeout(() => {
      if (foldToken !== token) {
        return;
      }
      foldToken += 1;
      isFolding = false;
      for (const job of jobs) {
        if (job.opening && job.el) {
          clearFold(job.el);
        } else if (job.el) {
          job.el.remove();
        }
        if (job.dots) {
          clearFold(job.dots);
        }
        const chevron = job.section.querySelector(':scope > .group-header > .chevron');
        if (chevron instanceof HTMLElement) {
          chevron.style.transition = '';
          chevron.style.transform = '';
        }
      }
      flushDeferredRender();
    }, FOLD_MS + 80);
  }

  /**
   * @param {HTMLElement} el
   * @param {string} height
   * @param {string} marginTop
   * @param {string} opacity
   */
  function primeFold(el, height, marginTop, opacity) {
    el.style.overflow = 'hidden';
    el.style.pointerEvents = 'none';
    el.style.transition = 'none';
    el.style.height = height;
    el.style.marginTop = marginTop;
    el.style.opacity = opacity;
  }

  /** @param {HTMLElement} el */
  function clearFold(el) {
    el.style.overflow = '';
    el.style.pointerEvents = '';
    el.style.transition = '';
    el.style.height = '';
    el.style.marginTop = '';
    el.style.opacity = '';
  }

  function renderPager() {
    if (!pager) {
      return;
    }
    pager.textContent = '';
    const list = pages();
    if (list.length === 0) {
      pager.hidden = true;
      return;
    }
    pager.hidden = false;
    for (const page of list) {
      const chip = el('button', 'pager-chip' + (page.id === uiState.activePageId ? ' active' : ''), page.name);
      chip.type = 'button';
      chip.draggable = true;
      chip.dataset.pageId = page.id;
      chip.title = page.kind === 'notes' ? page.name + ' (записи)' : page.name + ' (файлы)';
      chip.addEventListener('click', () => setActivePage(page.id));
      chip.addEventListener('dragstart', (event) => {
        pageDragId = page.id;
        event.dataTransfer?.setData(PAGE_MIME, page.id);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
        }
        chip.classList.add('dragging');
      });
      chip.addEventListener('dragend', () => {
        pageDragId = null;
        chip.classList.remove('dragging');
        pager.querySelectorAll('.pager-chip').forEach((node) => node.classList.remove('drop-before', 'drop-after'));
      });
      chip.addEventListener('dragover', (event) => {
        if (!pageDragId || pageDragId === page.id) {
          return;
        }
        event.preventDefault();
        const rect = chip.getBoundingClientRect();
        const before = event.clientX < rect.left + rect.width / 2;
        chip.classList.toggle('drop-before', before);
        chip.classList.toggle('drop-after', !before);
      });
      chip.addEventListener('dragleave', () => {
        chip.classList.remove('drop-before', 'drop-after');
      });
      chip.addEventListener('drop', (event) => {
        event.preventDefault();
        chip.classList.remove('drop-before', 'drop-after');
        const from = pageDragId || event.dataTransfer?.getData(PAGE_MIME);
        if (!from || from === page.id) {
          return;
        }
        const ordered = pages().map((item) => item.id);
        const fromIndex = ordered.indexOf(from);
        let toIndex = ordered.indexOf(page.id);
        if (fromIndex < 0 || toIndex < 0) {
          return;
        }
        const rect = chip.getBoundingClientRect();
        if (event.clientX >= rect.left + rect.width / 2) {
          toIndex += 1;
        }
        ordered.splice(fromIndex, 1);
        if (fromIndex < toIndex) {
          toIndex -= 1;
        }
        ordered.splice(toIndex, 0, from);
        vscode.postMessage({ type: 'reorderPages', orderedIds: ordered });
      });
      pager.append(chip);
    }
  }

  function renderGroup(group, byId) {
    group.items.sort((a, b) => Number(b.isDir) - Number(a.isDir));
    const childIds = group.children || [];
    const classList = group.classes || [];
    const noteList = group.notes || [];
    const page = activePage();
    const isNotesPage = page?.kind === 'notes';
    const isEmpty = isEmptyGroup(group);
    const collapsed = !isEmpty && isCollapsed(group.id);
    const locked = isLocked(group);
    const columns = group.columns || 'flow';
    const section = el(
      'section',
      'group columns-' +
        columns +
        (collapsed ? ' collapsed' : '') +
        (locked ? ' locked' : '') +
        (group.depth ? ' nested node' : '') +
        (isEmpty ? ' empty-group' : '') +
        (isNotesPage ? ' notes-page' : ''),
    );
    section.dataset.markerId = group.id;
    section.dataset.depth = String(group.depth || 0);
    section.dataset.label = group.label;
    if (group.color) {
      section.style.setProperty('--group-color', group.color);
    }

    const header = el('div', 'group-header');
    header.draggable = !locked;
    setContext(header, {
      webviewSection: 'marker',
      markerId: group.id,
      depth: group.depth || 0,
      canNest: (group.depth || 0) < MAX_DEPTH,
      columns,
      hasAlias: !!group.alias,
      locked,
    });
    const bar = el('span', 'bar');
    bar.title = locked ? 'Group is locked' : 'Change color';
    bar.addEventListener('click', (event) => {
      event.stopPropagation();
      if (locked) {
        return;
      }
      openColorPicker(group.id, bar, section);
    });
    header.append(el('span', 'chevron', isEmpty ? '' : '▾'), bar);
    if (group.icon) {
      header.append(el('span', 'group-icon', group.icon));
    }
    const labelWrap = el('span', 'group-text' + (group.alias ? ' has-alias' : ''));
    if (group.alias) {
      labelWrap.append(el('span', 'alias', group.alias));
    }
    labelWrap.append(el('span', 'label', group.label));
    header.append(labelWrap);
    header.append(lockButton(group));
    header.append(
      el('span', 'count', String(group.items.length + classList.length + noteList.length + childIds.length)),
    );
    header.title =
      (group.alias ? group.alias + '\n' : '') +
      group.label +
      (locked ? '\nLocked' : '\nDrag to reorder or nest');
    trackPress(header, (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.lock-btn, .bar')) {
        return;
      }
      if (isEmpty || locked) {
        return;
      }
      toggleCollapsed(group.id);
    });
    section.append(header);
    bindGroupSection(section, header, group);

    if (isEmpty) {
      if (isNotesPage && !collapsed && !locked) {
        section.append(renderNoteComposer(group.id));
      }
      return section;
    }

    if (collapsed) {
      const dots = el('div', 'dots');
      if (isNotesPage) {
        for (const note of noteList) {
          const dot = el('span', 'dot note-dot');
          dot.title = note.text;
          dots.append(dot);
        }
      } else {
        for (const item of group.items) {
          const dot = el('span', 'dot' + (item.exists ? '' : ' missing'));
          bindItem(dot, item, group.id);
          dots.append(dot);
        }
        for (const cls of classList) {
          const dot = el('span', 'dot class-dot' + (cls.exists ? '' : ' missing'));
          bindClass(dot, cls, group.id);
          dots.append(dot);
        }
      }
      section.append(dots);
      return section;
    }

    const children = el('div', 'children');
    if (isNotesPage) {
      if (noteList.length > 0) {
        const block = el('div', 'node block block-notes');
        for (const note of noteList) {
          block.append(renderNote(note, group.id));
        }
        children.append(block);
      }
    } else {
      const dirs = group.items.filter((item) => item.isDir);
      const files = group.items.filter((item) => !item.isDir);
      for (const [kind, list] of [
        ['dirs', dirs],
        ['files', files],
      ]) {
        if (list.length === 0) {
          continue;
        }
        const block = el('div', 'node block block-' + kind);
        for (const item of list) {
          block.append(renderItem(item, group.id));
        }
        children.append(block);
      }
      if (classList.length > 0) {
        const block = el('div', 'node block block-classes');
        for (const cls of classList) {
          block.append(renderClass(cls, group.id));
        }
        children.append(block);
      }
    }
    for (const childId of childIds) {
      const child = byId[childId];
      if (child) {
        children.append(renderGroup(child, byId));
      }
    }
    if (isNotesPage && !locked) {
      children.append(renderNoteComposer(group.id));
    }
    if (children.childElementCount > 0) {
      section.append(children);
    }

    return section;
  }

  function lockButton(group) {
    const locked = isLocked(group);
    const button = el('button', 'lock-btn' + (locked ? ' is-locked' : ''));
    button.type = 'button';
    button.title = locked ? 'Unlock group' : 'Lock group';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', locked ? 'true' : 'false');
    button.append(locked ? lockClosedIcon() : lockOpenIcon());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      vscode.postMessage({ type: 'toggleLock', markerId: group.id });
    });
    button.addEventListener('dragstart', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    return button;
  }

  function linkify(text) {
    const fragment = document.createDocumentFragment();
    const pattern = /(https?:\/\/[^\s<>"']+)/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index > last) {
        fragment.append(document.createTextNode(text.slice(last, match.index)));
      }
      const url = match[1];
      const link = el('a', 'note-link', url);
      link.href = url;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        vscode.postMessage({ type: 'openExternal', url });
      });
      fragment.append(link);
      last = match.index + url.length;
    }
    if (last < text.length) {
      fragment.append(document.createTextNode(text.slice(last)));
    }
    return fragment;
  }

  function renderNote(note, groupId) {
    const locked = isLocked(groupId);
    const node = el('div', 'note');
    node.dataset.noteId = note.id;
    setContext(node, {
      webviewSection: 'note',
      markerId: groupId,
      noteId: note.id,
      locked,
    });
    const body = el('div', 'note-body');
    body.append(linkify(note.text));
    body.title = locked ? 'Group is locked' : 'Click to edit';
    body.addEventListener('click', () => {
      if (locked) {
        return;
      }
      beginEditNote(node, note, groupId);
    });
    node.append(body);
    return node;
  }

  function beginEditNote(node, note, groupId) {
    if (isLocked(groupId)) {
      return;
    }
    node.textContent = '';
    const input = /** @type {HTMLTextAreaElement} */ (el('textarea', 'note-input'));
    input.value = note.text;
    input.rows = Math.min(6, Math.max(2, note.text.split('\n').length));
    node.append(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    const finish = (save) => {
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('blur', onBlur);
      if (save) {
        vscode.postMessage({ type: 'updateNote', noteId: note.id, text: input.value });
      } else {
        const parent = node.parentElement;
        node.replaceWith(renderNote(note, groupId));
        void parent;
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        finish(true);
      }
    };
    const onBlur = () => finish(true);
    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', onBlur);
  }

  function renderNoteComposer(groupId) {
    const wrap = el('div', 'note-composer');
    const input = /** @type {HTMLTextAreaElement} */ (el('textarea', 'note-input'));
    input.rows = 2;
    input.placeholder = 'Новая запись… Enter — сохранить';
    const submit = () => {
      if (isLocked(groupId)) {
        return;
      }
      const text = input.value.trim();
      if (!text) {
        return;
      }
      vscode.postMessage({ type: 'createNote', markerId: groupId, text });
      input.value = '';
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });
    wrap.append(input);
    return wrap;
  }

  function renderItem(item, groupId) {
    const classes = ['item'];
    if (item.isDir) {
      classes.push('dir');
    }
    if (!item.exists) {
      classes.push('missing');
    }
    if (item.alias) {
      classes.push('has-alias');
    }
    const locked = isLocked(groupId);
    const node = el('div', classes.join(' '));
    node.draggable = !locked;
    const layout = activePage()?.layout || data.layout || 'chips';
    const name = layout === 'chips' && !item.isDir ? stripExtension(item.name) : item.name;
    const textWrap = el('span', 'item-text');
    if (item.alias) {
      textWrap.append(el('span', 'alias', item.alias));
    }
    textWrap.append(el('span', 'name', name));
    node.append(item.isDir ? folderIcon() : fileIcon(item.name), textWrap);
    if (layout === 'list' && item.dir) {
      node.append(el('span', 'path', item.dir));
    }
    bindItem(node, item, groupId);
    return node;
  }

  function renderClass(cls, groupId) {
    const classes = ['item', 'class-item'];
    if (!cls.exists) {
      classes.push('missing');
    }
    if (cls.alias) {
      classes.push('has-alias');
    }
    const locked = isLocked(groupId);
    const node = el('div', classes.join(' '));
    node.draggable = !locked;
    const textWrap = el('span', 'item-text');
    if (cls.alias) {
      textWrap.append(el('span', 'alias', cls.alias));
    }
    textWrap.append(el('span', 'name', cls.name));
    node.append(classIcon(), textWrap, el('span', 'path', cls.fileName));
    bindClass(node, cls, groupId);
    return node;
  }

  /**
   * Click inside a draggable row. A positioned child (the open-tab corner) makes
   * Electron drop the click and sometimes start a drag with no movement.
   * A stationary press still activates; a real drag is left alone.
   * @param {HTMLElement} node
   * @param {(event: Event) => void} onActivate
   */
  function trackPress(node, onActivate) {
    let tracking = false;
    let moved = false;
    let dragged = false;
    let activated = false;
    let x = 0;
    let y = 0;

    node.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        tracking = false;
        return;
      }
      tracking = true;
      moved = false;
      dragged = false;
      activated = false;
      x = event.clientX;
      y = event.clientY;
    });

    node.addEventListener('pointermove', (event) => {
      if (!tracking || moved || event.buttons === 0) {
        return;
      }
      if (event.clientX !== x || event.clientY !== y) {
        moved = true;
      }
    });

    node.addEventListener('pointerup', (event) => {
      if (!tracking || event.button !== 0) {
        return;
      }
      tracking = false;
      if (moved || dragged) {
        return;
      }
      activated = true;
      onActivate(event);
    });

    node.addEventListener('pointercancel', () => {
      tracking = false;
    });

    node.addEventListener(
      'dragstart',
      (event) => {
        if (!moved) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        dragged = true;
      },
      true,
    );

    node.addEventListener('click', (event) => {
      if (activated || dragged) {
        activated = false;
        dragged = false;
        event.stopPropagation();
        return;
      }
      onActivate(event);
    });
  }

  function bindItem(node, item, groupId) {
    const locked = isLocked(groupId);
    node.dataset.rel = item.relPath;
    const aliasLine = item.alias ? item.alias + '\n' : '';
    const clickHint = item.isDir
      ? 'Click: list contents · Alt+Click: reveal in Explorer'
      : 'Click: open · Alt+Click: reveal in Explorer';
    node.title =
      aliasLine +
      (item.exists ? item.relPath + '\n' + clickHint : item.relPath + '\nMissing') +
      (locked ? '\nLocked' : '\nDrag to another group · Alt+Drag to copy');
    setContext(node, {
      webviewSection: item.exists ? 'item' : 'missing',
      markerId: groupId,
      relPath: item.relPath,
      isDir: !!item.isDir,
      hasAlias: !!item.alias,
      locked,
    });
    trackPress(node, (event) => {
      event.stopPropagation();
      if (!item.exists) {
        return;
      }
      const alt = 'altKey' in event && !!event.altKey;
      if (item.isDir) {
        if (alt) {
          closeDirPopover();
          vscode.postMessage({ type: 'reveal', relPath: item.relPath });
          return;
        }
        toggleDirPopover(node, item.relPath);
        return;
      }
      vscode.postMessage({ type: alt ? 'reveal' : 'open', relPath: item.relPath });
    });
    node.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      if (isLocked(groupId)) {
        event.preventDefault();
        return;
      }
      beginDrag(
        event,
        { kind: 'item', relPath: item.relPath, from: groupId },
        'copyMove',
        item.relPath,
      );
      node.classList.add('dragging');
    });
    node.addEventListener('dragend', () => {
      node.classList.remove('dragging');
      endDrag();
    });
  }

  function toggleDirPopover(anchor, relPath) {
    if (dirPopoverState && dirPopoverState.relPath === relPath) {
      closeDirPopover();
      return;
    }
    dirPopoverState = { relPath, anchor };
    dirPopover.hidden = false;
    dirPopover.classList.add('loading');
    dirPopover.replaceChildren(el('div', 'dir-popover-status', 'Loading…'));
    positionDirPopover(anchor);
    vscode.postMessage({ type: 'listDir', relPath });
  }

  function closeDirPopover() {
    dirPopoverState = null;
    dirPopover.hidden = true;
    dirPopover.classList.remove('loading');
    dirPopover.replaceChildren();
  }

  function fillDirPopover(message) {
    if (!dirPopoverState || dirPopoverState.relPath !== message.relPath) {
      return;
    }
    if (message.error) {
      closeDirPopover();
      return;
    }
    dirPopover.classList.remove('loading');
    const entries = Array.isArray(message.entries) ? message.entries : [];
    if (entries.length === 0) {
      dirPopover.replaceChildren(el('div', 'dir-popover-status', 'Empty'));
      positionDirPopover(dirPopoverState.anchor);
      return;
    }
    const list = el('div', 'dir-popover-list');
    for (const entry of entries) {
      const row = el('div', 'dir-popover-item' + (entry.isDir ? ' dir' : ''));
      row.setAttribute('role', 'menuitem');
      row.append(entry.isDir ? folderIcon() : fileIcon(entry.name), el('span', 'name', entry.name));
      row.title = entry.relPath;
      row.addEventListener('click', (event) => {
        event.stopPropagation();
        closeDirPopover();
        vscode.postMessage({
          type: entry.isDir ? 'reveal' : 'open',
          relPath: entry.relPath,
        });
      });
      list.append(row);
    }
    dirPopover.replaceChildren(list);
    positionDirPopover(dirPopoverState.anchor);
  }

  function positionDirPopover(anchor) {
    const rect = anchor.getBoundingClientRect();
    const pad = 4;
    dirPopover.style.visibility = 'hidden';
    dirPopover.hidden = false;
    const popW = dirPopover.offsetWidth || 180;
    const popH = dirPopover.offsetHeight || 120;
    let left = rect.left;
    let top = rect.bottom + pad;
    if (left + popW > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - popW - pad);
    }
    if (top + popH > window.innerHeight - pad) {
      top = Math.max(pad, rect.top - popH - pad);
    }
    if (left < pad) {
      left = pad;
    }
    dirPopover.style.left = left + 'px';
    dirPopover.style.top = top + 'px';
    dirPopover.style.visibility = '';
  }

  function bindClass(node, cls, groupId) {
    const locked = isLocked(groupId);
    node.dataset.classId = cls.id;
    node.dataset.file = cls.relPath;
    const aliasLine = cls.alias ? cls.alias + '\n' : '';
    node.title =
      aliasLine +
      cls.name +
      ' · ' +
      cls.relPath +
      (cls.line ? ':' + cls.line : '') +
      (cls.exists ? '\nClick: open at class' : '\nMissing file') +
      (locked ? '\nLocked' : '\nDrag to another group · Alt+Drag to copy');
    setContext(node, {
      webviewSection: cls.exists ? 'class' : 'missingClass',
      markerId: groupId,
      classId: cls.id,
      relPath: cls.relPath,
      hasAlias: !!cls.alias,
      locked,
    });
    trackPress(node, (event) => {
      event.stopPropagation();
      if (!cls.exists) {
        return;
      }
      vscode.postMessage({ type: 'openClass', classId: cls.id });
    });
    node.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      if (isLocked(groupId)) {
        event.preventDefault();
        return;
      }
      beginDrag(
        event,
        { kind: 'class', classId: cls.id, from: groupId },
        'copyMove',
        cls.name,
      );
      node.classList.add('dragging');
    });
    node.addEventListener('dragend', () => {
      node.classList.remove('dragging');
      endDrag();
    });
  }

  /** Whole group section is a drop zone; nested sections stopPropagation. */
  function bindGroupSection(section, header, group) {
    header.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      if (isLocked(group)) {
        event.preventDefault();
        return;
      }
      beginDrag(
        event,
        {
          kind: 'marker',
          id: group.id,
          depth: group.depth || 0,
          subtreeHeight: group.subtreeHeight || 0,
          label: group.label,
        },
        'move',
        group.label,
      );
      section.classList.add('dragging');
    });
    header.addEventListener('dragend', () => {
      section.classList.remove('dragging');
      endDrag();
    });

    section.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = readPayload(event);
      const decision = decideDrop(event, header, group, payload);
      applyDecision(event, section, header, group, decision);
    });

    section.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = readPayload(event);
      const decision = decideDrop(event, header, group, payload);
      clearDropHighlights();
      hideDropHint();
      document.body.classList.remove('is-dragging');

      if (!decision || decision.blocked) {
        return;
      }
      if (decision.action === 'place') {
        vscode.postMessage({
          type: 'placeMarker',
          id: decision.id,
          target: group.id,
          position: decision.position,
        });
        return;
      }
      if (decision.action === 'nest') {
        vscode.postMessage({ type: 'nestMarker', id: decision.id, parent: group.id });
        return;
      }
      if (decision.action === 'item') {
        handleItemOrExternalDrop(event, group.id, payload);
      }
    });
  }

  /**
   * @returns {{ action: string, mode: string, hint: string, blocked?: boolean, id?: string, position?: string } | null}
   */
  function decideDrop(event, header, group, payload) {
    const notesPage = activePage()?.kind === 'notes';
    if (payload && payload.kind === 'marker') {
      if (payload.id === group.id) {
        return null;
      }
      if (isLocked(payload.id)) {
        return {
          action: 'place',
          mode: 'blocked',
          hint: 'Group is locked',
          blocked: true,
          id: payload.id,
        };
      }
      const overHeader = header.contains(/** @type {Node} */ (event.target)) || event.target === header;
      if (overHeader) {
        const rect = header.getBoundingClientRect();
        const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
        if (y < 0.25) {
          return {
            action: 'place',
            mode: 'before',
            hint: 'Place before "' + group.label + '"',
            id: payload.id,
            position: 'before',
          };
        }
        if (y > 0.75) {
          return {
            action: 'place',
            mode: 'after',
            hint: 'Place after "' + group.label + '"',
            id: payload.id,
            position: 'after',
          };
        }
      }
      if (isLocked(group)) {
        return {
          action: 'nest',
          mode: 'blocked',
          hint: 'Group is locked',
          blocked: true,
          id: payload.id,
        };
      }
      const nest = nestDecision(payload, group);
      if (nest.ok) {
        return {
          action: 'nest',
          mode: 'into',
          hint: 'Nest into "' + group.label + '"',
          id: payload.id,
        };
      }
      return {
        action: 'nest',
        mode: 'blocked',
        hint: nest.reason,
        blocked: true,
        id: payload.id,
      };
    }

    if ((payload && (payload.kind === 'item' || payload.kind === 'class')) || isExternal(event)) {
      if (notesPage) {
        return {
          action: 'item',
          mode: 'blocked',
          hint: 'Эта страница только для записей',
          blocked: true,
        };
      }
      if (isLocked(group)) {
        return {
          action: 'item',
          mode: 'blocked',
          hint: 'Group is locked',
          blocked: true,
        };
      }
      if (payload && (payload.kind === 'item' || payload.kind === 'class') && isLocked(payload.from)) {
        return {
          action: 'item',
          mode: 'blocked',
          hint: 'Group is locked',
          blocked: true,
        };
      }
      const copy = !!(payload && (payload.kind === 'item' || payload.kind === 'class') && event.altKey);
      const verb = copy ? 'Copy to' : 'Move to';
      return {
        action: 'item',
        mode: 'target',
        hint: verb + ' "' + group.label + '"',
      };
    }
    return null;
  }

  function nestDecision(payload, target) {
    if (isDescendant(payload.id, target.id)) {
      return { ok: false, reason: "Can't nest into own subgroup" };
    }
    const parentDepth = target.depth || 0;
    const height = payload.subtreeHeight || 0;
    if (parentDepth + 1 + height > MAX_DEPTH) {
      return { ok: false, reason: "Can't nest: max 2 levels" };
    }
    return { ok: true, reason: '' };
  }

  function applyDecision(event, section, header, group, decision) {
    moveDropHint(event.clientX, event.clientY);
    if (!decision) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
      clearDropHighlights();
      showDropHint('', true);
      return;
    }
    if (decision.blocked) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
      setDropHighlight(section, 'blocked', header);
      showDropHint(decision.hint, true);
      return;
    }
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect =
        decision.action === 'item' && event.altKey ? 'copy' : 'move';
    }
    setDropHighlight(section, decision.mode, header);
    showDropHint(decision.hint, false);
  }

  function beginDrag(event, payload, effectAllowed, plain) {
    dragPayload = payload;
    document.body.classList.add('is-dragging');
    const transfer = event.dataTransfer;
    if (!transfer) {
      return;
    }
    transfer.effectAllowed = effectAllowed;
    transfer.setData(MIME, JSON.stringify(payload));
    transfer.setData('text/plain', plain);
  }

  function endDrag() {
    dragPayload = null;
    document.body.classList.remove('is-dragging');
    clearDropHighlights();
    hideDropHint();
  }

  /**
   * @param {HTMLElement} section
   * @param {string} mode
   * @param {HTMLElement} [header]
   */
  function setDropHighlight(section, mode, header) {
    if (
      dropHighlight &&
      dropHighlight.section === section &&
      dropHighlight.mode === mode &&
      dropHighlight.header === header
    ) {
      return;
    }
    clearDropHighlights();
    dropHighlight = { section, header, mode };
    section.classList.add('drop-target');
    if (mode === 'into') {
      section.classList.add('drop-into');
    }
    if (mode === 'blocked') {
      section.classList.add('drop-blocked');
    }
    if (header && (mode === 'before' || mode === 'after' || mode === 'into')) {
      header.classList.add('drop-' + mode);
    }
  }

  function handleItemOrExternalDrop(event, to, payload) {
    if (payload && payload.kind === 'item') {
      if (payload.from === to && !event.altKey) {
        return;
      }
      vscode.postMessage({
        type: 'moveItem',
        relPath: payload.relPath,
        from: payload.from,
        to,
        copy: !!event.altKey,
      });
      return;
    }
    if (payload && payload.kind === 'class') {
      if (payload.from === to && !event.altKey) {
        return;
      }
      vscode.postMessage({
        type: 'moveClass',
        classId: payload.classId,
        from: payload.from,
        to,
        copy: !!event.altKey,
      });
      return;
    }
    const uris = readUris(event);
    if (uris.length > 0) {
      vscode.postMessage({ type: 'dropUris', uris, to });
    }
  }

  function isDescendant(ancestorId, nodeId) {
    const byId = Object.fromEntries(data.groups.map((g) => [g.id, g]));
    let current = byId[nodeId];
    while (current?.parent) {
      if (current.parent === ancestorId) {
        return true;
      }
      current = byId[current.parent];
    }
    return false;
  }

  function readPayload(event) {
    if (dragPayload) {
      return dragPayload;
    }
    const raw = event.dataTransfer?.getData(MIME);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function isExternal(event) {
    const types = event.dataTransfer ? Array.from(event.dataTransfer.types) : [];
    return types.includes('text/uri-list') || types.includes('application/vnd.code.uri-list');
  }

  function readUris(event) {
    const transfer = event.dataTransfer;
    if (!transfer) {
      return [];
    }
    const raw =
      transfer.getData('application/vnd.code.uri-list') ||
      transfer.getData('text/uri-list') ||
      transfer.getData('text/plain');
    if (!raw) {
      return [];
    }
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && /^(file|vscode-remote|vscode-vfs):/i.test(line));
  }

  function clearDropHighlights() {
    if (dropHighlight) {
      dropHighlight.section.classList.remove('drop-target', 'drop-into', 'drop-blocked');
      dropHighlight.header?.classList.remove('drop-before', 'drop-after', 'drop-into');
      dropHighlight = null;
    }
    for (const node of root.querySelectorAll('.drop-before, .drop-after, .drop-into, .drop-target, .drop-blocked')) {
      node.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-target', 'drop-blocked');
    }
  }

  function showDropHint(text, blocked) {
    if (!text) {
      hideDropHint();
      return;
    }
    dropHint.hidden = false;
    dropHint.textContent = text;
    dropHint.classList.toggle('blocked', !!blocked);
  }

  function hideDropHint() {
    dropHint.hidden = true;
    dropHint.textContent = '';
    dropHint.classList.remove('blocked');
  }

  function moveDropHint(x, y) {
    dropHint.style.left = x + 14 + 'px';
    dropHint.style.top = y + 14 + 'px';
  }

  /**
   * Corner on a badge when its file is open. The focused file's chain blinks.
   * Only the page currently painted on this panel is in the DOM.
   */
  function applyTabMarks() {
    const openPaths = Array.isArray(data?.openPaths) ? data.openPaths : [];
    const focusedPath = typeof data?.focusedPath === 'string' ? data.focusedPath : '';
    const marks = openFileMarks();
    const groups = activePage()?.kind === 'notes' ? [] : pageGroups();
    const byId = Object.fromEntries(groups.map((group) => [group.id, group]));

    for (const node of root.querySelectorAll('section.group')) {
      const section = /** @type {HTMLElement} */ (node);
      const badge = section.classList.contains('nested')
        ? section.querySelector(':scope > .group-header')
        : section;
      const group = byId[section.dataset.markerId || ''];
      if (!(badge instanceof HTMLElement)) {
        continue;
      }
      const opened = marks.show && !!group && openPaths.some((relPath) => chainHits(group, byId, relPath));
      const live = marks.animate && !!group && focusedPath !== '' && chainHits(group, byId, focusedPath);
      setTabCorner(badge, opened, live);
    }

    for (const node of root.querySelectorAll('.item')) {
      const item = /** @type {HTMLElement} */ (node);
      let opened = false;
      let live = false;
      if (item.classList.contains('class-item')) {
        const file = item.dataset.file || '';
        opened = marks.show && file !== '' && openPaths.includes(file);
        live = marks.animate && file !== '' && file === focusedPath;
      } else if (item.classList.contains('dir')) {
        const folder = item.dataset.rel || '';
        opened = marks.show && openPaths.some((relPath) => pathCovers(folder, relPath));
        live = marks.animate && focusedPath !== '' && pathCovers(folder, focusedPath);
      } else {
        const relPath = item.dataset.rel || '';
        opened = marks.show && relPath !== '' && openPaths.includes(relPath);
        live = marks.animate && relPath !== '' && relPath === focusedPath;
      }
      setTabCorner(item, opened, live);
    }
  }

  /**
   * @param {any} group
   * @param {Record<string, any>} byId
   * @param {string} relPath
   * @param {Set<string>} [seen]
   */
  function chainHits(group, byId, relPath, seen) {
    if (!group || !relPath) {
      return false;
    }
    const visited = seen || new Set();
    if (visited.has(group.id)) {
      return false;
    }
    visited.add(group.id);
    for (const item of group.items || []) {
      if (item.isDir ? pathCovers(item.relPath, relPath) : item.relPath === relPath) {
        return true;
      }
    }
    for (const cls of group.classes || []) {
      if (cls.relPath === relPath) {
        return true;
      }
    }
    for (const childId of group.children || []) {
      if (chainHits(byId[childId], byId, relPath, visited)) {
        return true;
      }
    }
    return false;
  }

  /** @param {string} folder @param {string} file */
  function pathCovers(folder, file) {
    return folder !== '' && (file === folder || file.startsWith(folder + '/'));
  }

  /** @param {HTMLElement} node @param {boolean} open @param {boolean} live */
  function setTabCorner(node, open, live) {
    const mark = node.querySelector(':scope > .tab-mark');
    if (!open) {
      mark?.remove();
      return;
    }
    const corner = mark instanceof HTMLElement ? mark : document.createElement('span');
    if (!mark) {
      corner.className = 'tab-mark';
      corner.setAttribute('aria-hidden', 'true');
      node.prepend(corner);
    }
    corner.classList.toggle('tab-mark-live', live);
  }

  /** @param {boolean} [scroll] */
  function updateActive(scroll) {
    let first = null;
    for (const node of root.querySelectorAll('[data-rel]')) {
      const element = /** @type {HTMLElement} */ (node);
      const isActive = element.dataset.rel === data.active;
      element.classList.toggle('active', isActive);
      if (isActive && !first) {
        first = element;
      }
    }
    if (scroll && first) {
      first.scrollIntoView({ block: 'nearest' });
    }
  }

  function setContext(node, context) {
    node.dataset.vscodeContext = JSON.stringify({ ...context, preventDefaultContextMenuItems: true });
  }

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'color-input';
  colorInput.tabIndex = -1;
  document.body.append(colorInput);

  /** @type {{ markerId: string, section: HTMLElement } | null} */
  let colorTarget = null;

  colorInput.addEventListener('input', () => {
    colorTarget?.section.style.setProperty('--group-color', colorInput.value);
  });
  colorInput.addEventListener('change', () => {
    if (colorTarget) {
      vscode.postMessage({ type: 'setColor', markerId: colorTarget.markerId, color: colorInput.value });
    }
    colorTarget = null;
  });

  /** Opens the system color picker; must be called from a user gesture. */
  function openColorPicker(markerId, bar, section) {
    const rect = bar.getBoundingClientRect();
    colorInput.style.left = rect.left + 'px';
    colorInput.style.top = rect.bottom + 'px';
    colorInput.value = toHex(getComputedStyle(bar).backgroundColor) || '#8b8d98';
    colorTarget = { markerId, section };
    if (typeof colorInput.showPicker === 'function') {
      try {
        colorInput.showPicker();
        return;
      } catch {
        // Fall back to click() below.
      }
    }
    colorInput.click();
  }

  function toHex(cssColor) {
    const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(cssColor);
    if (!match) {
      return undefined;
    }
    return (
      '#' +
      match
        .slice(1, 4)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
    );
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const FOLDER_COLOR = '#E8B53A';
  const DEFAULT_FILE_COLOR = '#8A8F98';

  /** Colors follow the usual language/brand colors of file icon themes. */
  const FILE_COLORS = {
    dart: '#40C4FF',
    ts: '#3178C6',
    tsx: '#3178C6',
    js: '#E8D44D',
    jsx: '#E8D44D',
    mjs: '#E8D44D',
    cjs: '#E8D44D',
    json: '#CBCB41',
    yaml: '#CB6E3B',
    yml: '#CB6E3B',
    md: '#519ABA',
    kt: '#A97BFF',
    kts: '#A97BFF',
    java: '#E76F00',
    swift: '#F05138',
    gradle: '#4DB6AC',
    xml: '#E37933',
    plist: '#E37933',
    html: '#E44D26',
    css: '#42A5F5',
    scss: '#CD6799',
    sh: '#89E051',
    zsh: '#89E051',
    png: '#A074C4',
    jpg: '#A074C4',
    jpeg: '#A074C4',
    svg: '#FFB13B',
    arb: '#40C4FF',
    lock: DEFAULT_FILE_COLOR,
  };

  function lockClosedIcon() {
    return svgIcon('icon lock-icon', [
      [
        'path',
        {
          d: 'M13 7h.5c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5h-8c-.83 0-1.5-.67-1.5-1.5v-5C3.5 7.67 4.17 7 5 7H5.5V5.5C5.5 3.57 7.07 2 9 2s3.5 1.57 3.5 3.5V7zm-5.5 0h4V5.5c0-1.1-.9-2-2-2s-2 .9-2 2V7zM5 8.5v5h8v-5H5z',
          fill: 'currentColor',
        },
      ],
    ]);
  }

  function lockOpenIcon() {
    return svgIcon('icon lock-icon', [
      [
        'path',
        {
          d: 'M5 7h8.5c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5h-8C4.17 15 3.5 14.33 3.5 13.5v-5C3.5 7.67 4.17 7 5 7zm6.5-1.5V7H10V5.5c0-1.1.9-2 2-2s2 .9 2 2V6h1.5V5.5C15.5 3.57 13.93 2 12 2s-3.5 1.57-3.5 3.5zM5 8.5v5h8v-5H5z',
          fill: 'currentColor',
        },
      ],
    ]);
  }

  function folderIcon() {
    return svgIcon('icon folder-icon', [
      [
        'path',
        {
          d: 'M1.5 3.5A1 1 0 0 1 2.5 2.5h3.6l1.5 1.5h5.9a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z',
          fill: FOLDER_COLOR,
        },
      ],
      [
        'path',
        {
          d: 'M1.5 5.5h13v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z',
          fill: FOLDER_COLOR,
          opacity: '0.85',
        },
      ],
    ]);
  }

  function classIcon() {
    return svgIcon('icon class-icon', [
      [
        'path',
        {
          d: 'M3 2.5h7.5L13 5v8.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5z',
          fill: 'var(--group-color)',
          'fill-opacity': '0.2',
          stroke: 'var(--group-color)',
          'stroke-width': '1',
        },
      ],
      ['circle', { cx: '8', cy: '9', r: '2.2', fill: 'var(--group-color)' }],
      [
        'path',
        {
          d: 'M8 4.2v1.4M8 12.4v1.4M4.2 9H5.6M10.4 9h1.4M5.4 6.4l1 1M9.6 10.6l1 1M10.6 6.4l-1 1M6.4 10.6l-1 1',
          stroke: 'var(--group-color)',
          'stroke-width': '1',
          'stroke-linecap': 'round',
        },
      ],
    ]);
  }

  function fileIcon(name) {
    const index = name.lastIndexOf('.');
    const ext = index > 0 ? name.slice(index + 1).toLowerCase() : '';
    const color = FILE_COLORS[ext] || DEFAULT_FILE_COLOR;
    return svgIcon('icon file-icon', [
      [
        'path',
        {
          d: 'M3.5 1.5h6l3 3v9.5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z',
          fill: color,
          'fill-opacity': '0.22',
          stroke: color,
          'stroke-width': '1',
        },
      ],
      ['path', { d: 'M9.5 1.5v3h3', fill: 'none', stroke: color, 'stroke-width': '1' }],
      ['rect', { x: '5', y: '8', width: '5', height: '1.2', rx: '0.6', fill: color }],
      ['rect', { x: '5', y: '10.5', width: '3.5', height: '1.2', rx: '0.6', fill: color }],
    ]);
  }

  function svgIcon(className, shapes) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of shapes) {
      const shape = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) {
        shape.setAttribute(key, value);
      }
      svg.append(shape);
    }
    return svg;
  }

  function stripExtension(name) {
    const index = name.lastIndexOf('.');
    return index > 0 ? name.slice(0, index) : name;
  }

  /** @returns {HTMLElement} */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  const scrollbar = el('div', 'syn3-scrollbar');
  const scrollbarThumb = el('div', 'syn3-scrollbar-thumb');
  scrollbar.hidden = true;
  scrollbar.append(scrollbarThumb);
  document.body.append(scrollbar);

  function updateScrollbar() {
    const doc = document.documentElement;
    const scrollHeight = doc.scrollHeight;
    const clientHeight = doc.clientHeight;
    const max = scrollHeight - clientHeight;
    if (max <= 1) {
      scrollbar.hidden = true;
      return;
    }
    scrollbar.hidden = false;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * clientHeight);
    const top = (doc.scrollTop / max) * (clientHeight - thumbHeight);
    scrollbarThumb.style.height = thumbHeight + 'px';
    scrollbarThumb.style.transform = 'translateY(' + top + 'px)';
  }

  window.addEventListener('scroll', updateScrollbar, { passive: true });
  window.addEventListener('resize', updateScrollbar);
  new ResizeObserver(updateScrollbar).observe(document.body);
  updateScrollbar();

  document.addEventListener(
    'wheel',
    (event) => {
      if (!data || pages().length < 2) {
        return;
      }
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
        return;
      }
      event.preventDefault();
      if (wheelLock) {
        return;
      }
      wheelLock = true;
      const list = pages();
      const index = list.findIndex((page) => page.id === uiState.activePageId);
      if (index >= 0) {
        const next = event.deltaX > 0 ? index + 1 : index - 1;
        if (next >= 0 && next < list.length) {
          setActivePage(list[next].id);
        }
      }
      window.setTimeout(() => {
        wheelLock = false;
      }, 320);
    },
    { passive: false },
  );

  vscode.postMessage({ type: 'ready', pageId: uiState.activePageId });
})();
