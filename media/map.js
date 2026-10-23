// @ts-check
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  const root = /** @type {HTMLElement} */ (document.getElementById('root'));
  const historyBack = /** @type {HTMLButtonElement | null} */ (document.getElementById('history-back'));
  const historyAccept = /** @type {HTMLButtonElement | null} */ (document.getElementById('history-accept'));
  const historyForward = /** @type {HTMLButtonElement | null} */ (document.getElementById('history-forward'));

  /** @type {Record<string, string>} */
  let i18nBag = {};
  /** @param {string} key */
  function t(key) {
    return i18nBag[key] || key;
  }

  historyBack?.addEventListener('click', () => {
    vscode.postMessage({ type: 'history', direction: 'back', pageId: uiState.activePageId });
  });
  historyAccept?.addEventListener('click', () => {
    vscode.postMessage({ type: 'history', direction: 'accept', pageId: uiState.activePageId });
  });
  historyForward?.addEventListener('click', () => {
    vscode.postMessage({ type: 'history', direction: 'forward', pageId: uiState.activePageId });
  });

  const toolbarView = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-view'));
  const toolbarViewMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-view-menu'));
  const toolbarViewWrap = /** @type {HTMLElement | null} */ (document.querySelector('.toolbar-view:not(.toolbar-create)'));
  const toolbarCreate = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-create'));
  const toolbarCreateMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-create-menu'));
  const toolbarCreateWrap = /** @type {HTMLElement | null} */ (document.querySelector('.toolbar-create'));
  const toolbarCollapse = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-collapse'));
  const toolbarMore = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-more'));
  const toolbarMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-menu'));
  const toolbarMoreWrap = /** @type {HTMLElement | null} */ (document.querySelector('.toolbar-more'));
  const toolbarFormatWrap = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-format-wrap'));
  const toolbarFormat = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-format'));
  const toolbarFormatMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-format-menu'));
  const toolbarProfile = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-profile'));
  const toolbarProfileMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-profile-menu'));
  const toolbarProfileList = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-profile-list'));
  const toolbarProfileName = /** @type {HTMLInputElement | null} */ (document.getElementById('toolbar-profile-name'));
  const toolbarProfileAdd = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-profile-add'));
  const toolbarProfileWrap = /** @type {HTMLElement | null} */ (document.querySelector('.toolbar-profile'));
  const toolbarPanels = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-panels'));
  const toolbarPanelsMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-panels-menu'));
  const panelToggleBottom = /** @type {HTMLButtonElement | null} */ (document.getElementById('panel-toggle-bottom'));
  const panelToggleLeft = /** @type {HTMLButtonElement | null} */ (document.getElementById('panel-toggle-left'));
  const panelToggleRight = /** @type {HTMLButtonElement | null} */ (document.getElementById('panel-toggle-right'));

  /** Floating context menu for map targets. */
  const contextMenu = document.createElement('div');
  contextMenu.className = 'syn3-menu syn3-context-menu';
  contextMenu.hidden = true;
  contextMenu.setAttribute('role', 'menu');
  contextMenu.setAttribute('aria-label', 'Context menu');
  document.body.append(contextMenu);

  /** @type {{ kind: 'toolbar' | 'toolbar-create' | 'context', viewExpanded: boolean, createExpanded?: boolean, deleteExpanded?: boolean, ctx?: Record<string, unknown>, x?: number, y?: number } | null} */
  let openMenuState = null;
  const MENU_CLOSE_MS = 300;
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const menuCloseTimers = new Map();

  /** @type {{ noteId: string, input: HTMLElement, lastSaved: string, locked: boolean } | null} */
  let activeNoteEdit = null;
  /** Last note edited — survives blur race with host Cmd/A. */
  let lastNoteEditId = '';
  /** Expand-then-edit: note id + how many paints left to re-focus (local + host state). */
  let pendingEditAfterExpandId = '';
  let pendingEditAfterExpandPaints = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let noteBlurTimer = null;
  /** @type {{ bold: boolean, quote: boolean, color: string | null }} */
  let pendingNoteMarks = { bold: false, quote: false, color: null };
  /** @type {Range | null} */
  let savedNoteSelection = null;
  let linkPreviewRequest = 0;
  /** @type {string | null} */
  let linkPreviewPendingId = null;
  /** @type {HTMLElement | null} */
  let linkPreviewEl = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let linkPreviewHideTimer = null;
  /** @type {string | null} */
  let linkPreviewUrl = null;
  let clipboardRequestId = 0;
  /** @type {{ ctx: Record<string, unknown>, x: number, y: number, requestId: string } | null} */
  let pendingClipboardMenu = null;
  /** Last language-bearing clipboard stamp from the host. */
  /** @type {{ text: string, languageId: string, label: string } | null} */
  let codeStamp = null;
  let themeGeneration = 0;
  let highlightRequestId = 0;

  /** @param {string} [id] */
  function cancelMenuClose(id) {
    if (id) {
      const timer = menuCloseTimers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        menuCloseTimers.delete(id);
      }
      return;
    }
    for (const timer of menuCloseTimers.values()) {
      clearTimeout(timer);
    }
    menuCloseTimers.clear();
  }

  /**
   * @param {string} id
   * @param {() => void} fn
   */
  function scheduleMenuClose(id, fn) {
    cancelMenuClose(id);
    menuCloseTimers.set(
      id,
      setTimeout(() => {
        menuCloseTimers.delete(id);
        fn();
      }, MENU_CLOSE_MS),
    );
  }

  const toolbarPanelsWrap = /** @type {HTMLElement | null} */ (document.querySelector('.toolbar-panels'));

  toolbarView?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!toolbarViewMenu) {
      return;
    }
    const open = toolbarViewMenu.hidden;
    cancelMenuClose();
    closeToolbarMenus();
    closeContextMenu();
    if (open) {
      openToolbarViewMenu();
    }
  });
  toolbarViewWrap?.addEventListener('mouseenter', () => {
    cancelMenuClose('toolbar-view');
  });
  toolbarViewWrap?.addEventListener('mouseleave', () => {
    if (toolbarViewMenu && !toolbarViewMenu.hidden) {
      scheduleMenuClose('toolbar-view', () => closeToolbarViewMenu());
    }
  });
  toolbarCreate?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!toolbarCreateMenu) {
      return;
    }
    const open = toolbarCreateMenu.hidden;
    cancelMenuClose();
    closeToolbarMenus();
    closeContextMenu();
    if (open) {
      openToolbarCreateMenu();
    }
  });
  toolbarCreateWrap?.addEventListener('mouseenter', () => {
    cancelMenuClose('toolbar-create');
  });
  toolbarCreateWrap?.addEventListener('mouseleave', () => {
    if (toolbarCreateMenu && !toolbarCreateMenu.hidden) {
      scheduleMenuClose('toolbar-create', () => closeToolbarCreateMenu());
    }
  });
  toolbarCreateMenu?.addEventListener('click', (event) => {
    handleSyn3MenuClick(event, 'toolbar-create');
  });
  toolbarFormatWrap?.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  toolbarFormatWrap?.addEventListener('mouseenter', () => {
    if (!activeNoteEdit) {
      return;
    }
    cancelMenuClose('toolbar-format');
    openFormatMenu();
  });
  toolbarFormatWrap?.addEventListener('mouseleave', () => {
    if (toolbarFormatMenu && !toolbarFormatMenu.hidden) {
      scheduleMenuClose('toolbar-format', () => closeFormatMenu());
    }
  });
  toolbarFormat?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!activeNoteEdit || !toolbarFormatMenu) {
      return;
    }
    if (toolbarFormatMenu.hidden) {
      openFormatMenu();
    } else {
      closeFormatMenu();
    }
  });
  toolbarFormatMenu?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('[data-fmt]');
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const fmt = button.dataset.fmt;
    if (fmt === 'bold') {
      toggleBoldFormat();
    } else if (fmt === 'quote') {
      toggleQuoteFormat();
    } else if (fmt === 'code') {
      toggleCodeBlock();
    } else if (fmt === 'color') {
      openTextColorPicker();
    }
    updateFormatMenuState();
  });
  toolbarCollapse?.addEventListener('click', () => {
    cancelMenuClose();
    closeToolbarMenus();
    closeContextMenu();
    postToolbar(allTopCollapsed() ? 'expandGroups' : 'collapseGroups');
  });
  toolbarPanels?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!toolbarPanelsMenu) {
      return;
    }
    const open = toolbarPanelsMenu.hidden;
    cancelMenuClose();
    closeToolbarMenus();
    closeContextMenu();
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
    cancelMenuClose();
    closeToolbarMenus();
    postToolbar(action);
  });
  toolbarPanelsWrap?.addEventListener('mouseenter', () => {
    cancelMenuClose('toolbar-panels');
  });
  toolbarPanelsWrap?.addEventListener('mouseleave', () => {
    if (toolbarPanelsMenu && !toolbarPanelsMenu.hidden) {
      scheduleMenuClose('toolbar-panels', () => {
        if (toolbarPanelsMenu) {
          toolbarPanelsMenu.hidden = true;
        }
        toolbarPanels?.setAttribute('aria-expanded', 'false');
      });
    }
  });
  toolbarMore?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!toolbarMenu) {
      return;
    }
    const open = toolbarMenu.hidden;
    cancelMenuClose();
    closeToolbarMenus();
    closeContextMenu();
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
    cancelMenuClose();
    closeToolbarMenus();
    postToolbar(action);
  });
  toolbarMoreWrap?.addEventListener('mouseenter', () => {
    cancelMenuClose('toolbar-more');
  });
  toolbarMoreWrap?.addEventListener('mouseleave', () => {
    if (toolbarMenu && !toolbarMenu.hidden) {
      scheduleMenuClose('toolbar-more', () => {
        if (toolbarMenu) {
          toolbarMenu.hidden = true;
        }
      });
    }
  });

  toolbarProfileWrap?.addEventListener('mouseenter', () => {
    cancelMenuClose('toolbar-profile');
    closeToolbarMenus();
    closeContextMenu();
    if (toolbarProfileMenu) {
      toolbarProfileMenu.hidden = false;
      toolbarProfile?.setAttribute('aria-expanded', 'true');
    }
  });
  toolbarProfileWrap?.addEventListener('mouseleave', () => {
    scheduleMenuClose('toolbar-profile', () => closeProfileMenu());
  });
  toolbarProfileAdd?.addEventListener('click', (event) => {
    event.stopPropagation();
    submitProfileCreate();
  });
  toolbarProfileName?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitProfileCreate();
    }
  });
  toolbarProfileList?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target : null);
    const actionBtn = target?.closest('[data-profile-action]');
    if (actionBtn instanceof HTMLElement) {
      event.stopPropagation();
      const action = actionBtn.getAttribute('data-profile-action');
      const id = actionBtn.getAttribute('data-profile-id') || undefined;
      if (action === 'rename' || action === 'delete') {
        vscode.postMessage({ type: 'profile', action, id });
        closeProfileMenu();
      }
      return;
    }
    const row = target?.closest('[data-profile-id]');
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const id = row.getAttribute('data-profile-id');
    if (!id) {
      return;
    }
    vscode.postMessage({ type: 'profile', action: 'activate', id });
    closeProfileMenu();
  });

  /** Skip leave-close while the context menu DOM is rebuilt (toggle/highlight). */
  let ignoreContextLeave = false;

  contextMenu.addEventListener('mouseenter', () => {
    ignoreContextLeave = false;
    cancelMenuClose('context');
  });
  contextMenu.addEventListener('mouseleave', () => {
    if (ignoreContextLeave) {
      return;
    }
    scheduleMenuClose('context', () => closeContextMenu());
  });
  contextMenu.addEventListener('click', (event) => {
    handleSyn3MenuClick(event, 'context');
  });
  toolbarViewMenu?.addEventListener('click', (event) => {
    handleSyn3MenuClick(event, 'toolbar');
  });

  document.addEventListener('contextmenu', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const host = target?.closest('[data-syn3-context]');
    if (!(host instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const raw = host.getAttribute('data-syn3-context');
    if (!raw) {
      return;
    }
    let ctx;
    try {
      ctx = JSON.parse(raw);
    } catch {
      return;
    }
    cancelMenuClose();
    closeToolbarMenus();
    const noteInput = target?.closest('.note-input.is-editing');
    if (
      noteInput instanceof HTMLElement &&
      activeNoteEdit?.input === noteInput &&
      !lockedContext(ctx)
    ) {
      saveNoteSelection();
      const requestId = String(++clipboardRequestId);
      pendingClipboardMenu = {
        ctx: { ...ctx, noteEditing: true },
        x: event.clientX,
        y: event.clientY,
        requestId,
      };
      vscode.postMessage({ type: 'clipboardRead', requestId });
      return;
    }
    openContextMenu(ctx, event.clientX, event.clientY);
  });

  /** @param {Record<string, unknown>} ctx */
  function lockedContext(ctx) {
    return !!ctx.locked;
  }
  const MIME = 'application/vnd.syn3';
  const MAX_DEPTH = 2;
  const PAGE_MIME = 'application/vnd.syn3.page';
  /** Top and bottom of a card that mean reorder, not nest. */
  const DROP_EDGE = 16;

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

  const dropEdge = el('div', 'drop-edge');
  dropEdge.hidden = true;
  document.body.append(dropEdge);

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
      if (
        message.codeStamp &&
        typeof message.codeStamp.text === 'string' &&
        typeof message.codeStamp.languageId === 'string' &&
        typeof message.codeStamp.label === 'string'
      ) {
        codeStamp = message.codeStamp;
      } else {
        codeStamp = null;
      }
      if (typeof message.themeGeneration === 'number') {
        themeGeneration = message.themeGeneration;
      }
      ensureActivePage();
      if (message.i18n && typeof message.i18n === 'object') {
        i18nBag = message.i18n;
      }
      applyToolbarLocale();
      setHistoryButtons(message.history);
      setToolbar(activePage() || message);
      setPanelToggles(message.open);
      updatePageMenu();
      renderProfiles(message.profiles, message.activeProfileId);
      applyAppearance(message.appearance);
      renderPager();
      render();
      if (typeof message.focusNoteId === 'string') {
        focusNoteInput(message.focusNoteId);
      }
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
    } else if (message.type === 'selectAll') {
      selectAllInFocusedField();
    } else if (message.type === 'undoInMap') {
      undoInFocusedField();
    } else if (message.type === 'copyInMap') {
      copyInFocusedField();
    } else if (message.type === 'pasteInMap') {
      applyPasteInFocusedField(
        typeof message.text === 'string' ? message.text : '',
        typeof message.languageId === 'string' ? message.languageId : undefined,
        typeof message.label === 'string' ? message.label : undefined,
      );
    } else if (message.type === 'clipboardReadResult') {
      if (pendingClipboardMenu && pendingClipboardMenu.requestId === message.requestId) {
        const pending = pendingClipboardMenu;
        pendingClipboardMenu = null;
        openContextMenu(
          {
            ...pending.ctx,
            noteEditing: true,
            clipboardText: typeof message.text === 'string' ? message.text : '',
            clipboardLanguageId:
              typeof message.languageId === 'string' ? message.languageId : undefined,
            clipboardLabel: typeof message.label === 'string' ? message.label : undefined,
          },
          pending.x,
          pending.y,
        );
      }
    } else if (message.type === 'codeStamp') {
      codeStamp =
        message.stamp &&
        typeof message.stamp.text === 'string' &&
        typeof message.stamp.languageId === 'string' &&
        typeof message.stamp.label === 'string'
          ? message.stamp
          : null;
    } else if (message.type === 'themeGeneration') {
      if (typeof message.themeGeneration === 'number') {
        themeGeneration = message.themeGeneration;
        refreshAllNoteHighlights();
      }
    } else if (message.type === 'highlightCodeResult') {
      onHighlightCodeResult(message);
    } else if (message.type === 'previewLinkResult') {
      onPreviewLinkResult(message);
    }
  });

  document.addEventListener('selectionchange', () => {
    if (activeNoteEdit) {
      saveNoteSelection();
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

  /** @param {string} noteId @param {string} pageId */
  function noteBelongsToPage(noteId, pageId) {
    const notes = Array.isArray(data?.notes) ? data.notes : [];
    let current = notes.find((n) => n.id === noteId);
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.page === pageId) {
        return true;
      }
      if (current.markerId) {
        const group = (data?.groups || []).find((g) => g.id === current.markerId);
        return !!group && (group.page || pageId) === pageId;
      }
      current = notes.find((n) => n.id === current.parentNote);
    }
    return false;
  }

  function pageNotes() {
    const page = activePage();
    if (!data || !page || !Array.isArray(data.notes)) {
      return [];
    }
    return data.notes.filter((note) => noteBelongsToPage(note.id, page.id));
  }

  function notesById() {
    return Object.fromEntries((data?.notes || []).map((n) => [n.id, n]));
  }

  /** Mixed root cards on the active page, sorted by shared order. */
  function rootCards() {
    const page = activePage();
    if (!page) {
      return [];
    }
    /** @type {Array<{ kind: 'marker' | 'note', id: string, order: number }>} */
    const items = [];
    for (const group of pageGroups().filter((g) => !g.parent)) {
      items.push({ kind: 'marker', id: group.id, order: group.order || 0 });
    }
    for (const note of (data?.notes || []).filter((n) => n.page === page.id)) {
      items.push({ kind: 'note', id: note.id, order: note.order || 0 });
    }
    return items.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  /** Direct child cards of a group: notes and subgroups, shared order. */
  function groupChildCards(group) {
    /** @type {Array<{ kind: 'marker' | 'note', id: string, order: number }>} */
    const items = [];
    const byId = Object.fromEntries(pageGroups().map((g) => [g.id, g]));
    for (const childId of group.children || []) {
      const child = byId[childId];
      if (child) {
        items.push({ kind: 'marker', id: childId, order: child.order || 0 });
      }
    }
    const noteMap = notesById();
    for (const noteId of group.noteChildren || []) {
      const note = noteMap[noteId];
      if (note) {
        items.push({ kind: 'note', id: noteId, order: note.order || 0 });
      }
    }
    return items.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  /** @param {string} noteId */
  function focusNoteInput(noteId) {
    requestAnimationFrame(() => {
      const node = root.querySelector('.note-card[data-note-id="' + noteId + '"] .note-input');
      if (node instanceof HTMLElement) {
        beginNoteEdit(node);
        placeCaretAtEnd(node);
      }
    });
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
      const backLabel = t('toolbarBack');
      historyBack.title = back ? backLabel + ' (' + back + ')' : backLabel;
      historyBack.setAttribute('aria-label', historyBack.title);
    }
    if (historyForward) {
      historyForward.disabled = forward === 0;
      const forwardLabel = t('toolbarForward');
      historyForward.title = forward ? forwardLabel + ' (' + forward + ')' : forwardLabel;
      historyForward.setAttribute('aria-label', historyForward.title);
    }
    if (historyAccept) {
      historyAccept.hidden = back + forward === 0;
      historyAccept.title = t('toolbarDone');
      historyAccept.setAttribute('aria-label', historyAccept.title);
    }
  }

  /** Apply profile language to static toolbar chrome and more-menu labels. */
  function applyToolbarLocale() {
    contextMenu.setAttribute('aria-label', t('contextMenu'));
    setBtnLocale(toolbarProfile, 'toolbarProfile');
    setElLocale(toolbarProfileMenu, 'profiles', 'aria-label');
    if (toolbarProfileName) {
      toolbarProfileName.placeholder = t('profileNewPlaceholder');
      toolbarProfileName.setAttribute('aria-label', t('profileNewAria'));
    }
    setBtnLocale(toolbarProfileAdd, 'profileCreate');
    setBtnLocale(toolbarView, 'toolbarView');
    setElLocale(toolbarViewMenu, 'toolbarView', 'aria-label');
    setBtnLocale(toolbarCreate, 'toolbarCreate');
    setElLocale(toolbarCreateMenu, 'toolbarCreate', 'aria-label');
    setBtnLocale(toolbarFormat, 'toolbarFormat');
    setElLocale(toolbarFormatMenu, 'toolbarFormat', 'aria-label');
    setFormatMenuLocale();
    setBtnLocale(toolbarPanels, 'toolbarPanels');
    setElLocale(toolbarPanelsMenu, 'toolbarPanelsGroup', 'aria-label');
    setBtnLocale(panelToggleBottom, 'toolbarPanelBottom');
    setBtnLocale(panelToggleLeft, 'toolbarPanelLeft');
    setBtnLocale(panelToggleRight, 'toolbarPanelRight');
    setBtnLocale(toolbarMore, 'toolbarMore');
    setMenuItemLocale('menu-create-page', 'menuNewPage');
    setMenuItemLocaleByAction('renamePage', 'menuRenamePage');
    setMenuItemLocale('menu-delete-page', 'menuDeletePage');
    setMenuItemLocaleByAction('refresh', 'menuRefresh');
    setMenuItemLocaleByAction('openSettings', 'menuOpenSettings');
    setCollapseButton();
  }

  function setFormatMenuLocale() {
    if (!toolbarFormatMenu) {
      return;
    }
    /** @type {Array<[string, string]>} */
    const items = [
      ['bold', 'formatBold'],
      ['color', 'formatColor'],
      ['code', 'formatCode'],
      ['quote', 'formatQuote'],
    ];
    for (const [fmt, key] of items) {
      const button = toolbarFormatMenu.querySelector('[data-fmt="' + fmt + '"]');
      if (button instanceof HTMLElement) {
        const label = t(key);
        button.title = label;
        button.setAttribute('aria-label', label);
      }
    }
  }

  /**
   * @param {HTMLElement | null} node
   * @param {string} key
   */
  function setBtnLocale(node, key) {
    if (!node) {
      return;
    }
    const label = t(key);
    node.title = label;
    node.setAttribute('aria-label', label);
  }

  /**
   * @param {HTMLElement | null} node
   * @param {string} key
   * @param {string} attr
   */
  function setElLocale(node, key, attr) {
    if (!node) {
      return;
    }
    node.setAttribute(attr, t(key));
  }

  /**
   * More-menu buttons keep an icon child; only replace the trailing text node.
   * @param {string} id
   * @param {string} key
   */
  function setMenuItemLocale(id, key) {
    const button = document.getElementById(id);
    if (!(button instanceof HTMLElement)) {
      return;
    }
    setMenuButtonText(button, t(key));
  }

  /**
   * @param {string} action
   * @param {string} key
   */
  function setMenuItemLocaleByAction(action, key) {
    const button = toolbarMenu?.querySelector('[data-action="' + action + '"]');
    if (!(button instanceof HTMLElement)) {
      return;
    }
    setMenuButtonText(button, t(key));
  }

  /**
   * @param {HTMLElement} button
   * @param {string} label
   */
  function setMenuButtonText(button, label) {
    const icon = button.querySelector('.tool-icon, img, svg');
    button.replaceChildren();
    if (icon) {
      button.append(icon);
    }
    button.append(document.createTextNode(label));
  }

  function closeToolbarMenus() {
    cancelMenuClose();
    if (toolbarMenu) {
      toolbarMenu.hidden = true;
    }
    if (toolbarPanelsMenu) {
      toolbarPanelsMenu.hidden = true;
    }
    toolbarPanels?.setAttribute('aria-expanded', 'false');
    closeToolbarViewMenu();
    closeToolbarCreateMenu();
    closeProfileMenu();
    closeFormatMenu();
  }

  function closeToolbarCreateMenu() {
    cancelMenuClose('toolbar-create');
    if (toolbarCreateMenu) {
      toolbarCreateMenu.hidden = true;
    }
    toolbarCreate?.setAttribute('aria-expanded', 'false');
    if (openMenuState?.kind === 'toolbar-create') {
      openMenuState = null;
    }
  }

  function openToolbarCreateMenu() {
    if (!toolbarCreateMenu || !toolbarCreateWrap) {
      return;
    }
    openMenuState = { kind: 'toolbar-create', viewExpanded: false };
    fillCreateMenu(toolbarCreateMenu);
    positionToolbarMenu(toolbarCreateMenu, toolbarCreateWrap);
    toolbarCreate?.setAttribute('aria-expanded', 'true');
  }

  /** @param {HTMLElement} root */
  function fillCreateMenu(menuRoot) {
    const isMenu = menuRoot.classList.contains('syn3-menu');
    const target = isMenu ? ensureMenuChrome(menuRoot).scroller : menuRoot;
    target.replaceChildren();
    target.append(menuActionChoice(t('createGroup'), { toolbar: 'createMarker' }));
    target.append(menuActionChoice(t('createNote'), { toolbar: 'createNote' }));
    if (isMenu) {
      updateMenuScrollbar(menuRoot);
    }
  }

  /**
   * @param {string} label
   * @param {{ toolbar?: string, create?: string, deleteAction?: string }} attrs
   */
  function menuActionChoice(label, attrs) {
    const button = menuAction(label);
    if (attrs.toolbar) {
      button.dataset.toolbar = attrs.toolbar;
    }
    if (attrs.create) {
      button.dataset.create = attrs.create;
    }
    if (attrs.deleteAction) {
      button.dataset.deleteAction = attrs.deleteAction;
    }
    return button;
  }

  function closeToolbarViewMenu() {
    cancelMenuClose('toolbar-view');
    if (toolbarViewMenu) {
      toolbarViewMenu.hidden = true;
      toolbarViewMenu.style.maxHeight = '';
      const chrome = ensureMenuChrome(toolbarViewMenu);
      chrome.scroller.scrollTop = 0;
      chrome.bar.hidden = true;
    }
    toolbarView?.setAttribute('aria-expanded', 'false');
    if (openMenuState?.kind === 'toolbar') {
      openMenuState = null;
    }
  }

  function closeContextMenu() {
    cancelMenuClose('context');
    contextMenu.hidden = true;
    contextMenu.style.maxHeight = '';
    const chrome = ensureMenuChrome(contextMenu);
    chrome.scroller.replaceChildren();
    chrome.scroller.scrollTop = 0;
    chrome.bar.hidden = true;
    if (openMenuState?.kind === 'context') {
      openMenuState = null;
    }
  }

  /** @type {WeakSet<HTMLElement>} */
  const menuScrollBound = new WeakSet();

  /**
   * Custom 4px overlay scrollbar (same idea as the map page bar).
   * @param {HTMLElement} menu
   */
  function ensureMenuChrome(menu) {
    let scroller = /** @type {HTMLElement | null} */ (menu.querySelector(':scope > .syn3-menu-scroller'));
    let bar = /** @type {HTMLElement | null} */ (menu.querySelector(':scope > .syn3-menu-scrollbar'));
    if (!scroller) {
      scroller = document.createElement('div');
      scroller.className = 'syn3-menu-scroller';
      while (menu.firstChild) {
        const child = menu.firstChild;
        if (child instanceof HTMLElement && child.classList.contains('syn3-menu-scrollbar')) {
          break;
        }
        scroller.append(child);
      }
      menu.insertBefore(scroller, menu.firstChild);
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'syn3-menu-scrollbar';
      bar.hidden = true;
      const thumbNode = document.createElement('div');
      thumbNode.className = 'syn3-menu-scrollbar-thumb';
      bar.append(thumbNode);
      menu.append(bar);
    }
    const thumb = /** @type {HTMLElement} */ (bar.firstElementChild);
    if (!menuScrollBound.has(menu)) {
      menuScrollBound.add(menu);
      scroller.addEventListener(
        'scroll',
        () => {
          updateMenuScrollbar(menu);
        },
        { passive: true },
      );
    }
    return { scroller, bar, thumb };
  }

  /** @param {HTMLElement} menu */
  function updateMenuScrollbar(menu) {
    const { scroller, bar, thumb } = ensureMenuChrome(menu);
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (max <= 1) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const track = Math.max(0, scroller.clientHeight);
    const thumbHeight = Math.max(16, (scroller.clientHeight / scroller.scrollHeight) * track);
    const top = (scroller.scrollTop / max) * (track - thumbHeight);
    thumb.style.height = thumbHeight + 'px';
    thumb.style.transform = 'translateY(' + top + 'px)';
  }

  function openToolbarViewMenu() {
    if (!toolbarViewMenu || !toolbarView || !toolbarViewWrap) {
      return;
    }
    cancelMenuClose('toolbar-view');
    openMenuState = { kind: 'toolbar', viewExpanded: true };
    fillViewSections(toolbarViewMenu, { includeGroupColumns: false });
    toolbarViewMenu.hidden = false;
    toolbarView.setAttribute('aria-expanded', 'true');
    positionToolbarMenu(toolbarViewMenu, toolbarViewWrap);
  }

  /**
   * @param {Record<string, unknown>} ctx
   * @param {number} x
   * @param {number} y
   */
  function openContextMenu(ctx, x, y) {
    cancelMenuClose('context');
    // Always start collapsed; user expands «Вид» / «Создать» / delete explicitly.
    openMenuState = {
      kind: 'context',
      viewExpanded: false,
      createExpanded: false,
      deleteExpanded: false,
      ctx,
      x,
      y,
    };
    renderContextMenu();
    contextMenu.hidden = false;
    positionMenu(contextMenu, { left: x, top: y, preferBelow: true });
  }

  /**
   * @param {string} label
   * @param {boolean} expanded
   * @param {string} toggleAction
   * @param {(nest: HTMLElement) => void} fillNest
   */
  function appendExpandableMenuBlock(scroller, label, expanded, toggleAction, fillNest) {
    const block = document.createElement('div');
    block.className = 'syn3-menu-view-block';
    const row = menuAction('', expanded ? 'is-expanded' : '');
    row.dataset.menuAction = toggleAction;
    const title = document.createElement('span');
    title.className = 'syn3-menu-item-label';
    title.textContent = label;
    const chevron = document.createElement('span');
    chevron.className = 'syn3-menu-item-chevron';
    chevron.textContent = expanded ? '▴' : '▾';
    chevron.setAttribute('aria-hidden', 'true');
    row.append(title, chevron);
    block.append(row);
    if (expanded) {
      const nest = document.createElement('div');
      nest.className = 'syn3-menu-nest';
      fillNest(nest);
      block.append(nest);
    }
    scroller.append(block);
  }

  function renderContextMenu() {
    if (!openMenuState || openMenuState.kind !== 'context' || !openMenuState.ctx) {
      return;
    }
    const ctx = openMenuState.ctx;
    const section = String(ctx.webviewSection || '');
    const depth = Number(ctx.depth) || 0;
    // replaceChildren can synthesize mouseleave; ignore it until the pointer moves again.
    ignoreContextLeave = true;
    cancelMenuClose('context');
    const { scroller } = ensureMenuChrome(contextMenu);
    scroller.replaceChildren();
    for (const item of contextMenuItems(ctx)) {
      if (item.kind === 'separator') {
        scroller.append(menuSeparator());
        continue;
      }
      if (item.kind === 'view') {
        appendExpandableMenuBlock(scroller, t('toolbarView'), !!openMenuState.viewExpanded, 'toggleView', (nest) => {
          fillViewSections(nest, {
            includeGroupColumns: !ctx.locked,
            columns: typeof ctx.columns === 'string' ? ctx.columns : 'flow',
            markerId: typeof ctx.markerId === 'string' ? ctx.markerId : undefined,
          });
        });
        continue;
      }
      if (item.kind === 'create') {
        appendExpandableMenuBlock(
          scroller,
          t('toolbarCreate'),
          !!openMenuState.createExpanded,
          'toggleCreate',
          (nest) => {
            if (section === 'marker' && depth < 2) {
              nest.append(menuActionChoice(t('createSubgroup'), { create: 'subgroup' }));
            }
            if (section === 'marker' || (section === 'note' && depth < 2)) {
              nest.append(menuActionChoice(t('createNote'), { create: 'note' }));
            }
          },
        );
        continue;
      }
      if (item.kind === 'delete') {
        const isNote = section === 'note';
        // Expand only when there are nested subgroups / subnotes to choose delete-all.
        if (ctx.hasChildren) {
          appendExpandableMenuBlock(
            scroller,
            t('menuDelete'),
            !!openMenuState.deleteExpanded,
            'toggleDelete',
            (nest) => {
              nest.append(
                menuActionChoice(isNote ? t('menuDeleteNote') : t('menuDeleteGroup'), {
                  deleteAction: 'one',
                }),
              );
              nest.append(
                menuActionChoice(t('menuDeleteAll'), {
                  deleteAction: 'all',
                }),
              );
            },
          );
        } else {
          scroller.append(
            menuActionChoice(t('menuDelete'), {
              deleteAction: 'one',
            }),
          );
        }
        continue;
      }
      if (item.kind === 'unlock') {
        const row = menuAction(t('menuUnlock'));
        row.dataset.menuAction = 'unlock';
        scroller.append(row);
        continue;
      }
      if (item.kind === 'copy') {
        const row = menuAction(t('menuCopy'));
        row.dataset.menuAction = 'copy';
        scroller.append(row);
        continue;
      }
      if (item.kind === 'paste') {
        const row = menuAction(t('menuPaste'));
        row.dataset.menuAction = 'paste';
        if (item.disabled) {
          row.disabled = true;
        }
        scroller.append(row);
        continue;
      }
      const row = menuAction(item.label);
      row.dataset.command = item.command;
      scroller.append(row);
    }
    updateMenuScrollbar(contextMenu);
  }

  /**
   * @param {Record<string, unknown>} ctx
   * @returns {Array<{ kind: 'command', command: string, label: string } | { kind: 'view' } | { kind: 'unlock' } | { kind: 'separator' } | { kind: 'copy' } | { kind: 'paste', disabled?: boolean }>}
   */
  function contextMenuItems(ctx) {
    const section = String(ctx.webviewSection || '');
    const locked = !!ctx.locked;
    const hasAlias = !!ctx.hasAlias;
    const depth = Number(ctx.depth) || 0;
    const isDir = !!ctx.isDir;
    const noteEditing = !!ctx.noteEditing;
    /** @type {Array<{ kind: 'command', command: string, label: string } | { kind: 'view' } | { kind: 'create' } | { kind: 'delete' } | { kind: 'unlock' } | { kind: 'separator' } | { kind: 'copy' } | { kind: 'paste', disabled?: boolean }>} */
    const items = [];

    if (noteEditing && section === 'note' && !locked) {
      items.push({ kind: 'copy' });
      items.push({
        kind: 'paste',
        disabled: !String(ctx.clipboardText || '').trim(),
      });
      items.push({ kind: 'separator' });
    }

    if (section === 'item') {
      items.push({ kind: 'command', command: 'syn3.reveal', label: t('menuReveal') });
    }
    if (section === 'class') {
      items.push({ kind: 'command', command: 'syn3.openClass', label: t('menuOpenClass') });
      items.push({ kind: 'command', command: 'syn3.reveal', label: t('menuReveal') });
    }
    if (section === 'marker') {
      items.push({ kind: 'command', command: 'syn3.openItem', label: t('menuOpenItem') });
      items.push({ kind: 'command', command: 'syn3.openFull', label: t('menuOpenFull') });
    }
    if (section === 'item' && isDir) {
      items.push({ kind: 'command', command: 'syn3.openItem', label: t('menuOpenItem') });
      items.push({ kind: 'command', command: 'syn3.openFull', label: t('menuOpenFull') });
    }

    // View / layout only on the group header, not on files or classes inside.
    if (section === 'marker') {
      items.push({ kind: 'view' });
    }

    if (section === 'item' && !locked) {
      items.push({ kind: 'command', command: 'syn3.rename', label: t('menuRename') });
    }
    if ((section === 'item' || section === 'class' || section === 'missingClass') && !locked) {
      items.push({ kind: 'command', command: 'syn3.setAlias', label: t('menuSetAlias') });
    }
    if (
      (section === 'item' || section === 'class' || section === 'missingClass') &&
      hasAlias &&
      !locked
    ) {
      items.push({ kind: 'command', command: 'syn3.clearAlias', label: t('menuClearAlias') });
    }
    if (section === 'missing' && !locked) {
      items.push({ kind: 'command', command: 'syn3.relink', label: t('menuRelink') });
    }
    if (
      (section === 'item' ||
        section === 'missing' ||
        section === 'class' ||
        section === 'missingClass') &&
      !locked
    ) {
      items.push({ kind: 'command', command: 'syn3.unassign', label: t('menuRemoveMarker') });
    }

    if (section === 'marker' && !locked) {
      items.push({ kind: 'command', command: 'syn3.editMarker', label: t('menuEditMarker') });
      items.push({ kind: 'command', command: 'syn3.setAlias', label: t('menuSetAlias') });
      if (hasAlias) {
        items.push({ kind: 'command', command: 'syn3.clearAlias', label: t('menuClearAlias') });
      }
      items.push({ kind: 'create' });
      items.push({ kind: 'command', command: 'syn3.changeColor', label: t('menuChangeColor') });
      items.push({ kind: 'command', command: 'syn3.changeIcon', label: t('menuChangeIcon') });
      items.push({ kind: 'command', command: 'syn3.moveMarkerUp', label: t('menuMoveUp') });
      items.push({ kind: 'command', command: 'syn3.moveMarkerDown', label: t('menuMoveDown') });
      if (depth > 0) {
        items.push({ kind: 'command', command: 'syn3.unnestMarker', label: t('menuUnnest') });
      }
      items.push({ kind: 'delete' });
    }

    if (section === 'note' && !locked) {
      if (depth < 2) {
        items.push({ kind: 'create' });
      }
      items.push({ kind: 'command', command: 'syn3.moveNoteUp', label: t('menuMoveUp') });
      items.push({ kind: 'command', command: 'syn3.moveNoteDown', label: t('menuMoveDown') });
      if (ctx.markerId || ctx.parentNote) {
        items.push({ kind: 'command', command: 'syn3.unnestNote', label: t('menuUnnest') });
      }
      items.push({ kind: 'delete' });
    }

    if ((section === 'marker' || section === 'note') && locked) {
      items.push({ kind: 'unlock' });
    }

    return items;
  }

  /**
   * @param {HTMLElement} root
   * @param {{ includeGroupColumns: boolean, columns?: string, markerId?: string }} options
   */
  function fillViewSections(root, options) {
    const isMenu = root.classList.contains('syn3-menu');
    const target = isMenu ? ensureMenuChrome(root).scroller : root;
    target.replaceChildren();
    const page = activePage();
    const layout = page?.layout || data?.layout || 'chips';
    const groupsLayout = page?.groupsLayout || data?.groupsLayout || 'flow';

    // One framed View block: no dividers between map/group subsections.
    target.append(menuLabel(t('viewMap')));
    target.append(menuChoice(t('viewCards'), layout === 'chips', { set: 'layout', value: 'chips' }));
    target.append(menuChoice(t('viewList'), layout === 'list', { set: 'layout', value: 'list' }));
    target.append(menuLabel(t('viewMapLayout')));
    target.append(menuChoice(t('viewFlow'), groupsLayout === 'flow', { set: 'groups', value: 'flow' }));
    target.append(menuChoice(t('viewCol1'), groupsLayout === '1', { set: 'groups', value: '1' }));
    target.append(menuChoice(t('viewCol2'), groupsLayout === '2', { set: 'groups', value: '2' }));
    target.append(menuChoice(t('viewCol3'), groupsLayout === '3', { set: 'groups', value: '3' }));

    if (options.includeGroupColumns && options.markerId) {
      const columns = options.columns === '1' || options.columns === '2' || options.columns === '3'
        ? options.columns
        : 'flow';
      target.append(menuLabel(t('viewGroupLayout')));
      target.append(
        menuChoice(t('viewFlow'), columns === 'flow', {
          set: 'columns',
          value: 'flow',
          markerId: options.markerId,
        }),
      );
      target.append(
        menuChoice(t('viewCol1'), columns === '1', {
          set: 'columns',
          value: '1',
          markerId: options.markerId,
        }),
      );
      target.append(
        menuChoice(t('viewCol2'), columns === '2', {
          set: 'columns',
          value: '2',
          markerId: options.markerId,
        }),
      );
      target.append(
        menuChoice(t('viewCol3'), columns === '3', {
          set: 'columns',
          value: '3',
          markerId: options.markerId,
        }),
      );
    }
    if (isMenu) {
      updateMenuScrollbar(root);
    }
  }

  /** @param {string} text */
  function menuLabel(text) {
    const node = document.createElement('div');
    node.className = 'syn3-menu-label';
    node.textContent = text;
    return node;
  }

  function menuSeparator() {
    const node = document.createElement('div');
    node.className = 'syn3-menu-separator';
    node.setAttribute('role', 'separator');
    return node;
  }

  /**
   * @param {string} label
   * @param {string} [extraClass]
   */
  function menuAction(label, extraClass) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'syn3-menu-item' + (extraClass ? ' ' + extraClass : '');
    button.setAttribute('role', 'menuitem');
    button.textContent = label;
    return button;
  }

  /**
   * @param {string} label
   * @param {boolean} active
   * @param {{ set: string, value: string, markerId?: string }} dataAttrs
   */
  function menuChoice(label, active, dataAttrs) {
    const button = menuAction(label, active ? 'is-active' : '');
    button.dataset.set = dataAttrs.set;
    button.dataset.value = dataAttrs.value;
    if (dataAttrs.markerId) {
      button.dataset.markerId = dataAttrs.markerId;
    }
    return button;
  }

  /**
   * @param {MouseEvent} event
   * @param {'toolbar' | 'toolbar-create' | 'context'} source
   */
  function handleSyn3MenuClick(event, source) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const button = target?.closest('button');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    event.stopPropagation();
    // Rebuilds replace DOM and can fire mouseleave — keep the menu open.
    if (source === 'context') {
      cancelMenuClose('context');
    }

    if (button.dataset.toolbar) {
      closeToolbarMenus();
      postToolbar(button.dataset.toolbar);
      return;
    }

    if (button.dataset.menuAction === 'toggleView') {
      if (openMenuState?.kind === 'context') {
        openMenuState.viewExpanded = !openMenuState.viewExpanded;
        openMenuState.createExpanded = false;
        openMenuState.deleteExpanded = false;
        renderContextMenu();
        cancelMenuClose('context');
        positionMenu(contextMenu, {
          left: openMenuState.x ?? 0,
          top: openMenuState.y ?? 0,
          preferBelow: true,
        });
      }
      return;
    }

    if (button.dataset.menuAction === 'toggleCreate') {
      if (openMenuState?.kind === 'context') {
        openMenuState.createExpanded = !openMenuState.createExpanded;
        openMenuState.viewExpanded = false;
        openMenuState.deleteExpanded = false;
        renderContextMenu();
        cancelMenuClose('context');
        positionMenu(contextMenu, {
          left: openMenuState.x ?? 0,
          top: openMenuState.y ?? 0,
          preferBelow: true,
        });
      }
      return;
    }

    if (button.dataset.menuAction === 'toggleDelete') {
      if (openMenuState?.kind === 'context') {
        openMenuState.deleteExpanded = !openMenuState.deleteExpanded;
        openMenuState.viewExpanded = false;
        openMenuState.createExpanded = false;
        renderContextMenu();
        cancelMenuClose('context');
        positionMenu(contextMenu, {
          left: openMenuState.x ?? 0,
          top: openMenuState.y ?? 0,
          preferBelow: true,
        });
      }
      return;
    }

    if (button.dataset.create) {
      const ctx = openMenuState?.ctx;
      const section = ctx && typeof ctx.webviewSection === 'string' ? ctx.webviewSection : '';
      if (button.dataset.create === 'subgroup' && section === 'marker' && typeof ctx?.markerId === 'string') {
        vscode.postMessage({
          type: 'runCommand',
          command: 'syn3.createSubgroup',
          arg: ctx,
        });
        closeContextMenu();
        return;
      }
      if (button.dataset.create === 'note') {
        if (section === 'marker' && typeof ctx?.markerId === 'string') {
          vscode.postMessage({
            type: 'createNote',
            markerId: ctx.markerId,
            text: '',
            focus: true,
          });
        } else if (section === 'note' && typeof ctx?.noteId === 'string') {
          vscode.postMessage({
            type: 'createNote',
            parentNote: ctx.noteId,
            text: '',
            focus: true,
          });
        }
        closeContextMenu();
        return;
      }
    }

    if (button.dataset.deleteAction) {
      const ctx = openMenuState?.ctx;
      const section = ctx && typeof ctx.webviewSection === 'string' ? ctx.webviewSection : '';
      if (section === 'marker' && typeof ctx?.markerId === 'string') {
        if (button.dataset.deleteAction === 'all') {
          vscode.postMessage({ type: 'deleteMarkerTree', markerId: ctx.markerId });
        } else {
          vscode.postMessage({
            type: 'runCommand',
            command: 'syn3.deleteMarker',
            arg: ctx,
          });
        }
        closeContextMenu();
        return;
      }
      if (section === 'note' && typeof ctx?.noteId === 'string') {
        vscode.postMessage({
          type: 'deleteNote',
          noteId: ctx.noteId,
          tree: button.dataset.deleteAction === 'all',
        });
        closeContextMenu();
        return;
      }
    }

    if (button.dataset.menuAction === 'unlock') {
      const ctx = openMenuState?.ctx;
      if (ctx && ctx.webviewSection === 'note' && typeof ctx.noteId === 'string') {
        vscode.postMessage({ type: 'toggleNoteLock', noteId: ctx.noteId });
        ctx.locked = false;
        renderContextMenu();
        return;
      }
      const markerId = ctx && typeof ctx.markerId === 'string' ? ctx.markerId : undefined;
      if (markerId) {
        vscode.postMessage({ type: 'toggleLock', markerId });
        if (ctx) {
          ctx.locked = false;
          renderContextMenu();
        }
      }
      return;
    }

    if (button.dataset.menuAction === 'copy') {
      copyInFocusedField();
      closeContextMenu();
      activeNoteEdit?.input.focus();
      return;
    }
    if (button.dataset.menuAction === 'paste') {
      const ctx = openMenuState?.ctx;
      const text = typeof ctx?.clipboardText === 'string' ? ctx.clipboardText : '';
      const languageId =
        typeof ctx?.clipboardLanguageId === 'string' ? ctx.clipboardLanguageId : undefined;
      const label = typeof ctx?.clipboardLabel === 'string' ? ctx.clipboardLabel : undefined;
      closeContextMenu();
      applyPasteInFocusedField(text, languageId, label);
      activeNoteEdit?.input.focus();
      return;
    }

    if (button.dataset.set === 'layout' && button.dataset.value) {
      const page = activePage();
      if (page) {
        page.layout = button.dataset.value;
      }
      applyPageChrome();
      postToolbarValue('setLayout', button.dataset.value);
      refreshOpenViewHighlights();
      return;
    }
    if (button.dataset.set === 'groups' && button.dataset.value) {
      const page = activePage();
      if (page) {
        page.groupsLayout = button.dataset.value;
      }
      applyPageChrome();
      postToolbarValue('setGroupsLayout', button.dataset.value);
      refreshOpenViewHighlights();
      return;
    }
    if (button.dataset.set === 'columns' && button.dataset.value && button.dataset.markerId) {
      vscode.postMessage({
        type: 'runCommand',
        command: 'syn3.setColumns.' + button.dataset.value,
        arg: { markerId: button.dataset.markerId },
      });
      if (openMenuState?.kind === 'context' && openMenuState.ctx) {
        openMenuState.ctx.columns = button.dataset.value;
        renderContextMenu();
      }
      return;
    }

    if (button.dataset.command && source === 'context' && openMenuState?.ctx) {
      const cmd = button.dataset.command;
      const ctx = openMenuState.ctx;
      if (cmd === 'syn3.moveNoteUp' || cmd === 'syn3.moveNoteDown') {
        if (typeof ctx.noteId === 'string') {
          vscode.postMessage({
            type: 'moveNote',
            id: ctx.noteId,
            delta: cmd === 'syn3.moveNoteUp' ? -1 : 1,
          });
        }
        closeContextMenu();
        return;
      }
      if (cmd === 'syn3.unnestNote') {
        if (typeof ctx.noteId === 'string') {
          vscode.postMessage({ type: 'unnestNote', id: ctx.noteId });
        }
        closeContextMenu();
        return;
      }
      vscode.postMessage({
        type: 'runCommand',
        command: cmd,
        arg: ctx,
      });
      closeContextMenu();
    }
  }

  function refreshOpenViewHighlights() {
    if (openMenuState?.kind === 'toolbar' && toolbarViewMenu && !toolbarViewMenu.hidden) {
      fillViewSections(toolbarViewMenu, { includeGroupColumns: false });
      return;
    }
    if (openMenuState?.kind === 'context' && openMenuState.viewExpanded) {
      renderContextMenu();
    }
  }

  /**
   * Keep the toolbar dropdown inside `.toolbar-view` so mouseleave covers button + menu.
   * @param {HTMLElement} menu
   * @param {HTMLElement} wrap
   */
  function positionToolbarMenu(menu, wrap) {
    const pad = 4;
    ensureMenuChrome(menu);
    menu.style.visibility = 'hidden';
    menu.hidden = false;
    menu.style.maxHeight = '';
    menu.style.left = 'auto';
    menu.style.right = '0';
    menu.style.top = '100%';
    menu.style.bottom = 'auto';

    const wrapRect = wrap.getBoundingClientRect();
    const height = menu.offsetHeight || 120;
    const spaceBelow = window.innerHeight - wrapRect.bottom - pad;
    const spaceAbove = wrapRect.top - pad;
    if (height > spaceBelow && spaceAbove > spaceBelow) {
      menu.style.top = 'auto';
      menu.style.bottom = '100%';
    }

    const available = Math.max(
      80,
      menu.style.bottom === '100%' ? spaceAbove : spaceBelow,
    );
    if (height > available) {
      menu.style.maxHeight = available + 'px';
    }
    menu.style.visibility = '';
    updateMenuScrollbar(menu);
  }

  /**
   * @param {HTMLElement} menu
   * @param {{ left: number, top: number, preferBelow?: boolean, keepPosition?: boolean }} at
   */
  function positionMenu(menu, at) {
    const pad = 4;
    ensureMenuChrome(menu);
    menu.style.visibility = 'hidden';
    menu.hidden = false;
    menu.style.maxHeight = '';
    menu.style.left = '0px';
    menu.style.top = '0px';

    const width = menu.offsetWidth || 180;
    const height = menu.offsetHeight || 120;
    const maxLeft = Math.max(pad, window.innerWidth - width - pad);
    let left = Math.min(Math.max(pad, at.left), maxLeft);
    let top = at.top;

    if (!at.keepPosition) {
      if (at.preferBelow !== false && top + height > window.innerHeight - pad) {
        top = Math.max(pad, at.top - height);
      }
      if (top + height > window.innerHeight - pad) {
        top = pad;
      }
    } else {
      top = Math.min(Math.max(pad, at.top), Math.max(pad, window.innerHeight - pad));
    }

    const available = window.innerHeight - top - pad;
    if (height > available) {
      menu.style.maxHeight = Math.max(80, available) + 'px';
    }

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = '';
    updateMenuScrollbar(menu);
  }

  function postToolbarValue(action, value) {
    vscode.postMessage({ type: 'toolbar', action, value, pageId: uiState.activePageId });
  }

  function applyPageChrome() {
    const page = activePage();
    const layout = page?.layout || data?.layout || 'chips';
    const groupsLayout = page?.groupsLayout || data?.groupsLayout || 'flow';
    root.className = 'map-page layout-' + layout + ' groups-' + groupsLayout;
  }

  function closeProfileMenu() {
    cancelMenuClose('toolbar-profile');
    if (toolbarProfileMenu) {
      toolbarProfileMenu.hidden = true;
    }
    toolbarProfile?.setAttribute('aria-expanded', 'false');
  }

  function submitProfileCreate() {
    const name = (toolbarProfileName?.value || '').trim();
    if (!name || !isCreatableProfileName(name)) {
      return;
    }
    vscode.postMessage({ type: 'profile', action: 'create', name });
    if (toolbarProfileName) {
      toolbarProfileName.value = '';
    }
    closeProfileMenu();
  }

  /** @param {string} name */
  function isCreatableProfileName(name) {
    const lower = name.toLocaleLowerCase();
    if (lower === 'общий' || lower === 'general') {
      return false;
    }
    const rows = toolbarProfileList?.querySelectorAll('[data-profile-id]') || [];
    for (const row of rows) {
      const label = row.querySelector('.profile-name');
      if (label && label.textContent && label.textContent.toLocaleLowerCase() === lower) {
        return false;
      }
    }
    return true;
  }

  /**
   * @param {{ id: string, name: string, boundCount?: number }[] | undefined} profiles
   * @param {string | undefined} activeId
   */
  function renderProfiles(profiles, activeId) {
    if (!toolbarProfileList) {
      return;
    }
    toolbarProfileList.replaceChildren();
    const list = Array.isArray(profiles) ? profiles : [];
    for (const profile of list) {
      const row = el('div', 'toolbar-profile-row' + (profile.id === activeId ? ' is-active' : ''));
      row.setAttribute('role', 'menuitem');
      row.setAttribute('data-profile-id', profile.id);
      const name = el('span', 'profile-name');
      name.textContent = profile.name;
      row.append(name);
      const bound = typeof profile.boundCount === 'number' ? profile.boundCount : 0;
      if (bound > 0) {
        const count = el('span', 'profile-bound-count');
        count.textContent = String(bound);
        count.title = t('profileBound').replace('{n}', String(bound));
        row.append(count);
      }
      if (profile.id !== 'general') {
        const actions = el('span', 'profile-actions');
        const renameBtn = el('button', '');
        renameBtn.type = 'button';
        renameBtn.title = t('profileRename');
        renameBtn.setAttribute('aria-label', t('profileRename'));
        renameBtn.setAttribute('data-profile-action', 'rename');
        renameBtn.setAttribute('data-profile-id', profile.id);
        renameBtn.textContent = '✎';
        const deleteBtn = el('button', '');
        deleteBtn.type = 'button';
        deleteBtn.title = t('profileDelete');
        deleteBtn.setAttribute('aria-label', t('profileDelete'));
        deleteBtn.setAttribute('data-profile-action', 'delete');
        deleteBtn.setAttribute('data-profile-id', profile.id);
        deleteBtn.textContent = '×';
        actions.append(renameBtn, deleteBtn);
        row.append(actions);
      }
      toolbarProfileList.append(row);
    }
  }

  /** @param {{ layout?: string, groupsLayout?: string }} message */
  function setToolbar(_message) {
    refreshOpenViewHighlights();
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
      (group.noteChildren || []).length === 0
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
      if (group) {
        return !!group.locked;
      }
      const note = data?.notes?.find((item) => item.id === groupOrId);
      return !!note?.locked;
    }
    return !!groupOrId?.locked;
  }

  /** Top-level groups and root notes (notes always fold to one line). */
  function collapsibleTopGroups() {
    const groups = pageGroups().filter(
      (group) => !group.parent && !isEmptyGroup(group) && !isLocked(group),
    );
    const notes = (data?.notes || []).filter(
      (note) => note.page === activePage()?.id && !isLocked(note),
    );
    return [...groups, ...notes];
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
      toolbarCollapse.title = collapsed ? t('toolbarExpand') : t('toolbarCollapse');
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

  // Cmd/A: handle when the key reaches the webview (some hosts); also clamp
  // VS Code's built-in document execCommand('selectAll') down to the active note.
  document.addEventListener(
    'keydown',
    (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'a' || event.altKey) {
        return;
      }
      if (!activeNoteEdit?.input) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      selectAllInFocusedField(activeNoteEdit.input);
    },
    true,
  );
  document.addEventListener('selectionchange', () => {
    if (!activeNoteEdit?.input) {
      return;
    }
    // Built-in webview selectAll runs via execCommand without a keydown here;
    // on the next selectionchange, keep the highlight inside the note.
    clampSelectAllToActiveNote();
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
    const cards = rootCards();
    if (cards.length === 0) {
      const emptyText =
        page?.kind === 'notes'
          ? 'Пока пусто. Создай группу или заметку.'
          : 'No markers yet. Right-click a file in the Explorer → "Mark…", or drag files here onto a group.';
      root.append(el('div', 'empty', emptyText));
      return;
    }

    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    const noteMap = notesById();
    for (const card of cards) {
      if (card.kind === 'marker') {
        const group = byId[card.id];
        if (group) {
          root.append(renderGroup(group, byId));
        }
      } else {
        const note = noteMap[card.id];
        if (note) {
          root.append(renderNoteCard(note, noteMap));
        }
      }
    }
    updateActive();
    applyTabMarks();
    playFolds(folds);
    if (pendingEditAfterExpandId && pendingEditAfterExpandPaints > 0) {
      pendingEditAfterExpandPaints -= 1;
      const id = pendingEditAfterExpandId;
      if (pendingEditAfterExpandPaints <= 0) {
        pendingEditAfterExpandId = '';
      }
      if (!(activeNoteEdit?.input?.isConnected)) {
        focusNoteInput(id);
      }
    }
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
    const ids = new Set([
      ...pageGroups().map((group) => group.id),
      ...pageNotes().map((note) => note.id),
    ]);
    /** @type {Array<{ id: string, opening: boolean, height: number, marginTop: string, snapshot: HTMLElement | null }>} */
    const folds = [];
    for (const section of root.querySelectorAll('section.group')) {
      if (!(section instanceof HTMLElement)) {
        continue;
      }
      const id = section.dataset.markerId || section.dataset.noteId || '';
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
      const section =
        root.querySelector('section.group[data-marker-id="' + CSS.escape(fold.id) + '"]') ||
        root.querySelector('section.group[data-note-id="' + CSS.escape(fold.id) + '"]');
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
      chip.title =
        page.kind === 'notes'
          ? page.name + ' (' + t('pageKindNotes') + ')'
          : page.name + ' (' + t('pageKindFiles') + ')';
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
    const noteChildIds = group.noteChildren || [];
    const noteMap = notesById();
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
    setMapContext(header, {
      webviewSection: 'marker',
      markerId: group.id,
      depth: group.depth || 0,
      canNest: (group.depth || 0) < MAX_DEPTH,
      columns,
      hasAlias: !!group.alias,
      locked,
      hasChildren: childIds.length > 0 || noteChildIds.length > 0,
    });
    const bar = el('span', 'bar');
    bar.title = locked ? t('groupLocked') : t('changeColor');
    bar.addEventListener('click', (event) => {
      event.stopPropagation();
      if (locked) {
        flashLock(group.id, header);
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
      el(
        'span',
        'count',
        String(group.items.length + classList.length + noteChildIds.length + childIds.length),
      ),
    );
    header.title =
      (group.alias ? group.alias + '\n' : '') +
      group.label +
      (locked ? '\n' + t('locked') : '\n' + t('dragHint'));
    trackPress(header, (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.lock-btn')) {
        return;
      }
      if (locked) {
        flashLock(group.id, header);
        return;
      }
      if (target instanceof Element && target.closest('.bar')) {
        return;
      }
      if (isEmpty) {
        return;
      }
      toggleCollapsed(group.id);
    });
    section.append(header);
    bindGroupSection(section, header, group);

    if (isEmpty) {
      return section;
    }

    if (collapsed) {
      const dots = el('div', 'dots');
      for (const noteId of noteChildIds) {
        const note = noteMap[noteId];
        if (!note) {
          continue;
        }
        const dot = el('span', 'dot note-dot');
        dot.title = notePlainLabel(note.text) || t('notePlaceholder');
        dots.append(dot);
      }
      if (!isNotesPage) {
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
    if (!isNotesPage) {
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
    for (const card of groupChildCards(group)) {
      if (card.kind === 'marker') {
        const child = byId[card.id];
        if (child) {
          children.append(renderGroup(child, byId));
        }
      } else {
        const note = noteMap[card.id];
        if (note) {
          children.append(renderNoteCard(note, noteMap));
        }
      }
    }
    if (children.childElementCount > 0) {
      section.append(children);
    }

    return section;
  }

  const LOCK_DENY_MS = 3000;
  /** @type {Map<string, number>} */
  const lockDenyUntil = new Map();

  /**
   * Blink the lock on a closed group for 3s. Repeat clicks on that group
   * are dropped until the window ends. A redraw drops the class with the node.
   * @param {string} groupId
   * @param {HTMLElement} header
   */
  function flashLock(groupId, header) {
    const now = Date.now();
    const until = lockDenyUntil.get(groupId) ?? 0;
    if (now < until) {
      return;
    }
    const button = header.querySelector(':scope > .lock-btn');
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const ends = now + LOCK_DENY_MS;
    lockDenyUntil.set(groupId, ends);
    button.dataset.denyToken = String(ends);
    button.classList.add('is-denied');
    setTimeout(() => {
      if (lockDenyUntil.get(groupId) === ends) {
        lockDenyUntil.delete(groupId);
      }
      if (button.dataset.denyToken === String(ends)) {
        delete button.dataset.denyToken;
        button.classList.remove('is-denied');
      }
    }, LOCK_DENY_MS);
  }

  function lockButton(group) {
    const locked = isLocked(group);
    const button = el('button', 'lock-btn' + (locked ? ' is-locked' : ''));
    button.type = 'button';
    button.title = locked ? t('unlockGroup') : t('lockGroup');
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

  const NOTE_JSON_PREFIX = 'syn3json:';
  /** Markdown link or bare http(s) URL. Groups: 1=label, 2=md-url, 3=bare-url. */
  const NOTE_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"']+)/g;

  function saveNoteSelection() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !activeNoteEdit) {
      savedNoteSelection = null;
      return;
    }
    const range = sel.getRangeAt(0);
    if (!activeNoteEdit.input.contains(range.commonAncestorContainer)) {
      savedNoteSelection = null;
      return;
    }
    savedNoteSelection = range.cloneRange();
  }

  function restoreNoteSelection() {
    if (!savedNoteSelection || !activeNoteEdit) {
      return;
    }
    activeNoteEdit.input.focus();
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(savedNoteSelection);
  }

  /**
   * @typedef {{ text: string, b?: true, color?: string, quote?: true, lang?: string, langLabel?: string }} NoteRun
   * @typedef {{ type: 'p', runs: NoteRun[] } | { type: 'code', text: string, languageId?: string, label?: string }} NoteBlock
   * @typedef {{ v: 1, blocks: NoteBlock[] }} NoteDoc
   */

  /** @param {string | undefined} raw @returns {NoteDoc} */
  function parseNoteText(raw) {
    if (typeof raw === 'string' && raw.startsWith(NOTE_JSON_PREFIX)) {
      try {
        const doc = JSON.parse(raw.slice(NOTE_JSON_PREFIX.length));
        if (doc && doc.v === 1 && Array.isArray(doc.blocks)) {
          return {
            v: 1,
            blocks: /** @type {unknown[]} */ (doc.blocks).map((block) => normalizeParsedBlock(block)),
          };
        }
      } catch {
        // fall through to plain text
      }
    }
    const text = typeof raw === 'string' ? raw : '';
    const lines = text.split('\n');
    return {
      v: 1,
      blocks: lines.map((line) => ({ type: 'p', runs: [{ text: line }] })),
    };
  }

  /** @param {unknown} block @returns {NoteBlock} */
  function normalizeParsedBlock(block) {
    if (!block || typeof block !== 'object') {
      return { type: 'p', runs: [{ text: '' }] };
    }
    const b = /** @type {Record<string, unknown>} */ (block);
    if (b.type === 'code') {
      /** @type {{ type: 'code', text: string, languageId?: string, label?: string }} */
      const code = { type: 'code', text: typeof b.text === 'string' ? b.text : '' };
      if (typeof b.languageId === 'string' && typeof b.label === 'string' && b.languageId && b.label) {
        code.languageId = b.languageId;
        code.label = b.label;
      }
      return code;
    }
    const runs = Array.isArray(b.runs) ? b.runs : [{ text: '' }];
    return {
      type: 'p',
      runs: runs.map((run) => {
        if (!run || typeof run !== 'object') {
          return { text: '' };
        }
        const r = /** @type {Record<string, unknown>} */ (run);
        /** @type {NoteRun} */
        const out = { text: typeof r.text === 'string' ? r.text : '' };
        if (r.b) {
          out.b = true;
        }
        if (r.quote) {
          out.quote = true;
        }
        if (typeof r.color === 'string') {
          out.color = r.color;
        }
        if (typeof r.lang === 'string' && typeof r.langLabel === 'string' && r.lang && r.langLabel) {
          out.lang = r.lang;
          out.langLabel = r.langLabel;
        }
        return out;
      }),
    };
  }

  /** @param {NoteRun[] | undefined} runs */
  function runsToText(runs) {
    return (runs || []).map((run) => run.text || '').join('');
  }

  /** @param {NoteDoc} doc */
  function noteDocIsRich(doc) {
    for (const block of doc.blocks) {
      if (block.type === 'code') {
        return true;
      }
      for (const run of block.runs || []) {
        if (run.b || run.color || run.quote || run.lang) {
          return true;
        }
      }
    }
    return false;
  }

  /** @param {NoteBlock[]} blocks */
  function normalizeNoteBlocks(blocks) {
    const next = blocks.slice();
    while (next.length > 1) {
      const last = next[next.length - 1];
      if (last.type === 'p' && !runsToText(last.runs).trim()) {
        next.pop();
        continue;
      }
      break;
    }
    if (next.length === 0) {
      next.push({ type: 'p', runs: [{ text: '' }] });
    }
    return next;
  }

  /** Block-level tags that imply a line break when extracting plain text. */
  const NOTE_PLAIN_BLOCK_TAGS = new Set([
    'DIV',
    'P',
    'PRE',
    'LI',
    'TR',
    'BLOCKQUOTE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
  ]);

  /**
   * DOM → plain text with newlines for BRs / block boundaries.
   * Keeps spaces and tabs (unlike Range#toString across block elements).
   * @param {Node | null} node
   * @returns {string}
   */
  function plainTextFromNode(node) {
    if (!node) {
      return '';
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    const elNode = /** @type {HTMLElement} */ (node);
    if (elNode.tagName === 'BR') {
      return '\n';
    }
    /** @type {string[]} */
    const parts = [];
    for (const child of elNode.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = /** @type {HTMLElement} */ (child);
        if (NOTE_PLAIN_BLOCK_TAGS.has(childEl.tagName) && parts.length > 0) {
          const prev = parts[parts.length - 1];
          if (prev && !prev.endsWith('\n')) {
            parts.push('\n');
          }
        }
      }
      parts.push(plainTextFromNode(child));
    }
    return parts.join('');
  }

  /**
   * @param {Range} range
   * @returns {string}
   */
  function plainTextFromRange(range) {
    const wrap = document.createElement('div');
    wrap.append(range.cloneContents());
    return plainTextFromNode(wrap).replace(/\n$/, '');
  }

  /**
   * Read code-block text from a pre.note-code, preserving newlines if the
   * browser nested div/br nodes inside it during paste/edit.
   * Label is CSS-only (data-label + ::before) so it must never appear in text.
   * @param {HTMLElement} pre
   * @returns {string}
   */
  function codeTextFromPre(pre) {
    const body = pre.querySelector(':scope > .note-code-body');
    const source = body instanceof HTMLElement ? body : pre;
    const clone = source.cloneNode(true);
    if (clone instanceof HTMLElement) {
      // Legacy badge nodes from older builds, if any remain in the DOM.
      clone.querySelectorAll('.note-code-lang').forEach((node) => node.remove());
    }
    let text = plainTextFromNode(clone);
    // Drop the caret-sink <br> at the end of the body (same as paragraphs).
    if (text.endsWith('\n')) {
      text = text.slice(0, -1);
    }
    // Contenteditable may have flattened an old badge into a leading label.
    const label = pre.dataset.label;
    if (label && text.startsWith(label)) {
      const after = text.slice(label.length);
      if (!after || /^[\s]/.test(after)) {
        text = after.replace(/^[ \t]+/, '');
      }
    }
    return text;
  }

  /** @param {NoteDoc} doc */
  function serializeNoteDoc(doc) {
    const blocks = normalizeNoteBlocks(doc.blocks);
    const normalized = { v: 1, blocks };
    if (!noteDocIsRich(normalized)) {
      return blocks
        .map((block) => (block.type === 'code' ? block.text : runsToText(block.runs)))
        .join('\n');
    }
    return NOTE_JSON_PREFIX + JSON.stringify(normalized);
  }

  /** @param {string | undefined} raw */
  function notePlainLabel(raw) {
    const doc = parseNoteText(raw);
    return (
      doc.blocks
        .map((block) => (block.type === 'code' ? block.text : runsToText(block.runs)))
        .join(' ')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim() || ''
    );
  }

  /** @param {string} text @param {boolean} asLinks @returns {DocumentFragment} */
  function appendTextWithOptionalLinks(text, asLinks) {
    const fragment = document.createDocumentFragment();
    if (!asLinks) {
      fragment.append(document.createTextNode(text));
      return fragment;
    }
    const pattern = new RegExp(NOTE_LINK_RE.source, 'g');
    let last = 0;
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index > last) {
        fragment.append(document.createTextNode(text.slice(last, match.index)));
      }
      const label = match[1];
      const mdUrl = match[2];
      const bareUrl = match[3];
      if (label && mdUrl) {
        const link = el('a', 'note-link', label);
        link.href = mdUrl;
        link.rel = 'noopener noreferrer';
        fragment.append(link);
        last = match.index + match[0].length;
      } else if (bareUrl) {
        const link = el('a', 'note-link', bareUrl);
        link.href = bareUrl;
        link.rel = 'noopener noreferrer';
        fragment.append(link);
        last = match.index + bareUrl.length;
      } else {
        last = match.index + match[0].length;
      }
    }
    if (last < text.length) {
      fragment.append(document.createTextNode(text.slice(last)));
    }
    if (!fragment.childNodes.length) {
      fragment.append(document.createTextNode(''));
    }
    return fragment;
  }

  /**
   * @param {NoteRun} run
   * @param {boolean} asLinks
   */
  function renderNoteRun(run, asLinks) {
    let node = /** @type {Node} */ (appendTextWithOptionalLinks(run.text || '', asLinks));
    if (run.quote) {
      const wrap = el('span', 'note-quote');
      wrap.append(node);
      node = wrap;
    }
    if (run.color) {
      const wrap = el('span');
      wrap.style.color = run.color;
      wrap.append(node);
      node = wrap;
    }
    if (run.b) {
      const wrap = el('b');
      wrap.append(node);
      node = wrap;
    }
    if (run.lang && run.langLabel) {
      const wrap = el('span', 'note-code-src');
      wrap.dataset.codeLang = run.lang;
      wrap.dataset.codeLabel = run.langLabel;
      wrap.append(node);
      node = wrap;
    }
    return node;
  }

  /**
   * @param {HTMLElement} pre
   * @param {string | undefined} languageId
   * @param {string | undefined} label
   */
  function applyCodeBlockLanguage(pre, languageId, label) {
    // Label is drawn via CSS ::before { content: attr(data-label) } — never a text node
    // inside contenteditable (that used to leak "ts" into the code on wrap/save).
    pre.querySelectorAll('.note-code-lang').forEach((node) => node.remove());
    if (languageId && label) {
      pre.dataset.languageId = languageId;
      pre.dataset.label = label;
      pre.classList.add('has-lang');
    } else {
      delete pre.dataset.languageId;
      delete pre.dataset.label;
      pre.classList.remove('has-lang');
      pre.classList.remove('is-highlighted');
    }
  }

  /**
   * @param {HTMLElement} pre
   * @param {string} text
   * @param {{ languageId?: string, label?: string, highlight?: boolean }} [opts]
   */
  function fillCodeBlock(pre, text, opts) {
    const languageId = opts?.languageId;
    const label = opts?.label;
    applyCodeBlockLanguage(pre, languageId, label);
    pre.querySelectorAll(':scope > .note-code-body, :scope > br').forEach((node) => node.remove());
    const body = el('span', 'note-code-body');
    if (opts?.highlight && languageId && text) {
      // View mode: host fills tokens; keep a plain placeholder until then.
      body.textContent = text;
      pre.append(body);
      requestCodeHighlight(pre, text, languageId);
      return;
    }
    // Editing: lines as text + <br> only — raw "\n" in textContent + contenteditable
    // often grows a matching <br> and doubles newlines on save.
    if (text) {
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          body.append(document.createElement('br'));
        }
        if (lines[i]) {
          body.append(document.createTextNode(lines[i]));
        }
      }
    } else {
      body.append(document.createElement('br'));
    }
    pre.append(body);
  }

  /**
   * @param {NoteDoc} doc
   * @param {{ linkify?: boolean, editing?: boolean }} [opts]
   */
  function renderNoteDoc(doc, opts) {
    const linkifyUrls = !!opts?.linkify;
    const editing = !!opts?.editing;
    const fragment = document.createDocumentFragment();
    const blocks = doc.blocks.length ? doc.blocks : [{ type: 'p', runs: [{ text: '' }] }];
    for (const block of blocks) {
      if (block.type === 'code') {
        const pre = el('pre', 'note-code');
        fillCodeBlock(pre, block.text || '', {
          languageId: block.languageId,
          label: block.label,
          highlight: !editing,
        });
        fragment.append(pre);
        continue;
      }
      const line = el('div', 'note-p');
      const runs = block.runs?.length ? block.runs : [{ text: '' }];
      for (const run of runs) {
        line.append(renderNoteRun(run, linkifyUrls));
      }
      if (!line.textContent) {
        line.append(document.createElement('br'));
      }
      fragment.append(line);
    }
    const last = blocks[blocks.length - 1];
    if (editing && last?.type === 'code') {
      const tail = el('div', 'note-p');
      tail.append(document.createElement('br'));
      fragment.append(tail);
    }
    return fragment;
  }

  /** @param {HTMLElement} input */
  function noteInputIsEmpty(input) {
    const text = (input.textContent || '').replace(/\u00a0/g, ' ').trim();
    return !text;
  }

  /** @param {HTMLElement} input */
  function refreshNoteEmptyClass(input) {
    input.classList.toggle('is-empty', noteInputIsEmpty(input));
  }

  /**
   * @param {Node | null} node
   * @returns {NoteRun[]}
   */
  function runsFromNode(node) {
    if (!node) {
      return [];
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return [{ text: node.textContent || '' }];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return [];
    }
    const elNode = /** @type {HTMLElement} */ (node);
    if (elNode.tagName === 'BR') {
      return [{ text: '\n' }];
    }
    if (elNode.tagName === 'A') {
      const href = elNode.getAttribute('href') || '';
      const label = elNode.textContent || '';
      if (href && label && label !== href) {
        return [{ text: '[' + label + '](' + href + ')' }];
      }
      return [{ text: href || label }];
    }
    /** @type {Partial<NoteRun>} */
    const marks = {};
    const tag = elNode.tagName;
    if (tag === 'B' || tag === 'STRONG') {
      marks.b = true;
    }
    if (elNode.classList.contains('note-quote')) {
      marks.quote = true;
    }
    if (elNode.classList.contains('note-code-src') || elNode.dataset.codeLang) {
      const lang = elNode.dataset.codeLang;
      const langLabel = elNode.dataset.codeLabel;
      if (lang && langLabel) {
        marks.lang = lang;
        marks.langLabel = langLabel;
      }
    }
    const colorAttr = tag === 'FONT' ? elNode.getAttribute('color') : null;
    const color = colorAttr || elNode.style?.color;
    if (color) {
      const hex = color.startsWith('#')
        ? color.length === 4
          ? '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
          : color.slice(0, 7)
        : toHex(color);
      if (hex) {
        marks.color = hex.toLowerCase();
      }
    }
    /** @type {NoteRun[]} */
    const runs = [];
    for (const child of elNode.childNodes) {
      for (const run of runsFromNode(child)) {
        runs.push({
          text: run.text,
          b: marks.b || run.b || undefined,
          quote: marks.quote || run.quote || undefined,
          color: marks.color || run.color || undefined,
          lang: marks.lang || run.lang || undefined,
          langLabel: marks.langLabel || run.langLabel || undefined,
        });
      }
    }
    return runs.length ? runs : [{ text: '', ...marks }];
  }

  /**
   * Contenteditable keeps a trailing <br> in each block for the caret.
   * Without stripping it, every paragraph serializes with an extra blank line.
   * @param {NoteRun[]} runs
   * @returns {NoteRun[]}
   */
  function stripTrailingBreakRuns(runs) {
    const next = runs.slice();
    while (next.length) {
      const last = next[next.length - 1];
      if (!last) {
        next.pop();
        continue;
      }
      const plain =
        !last.b && !last.color && !last.quote && !last.lang && !last.langLabel;
      if (plain && last.text === '\n') {
        next.pop();
        continue;
      }
      if (plain && typeof last.text === 'string' && /\n$/.test(last.text)) {
        const trimmed = last.text.replace(/\n+$/, '');
        if (trimmed) {
          next[next.length - 1] = { ...last, text: trimmed };
        } else {
          next.pop();
          continue;
        }
      }
      break;
    }
    return next.length ? next : [{ text: '' }];
  }

  /** @param {HTMLElement} input @returns {NoteDoc} */
  function serializeNoteFromDom(input) {
    /** @type {NoteBlock[]} */
    const blocks = [];
    const pushParagraphRuns = (/** @type {NoteRun[]} */ runs) => {
      /** @type {NoteRun[]} */
      let current = [];
      const flush = () => {
        blocks.push({ type: 'p', runs: current.length ? current : [{ text: '' }] });
        current = [];
      };
      for (const run of runs) {
        const parts = (run.text || '').split('\n');
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) {
            flush();
          }
          current.push({
            text: parts[i],
            b: run.b,
            color: run.color,
            quote: run.quote,
            lang: run.lang,
            langLabel: run.langLabel,
          });
        }
      }
      flush();
    };

    for (const child of Array.from(input.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const elNode = /** @type {HTMLElement} */ (child);
        if (elNode.classList.contains('note-code') || elNode.tagName === 'PRE') {
          /** @type {{ type: 'code', text: string, languageId?: string, label?: string }} */
          const codeBlock = { type: 'code', text: codeTextFromPre(elNode) };
          if (elNode.dataset.languageId && elNode.dataset.label) {
            codeBlock.languageId = elNode.dataset.languageId;
            codeBlock.label = elNode.dataset.label;
          }
          blocks.push(codeBlock);
          continue;
        }
        pushParagraphRuns(stripTrailingBreakRuns(runsFromNode(elNode)));
        continue;
      }
      if (child.nodeType === Node.TEXT_NODE && child.textContent) {
        // Contenteditable + pre-wrap often inserts "\n" text nodes between blocks.
        if (/^\s*$/.test(child.textContent)) {
          continue;
        }
        pushParagraphRuns([{ text: child.textContent }]);
      }
    }
    return { v: 1, blocks: normalizeNoteBlocks(blocks) };
  }

  /** @param {HTMLElement} input */
  function bindNoteLinks(input) {
    input.querySelectorAll('a.note-link').forEach((node) => {
      if (!(node instanceof HTMLAnchorElement)) {
        return;
      }
      node.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        vscode.postMessage({ type: 'openExternal', url: node.href });
      });
      node.addEventListener('mouseenter', () => {
        showLinkPreview(node);
      });
      node.addEventListener('mouseleave', () => {
        scheduleHideLinkPreview();
      });
    });
  }

  /**
   * Empty paragraph used as a spacer before a code block (or caret sink).
   * @param {Element} node
   */
  function isLeadingEmptyNoteBlock(node) {
    if (!(node instanceof HTMLElement) || !node.classList.contains('note-p')) {
      return false;
    }
    const text = (node.textContent || '').replace(/\u00a0/g, ' ').trim();
    if (text) {
      return false;
    }
    // Allow only <br> / empty spans — no code, links, or real content.
    return !node.querySelector('pre, .note-code, a, img, b, strong, .note-quote');
  }

  /**
   * When a nested note is folded, skip leading blank paragraphs so the clamp
   * shows the first real line (often the first line of a code block).
   * @param {HTMLElement} input
   */
  function applyCollapsedNotePreview(input) {
    input.querySelectorAll(':scope > .note-fold-skip').forEach((node) => {
      node.classList.remove('note-fold-skip');
    });
    const card = input.closest('.note-card');
    const folded =
      card instanceof HTMLElement &&
      card.classList.contains('collapsed') &&
      !card.classList.contains('is-note-editing') &&
      !input.classList.contains('is-editing');
    if (!folded) {
      return;
    }
    for (const child of Array.from(input.children)) {
      if (isLeadingEmptyNoteBlock(child)) {
        child.classList.add('note-fold-skip');
        continue;
      }
      break;
    }
  }

  /** @param {HTMLElement} input @param {string} raw @param {{ editing?: boolean, locked?: boolean }} opts */
  function paintNoteInput(input, raw, opts) {
    const doc = parseNoteText(raw);
    const editing = !!opts.editing && !opts.locked;
    input.replaceChildren(renderNoteDoc(doc, { linkify: !editing, editing }));
    input.contentEditable = editing ? 'true' : 'false';
    input.classList.toggle('is-editing', editing);
    input.spellcheck = editing;
    refreshNoteEmptyClass(input);
    if (!editing) {
      bindNoteLinks(input);
    }
    applyCollapsedNotePreview(input);
  }

  /** Re-request highlight for every visible code block after a theme change. */
  function refreshAllNoteHighlights() {
    root.querySelectorAll('.note-input:not(.is-editing) .note-code[data-language-id]').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const languageId = node.dataset.languageId;
      if (!languageId) {
        return;
      }
      const text = codeTextFromPre(node);
      if (text) {
        requestCodeHighlight(node, text, languageId);
      }
    });
  }

  /**
   * @param {HTMLElement} pre
   * @param {string} text
   * @param {string} languageId
   */
  function requestCodeHighlight(pre, text, languageId) {
    const requestId = String(++highlightRequestId);
    pre.dataset.highlightRequestId = requestId;
    vscode.postMessage({ type: 'highlightCode', requestId, text, languageId });
  }

  /**
   * @param {{ requestId: string, lines?: Array<Array<{ text: string, color?: string }>>, themeGeneration?: number }} message
   */
  function onHighlightCodeResult(message) {
    if (typeof message.themeGeneration === 'number') {
      themeGeneration = message.themeGeneration;
    }
    if (!Array.isArray(message.lines)) {
      return;
    }
    const pre = root.querySelector(
      '.note-code[data-highlight-request-id="' + CSS.escape(message.requestId) + '"]',
    );
    if (!(pre instanceof HTMLElement) || pre.closest('.note-input.is-editing')) {
      return;
    }
    const body = pre.querySelector(':scope > .note-code-body');
    if (!(body instanceof HTMLElement)) {
      return;
    }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < message.lines.length; i++) {
      if (i > 0) {
        frag.append(document.createTextNode('\n'));
      }
      const spans = message.lines[i] || [];
      for (const span of spans) {
        if (!span || !span.text) {
          continue;
        }
        if (span.color) {
          const node = el('span', 'note-code-tok');
          node.style.color = span.color;
          node.textContent = span.text;
          frag.append(node);
        } else {
          frag.append(document.createTextNode(span.text));
        }
      }
    }
    body.replaceChildren(frag);
    pre.classList.add('is-highlighted');
  }

  /** @param {HTMLElement} node */
  function placeCaretAtEnd(node) {
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  /** @param {Node | null} node @returns {HTMLElement | null} */
  function closestNoteCode(node) {
    if (!node) {
      return null;
    }
    const elNode = node.nodeType === Node.ELEMENT_NODE ? /** @type {HTMLElement} */ (node) : node.parentElement;
    return elNode?.closest?.('.note-code') || null;
  }

  /** @param {HTMLElement} input */
  function exitCodeBlock(input) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      return;
    }
    const code = closestNoteCode(sel.anchorNode);
    if (!code || !input.contains(code)) {
      return;
    }
    let next = code.nextElementSibling;
    if (!(next instanceof HTMLElement) || !next.classList.contains('note-p')) {
      next = el('div', 'note-p');
      next.append(document.createElement('br'));
      code.after(next);
    }
    const range = document.createRange();
    range.selectNodeContents(next);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * True when the caret sits on the first line of a code block (any column).
   * @param {HTMLElement} code
   * @param {Range} caret
   */
  function caretOnFirstCodeLine(code, caret) {
    const body = code.querySelector(':scope > .note-code-body') || code;
    if (!body.contains(caret.startContainer) && body !== caret.startContainer) {
      return false;
    }
    try {
      const before = document.createRange();
      before.selectNodeContents(body);
      before.setEnd(caret.startContainer, caret.startOffset);
      const wrap = document.createElement('div');
      wrap.append(before.cloneContents());
      return !plainTextFromNode(wrap).includes('\n');
    } catch {
      return false;
    }
  }

  /**
   * ArrowUp on the first code line: move into (or create) a paragraph above the block.
   * @param {HTMLElement} input
   */
  function enterBeforeCodeBlock(input) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      return;
    }
    const code = closestNoteCode(sel.anchorNode);
    if (!code || !input.contains(code) || code.parentElement !== input) {
      return;
    }
    let prev = code.previousElementSibling;
    if (!(prev instanceof HTMLElement) || !prev.classList.contains('note-p')) {
      prev = el('div', 'note-p');
      prev.append(document.createElement('br'));
      code.before(prev);
    }
    const range = document.createRange();
    range.selectNodeContents(prev);
    range.collapse(isLeadingEmptyNoteBlock(prev));
    sel.removeAllRanges();
    sel.addRange(range);
    refreshNoteEmptyClass(input);
  }

  /** @param {HTMLElement} input */
  function insertNoteLineBreak(input) {
    const sel = window.getSelection();
    const code = closestNoteCode(sel?.anchorNode || null);
    if (code && input.contains(code)) {
      // Prefer <br> over a raw "\n" so contenteditable does not keep both.
      if (!document.execCommand('insertLineBreak')) {
        document.execCommand('insertHTML', false, '<br>');
      }
      return;
    }
    if (!sel || !sel.rangeCount) {
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const anchor =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (range.startContainer)
        : range.startContainer.parentElement;
    let para = anchor?.closest?.('.note-p') || null;
    if (!(para instanceof HTMLElement) || !input.contains(para)) {
      para = el('div', 'note-p');
      para.append(document.createElement('br'));
      input.append(para);
      const caret = document.createRange();
      caret.setStart(para, 0);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
      return;
    }
    const after = range.cloneRange();
    after.selectNodeContents(para);
    after.setStart(range.endContainer, range.endOffset);
    const trailing = after.extractContents();
    const next = el('div', 'note-p');
    const hasTrailing =
      !!(trailing.textContent && trailing.textContent.length) ||
      trailing.querySelector?.('img, br, span, b, strong, a');
    if (hasTrailing) {
      next.append(trailing);
      if (!(next.textContent || '').length && !next.querySelector('br')) {
        next.append(document.createElement('br'));
      }
    } else {
      next.append(document.createElement('br'));
    }
    if (!(para.textContent || '').length && !para.querySelector('br')) {
      para.append(document.createElement('br'));
    }
    para.after(next);
    const caret = document.createRange();
    caret.setStart(next, 0);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
  }

  /** Cancel a pending blur→save so host Cmd/A can keep the note in edit mode. */
  function cancelNoteBlurEnd() {
    if (noteBlurTimer) {
      clearTimeout(noteBlurTimer);
      noteBlurTimer = null;
    }
  }

  /** @param {HTMLElement} input */
  function beginNoteEdit(input) {
    if (input.dataset.locked === '1') {
      return;
    }
    cancelNoteBlurEnd();
    const noteId = input.dataset.noteId || '';
    // Editing must expand for real — is-note-editing only hides the clamp while focused.
    if (noteId && isCollapsed(noteId)) {
      pendingEditAfterExpandId = noteId;
      // Local toggle render + follow-up host state push both rebuild the DOM.
      pendingEditAfterExpandPaints = 2;
      toggleCollapsed(noteId);
      return;
    }
    const raw = input.dataset.raw || '';
    paintNoteInput(input, raw, { editing: true });
    activeNoteEdit = {
      noteId,
      input,
      lastSaved: raw,
      locked: false,
    };
    lastNoteEditId = noteId;
    pendingNoteMarks = { bold: false, quote: false, color: null };
    setNoteEditingChrome(input, true);
    setFormatToolbarVisible(true);
    updateFormatMenuState();
    input.focus();
    vscode.postMessage({ type: 'mapFocus', pageId: uiState.activePageId });
  }

  /** @param {HTMLElement} input @param {{ restore?: boolean }} [opts] */
  function endNoteEdit(input, opts) {
    if (activeNoteEdit?.input !== input) {
      return;
    }
    cancelNoteBlurEnd();
    const noteId = activeNoteEdit.noteId;
    let next = activeNoteEdit.lastSaved;
    if (!opts?.restore) {
      const doc = serializeNoteFromDom(input);
      next = serializeNoteDoc(doc);
      if (next !== activeNoteEdit.lastSaved) {
        vscode.postMessage({ type: 'updateNote', noteId, text: next });
      }
    }
    input.dataset.raw = next;
    activeNoteEdit = null;
    pendingEditAfterExpandId = '';
    pendingEditAfterExpandPaints = 0;
    pendingNoteMarks = { bold: false, quote: false, color: null };
    savedNoteSelection = null;
    setNoteEditingChrome(input, false);
    setFormatToolbarVisible(false);
    closeFormatMenu();
    // Drop any leftover highlight once the note is no longer focused.
    clearNoteSelection(input);
    paintNoteInput(input, next, { editing: false, locked: input.dataset.locked === '1' });
    clearNoteSelection(input);
  }

  /** Clear window selection if it touches the note field (or clear entirely if empty). */
  function clearNoteSelection(input) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return;
    }
    const anchor = sel.anchorNode;
    const focus = sel.focusNode;
    if (
      (anchor && input.contains(anchor)) ||
      (focus && input.contains(focus)) ||
      !anchor
    ) {
      sel.removeAllRanges();
    }
  }

  /** @param {HTMLElement} input @param {boolean} editing */
  function setNoteEditingChrome(input, editing) {
    const section = input.closest('.note-card');
    const header = input.closest('.note-header');
    if (section instanceof HTMLElement) {
      section.classList.toggle('is-note-editing', editing);
    }
    if (header instanceof HTMLElement) {
      header.draggable = editing ? false : input.dataset.locked !== '1';
    }
  }

  function setFormatToolbarVisible(visible) {
    if (!toolbarFormatWrap) {
      return;
    }
    toolbarFormatWrap.hidden = !visible;
    if (!visible) {
      closeFormatMenu();
    }
  }

  function closeFormatMenu() {
    if (toolbarFormatMenu) {
      toolbarFormatMenu.hidden = true;
    }
    if (toolbarFormat) {
      toolbarFormat.setAttribute('aria-expanded', 'false');
    }
  }

  function openFormatMenu() {
    if (!toolbarFormatMenu || !toolbarFormat) {
      return;
    }
    toolbarFormatMenu.hidden = false;
    toolbarFormat.setAttribute('aria-expanded', 'true');
    updateFormatMenuState();
  }

  function updateFormatMenuState() {
    if (!toolbarFormatMenu) {
      return;
    }
    const boldBtn = toolbarFormatMenu.querySelector('[data-fmt="bold"]');
    const quoteBtn = toolbarFormatMenu.querySelector('[data-fmt="quote"]');
    if (boldBtn instanceof HTMLElement) {
      boldBtn.classList.toggle('is-active', pendingNoteMarks.bold || queryInlineMark('bold'));
    }
    if (quoteBtn instanceof HTMLElement) {
      quoteBtn.classList.toggle('is-active', pendingNoteMarks.quote || queryInlineMark('quote'));
    }
  }

  /** @param {'bold' | 'quote'} kind */
  function queryInlineMark(kind) {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !activeNoteEdit) {
      return false;
    }
    const elNode =
      sel.anchorNode.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (sel.anchorNode)
        : sel.anchorNode.parentElement;
    if (!elNode || !activeNoteEdit.input.contains(elNode)) {
      return false;
    }
    if (kind === 'bold') {
      return !!elNode.closest('b, strong');
    }
    return !!elNode.closest('.note-quote');
  }

  function toggleBoldFormat() {
    if (!activeNoteEdit) {
      return;
    }
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
      pendingNoteMarks.bold = !pendingNoteMarks.bold;
      updateFormatMenuState();
      return;
    }
    document.execCommand('bold');
    updateFormatMenuState();
  }

  function toggleQuoteFormat() {
    if (!activeNoteEdit) {
      return;
    }
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      return;
    }
    if (sel.isCollapsed) {
      pendingNoteMarks.quote = !pendingNoteMarks.quote;
      updateFormatMenuState();
      return;
    }
    const range = sel.getRangeAt(0);
    const existing = closestQuote(range.commonAncestorContainer);
    if (existing && activeNoteEdit.input.contains(existing) && rangeFullyInside(range, existing)) {
      unwrapElement(existing);
    } else {
      const wrap = el('span', 'note-quote');
      try {
        range.surroundContents(wrap);
      } catch {
        const extracted = range.extractContents();
        wrap.append(extracted);
        range.insertNode(wrap);
      }
    }
    updateFormatMenuState();
  }

  /** @param {Node | null} node */
  function closestQuote(node) {
    const elNode = node?.nodeType === Node.ELEMENT_NODE ? /** @type {HTMLElement} */ (node) : node?.parentElement;
    return elNode?.closest?.('.note-quote') || null;
  }

  /** @param {Range} range @param {HTMLElement} node */
  function rangeFullyInside(range, node) {
    return node.contains(range.startContainer) && node.contains(range.endContainer);
  }

  /** @param {HTMLElement} node */
  function unwrapElement(node) {
    const parent = node.parentNode;
    if (!parent) {
      return;
    }
    while (node.firstChild) {
      parent.insertBefore(node.firstChild, node);
    }
    parent.removeChild(node);
  }

  function applyTextColor(color) {
    if (!activeNoteEdit) {
      return;
    }
    restoreNoteSelection();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
      pendingNoteMarks.color = color;
      return;
    }
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, color);
  }

  /**
   * Language shared by every stamped run inside a range; mixed → null; none → undefined.
   * @param {Range} range
   * @returns {{ languageId: string, label: string } | null | undefined}
   */
  function languageFromRange(range) {
    const wrap = document.createElement('div');
    wrap.append(range.cloneContents());
    /** @type {Array<{ languageId: string, label: string }>} */
    const found = [];
    wrap.querySelectorAll('.note-code-src[data-code-lang]').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const languageId = node.dataset.codeLang;
      const label = node.dataset.codeLabel;
      if (languageId && label) {
        found.push({ languageId, label });
      }
    });
    // Also check if the range sits inside a single source span.
    const startEl =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (range.startContainer)
        : range.startContainer.parentElement;
    const host = startEl?.closest?.('.note-code-src');
    if (host instanceof HTMLElement && host.dataset.codeLang && host.dataset.codeLabel) {
      if (host.contains(range.endContainer) || host === range.endContainer) {
        found.push({
          languageId: host.dataset.codeLang,
          label: host.dataset.codeLabel,
        });
      }
    }
    if (!found.length) {
      return undefined;
    }
    const first = found[0];
    for (const item of found) {
      if (item.languageId !== first.languageId) {
        return null;
      }
    }
    return first;
  }

  /**
   * Direct block children of the note field that intersect a range.
   * Code blocks must sit here — nested inside .note-p they serialize as a paragraph.
   * @param {HTMLElement} input
   * @param {Range} range
   * @returns {HTMLElement[]}
   */
  function noteBlocksIntersecting(input, range) {
    /** @type {HTMLElement[]} */
    const out = [];
    for (const child of Array.from(input.children)) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }
      if (!child.classList.contains('note-p') && !child.classList.contains('note-code')) {
        continue;
      }
      try {
        if (range.intersectsNode(child)) {
          out.push(child);
        }
      } catch {
        // ignores detached nodes
      }
    }
    return out;
  }

  /**
   * Place a code block as a direct child of the note field (never inside .note-p).
   * @param {HTMLElement} input
   * @param {HTMLElement} pre
   * @param {Selection} sel
   * @param {{ text: string, languageId?: string, label?: string }} payload
   */
  function insertCodeBlockAtSelection(input, pre, sel, payload) {
    fillCodeBlock(pre, payload.text, {
      languageId: payload.languageId,
      label: payload.label,
      highlight: false,
    });
    if (!sel.rangeCount) {
      input.append(pre);
      return;
    }
    const range = sel.getRangeAt(0);
    const blocks = noteBlocksIntersecting(input, range);
    if (blocks.length === 1 && blocks[0].classList.contains('note-p') && !sel.isCollapsed) {
      const p = blocks[0];
      const beforeRange = document.createRange();
      beforeRange.selectNodeContents(p);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      const afterRange = document.createRange();
      afterRange.selectNodeContents(p);
      afterRange.setStart(range.endContainer, range.endOffset);
      const beforeText = plainTextFromRange(beforeRange);
      const afterText = plainTextFromRange(afterRange);
      const frag = document.createDocumentFragment();
      if (beforeText) {
        const beforeP = el('div', 'note-p');
        beforeP.textContent = beforeText;
        frag.append(beforeP);
      }
      frag.append(pre);
      if (afterText) {
        const afterP = el('div', 'note-p');
        afterP.textContent = afterText;
        frag.append(afterP);
      }
      p.replaceWith(frag);
      return;
    }
    if (blocks.length >= 1) {
      const first = blocks[0];
      for (let i = 1; i < blocks.length; i++) {
        blocks[i].remove();
      }
      first.replaceWith(pre);
      return;
    }
    const anchor =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? /** @type {HTMLElement} */ (range.startContainer)
        : range.startContainer.parentElement;
    const nestedP = anchor?.closest?.('.note-p');
    if (nestedP && input.contains(nestedP)) {
      let top = /** @type {HTMLElement} */ (nestedP);
      while (top.parentElement && top.parentElement !== input) {
        top = top.parentElement;
      }
      if (top.parentElement === input) {
        top.after(pre);
        return;
      }
    }
    input.append(pre);
  }

  function toggleCodeBlock() {
    if (!activeNoteEdit) {
      return;
    }
    const input = activeNoteEdit.input;
    const sel = window.getSelection();
    const code = closestNoteCode(sel?.anchorNode || null);
    if (code && input.contains(code) && code.parentElement === input) {
      const text = codeTextFromPre(code);
      const langId = code.dataset.languageId;
      const langLabel = code.dataset.label;
      const lines = text.split('\n');
      const frag = document.createDocumentFragment();
      for (const line of lines) {
        const p = el('div', 'note-p');
        if (langId && langLabel && line) {
          const src = el('span', 'note-code-src');
          src.dataset.codeLang = langId;
          src.dataset.codeLabel = langLabel;
          src.textContent = line;
          p.append(src);
        } else {
          p.textContent = line;
        }
        if (!line) {
          p.append(document.createElement('br'));
        }
        frag.append(p);
      }
      code.replaceWith(frag);
      return;
    }
    // Unwrap a nested legacy pre if somehow still inside a paragraph.
    if (code && input.contains(code)) {
      const text = codeTextFromPre(code);
      const langId = code.dataset.languageId;
      const langLabel = code.dataset.label;
      const pre = el('pre', 'note-code');
      fillCodeBlock(pre, text, {
        languageId: langId,
        label: langLabel,
        highlight: false,
      });
      const host = code.closest('.note-p');
      if (host && host.parentElement === input) {
        host.replaceWith(pre);
      } else {
        code.replaceWith(pre);
      }
      const after = el('div', 'note-p');
      after.append(document.createElement('br'));
      pre.after(after);
      return;
    }
    const pre = el('pre', 'note-code');
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const text = plainTextFromRange(range);
      const lang = languageFromRange(range);
      insertCodeBlockAtSelection(input, pre, sel, {
        text,
        languageId: lang ? lang.languageId : undefined,
        label: lang ? lang.label : undefined,
      });
    } else if (sel && sel.rangeCount) {
      insertCodeBlockAtSelection(input, pre, sel, { text: '' });
    } else {
      fillCodeBlock(pre, '', { highlight: false });
      input.append(pre);
    }
    const after = el('div', 'note-p');
    after.append(document.createElement('br'));
    pre.after(after);
    const caret = document.createRange();
    const body = pre.querySelector(':scope > .note-code-body') || pre;
    caret.selectNodeContents(body);
    caret.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(caret);
  }

  function openTextColorPicker() {
    if (!activeNoteEdit) {
      return;
    }
    saveNoteSelection();
    const rect = (toolbarFormatMenu || toolbarFormat || activeNoteEdit.input).getBoundingClientRect();
    colorInput.style.left = rect.left + 'px';
    colorInput.style.top = rect.bottom + 'px';
    colorInput.value = pendingNoteMarks.color || '#4daafc';
    colorTarget = { kind: 'text' };
    if (typeof colorInput.showPicker === 'function') {
      try {
        colorInput.showPicker();
        return;
      } catch {
        // fall through
      }
    }
    colorInput.click();
  }

  /**
   * @param {HTMLAnchorElement} link
   */
  function showLinkPreview(link) {
    if (linkPreviewHideTimer) {
      clearTimeout(linkPreviewHideTimer);
      linkPreviewHideTimer = null;
    }
    const url = link.href;
    linkPreviewUrl = url;
    ensureLinkPreviewEl();
    if (!linkPreviewEl) {
      return;
    }
    const narrow = window.innerWidth < 100;
    linkPreviewEl.classList.toggle('is-narrow', narrow);
    const rect = link.getBoundingClientRect();
    linkPreviewEl.style.top = Math.min(window.innerHeight - 128, rect.bottom + 4) + 'px';
    linkPreviewEl.hidden = false;
    const scroll = /** @type {HTMLElement} */ (linkPreviewEl.querySelector('.note-link-preview-scroll'));
    scroll.replaceChildren(buildLinkPreviewSkeleton());
    updateLinkPreviewScrollbar();
    const requestId = String(++linkPreviewRequest);
    linkPreviewPendingId = requestId;
    vscode.postMessage({ type: 'previewLink', url, requestId });
  }

  function scheduleHideLinkPreview() {
    if (linkPreviewHideTimer) {
      clearTimeout(linkPreviewHideTimer);
    }
    linkPreviewHideTimer = setTimeout(() => {
      hideLinkPreview();
    }, 180);
  }

  function hideLinkPreview() {
    linkPreviewUrl = null;
    if (linkPreviewEl) {
      linkPreviewEl.hidden = true;
    }
  }

  function ensureLinkPreviewEl() {
    if (linkPreviewEl) {
      return;
    }
    linkPreviewEl = el('div', 'note-link-preview');
    linkPreviewEl.hidden = true;
    const scroll = el('div', 'note-link-preview-scroll');
    const bar = el('div', 'note-link-preview-bar');
    bar.hidden = true;
    const thumb = el('div', 'note-link-preview-thumb');
    bar.append(thumb);
    linkPreviewEl.append(scroll, bar);
    linkPreviewEl.addEventListener('mouseenter', () => {
      if (linkPreviewHideTimer) {
        clearTimeout(linkPreviewHideTimer);
        linkPreviewHideTimer = null;
      }
    });
    linkPreviewEl.addEventListener('mouseleave', () => {
      scheduleHideLinkPreview();
    });
    scroll.addEventListener('scroll', updateLinkPreviewScrollbar, { passive: true });
    document.body.append(linkPreviewEl);
  }

  function buildLinkPreviewSkeleton() {
    const frag = document.createDocumentFragment();
    frag.append(el('div', 'note-link-preview-skel-image'));
    const lines = el('div', 'note-link-preview-skel-lines');
    lines.append(el('div', 'note-link-preview-skel-line'), el('div', 'note-link-preview-skel-line'));
    frag.append(lines);
    return frag;
  }

  /**
   * @param {{ requestId: string, url: string, image?: string, description?: string, empty?: boolean }} message
   */
  function onPreviewLinkResult(message) {
    if (!linkPreviewEl || linkPreviewUrl !== message.url) {
      return;
    }
    if (linkPreviewPendingId && message.requestId !== linkPreviewPendingId) {
      return;
    }
    if (message.empty || (!message.image && !message.description)) {
      hideLinkPreview();
      return;
    }
    const scroll = /** @type {HTMLElement} */ (linkPreviewEl.querySelector('.note-link-preview-scroll'));
    scroll.replaceChildren();
    if (message.image) {
      const img = /** @type {HTMLImageElement} */ (el('img', 'note-link-preview-image'));
      img.src = message.image;
      img.alt = '';
      scroll.append(img);
    }
    if (message.description) {
      scroll.append(el('div', 'note-link-preview-desc', message.description));
    }
    updateLinkPreviewScrollbar();
  }

  function updateLinkPreviewScrollbar() {
    if (!linkPreviewEl) {
      return;
    }
    const scroll = /** @type {HTMLElement | null} */ (linkPreviewEl.querySelector('.note-link-preview-scroll'));
    const bar = /** @type {HTMLElement | null} */ (linkPreviewEl.querySelector('.note-link-preview-bar'));
    const thumb = /** @type {HTMLElement | null} */ (linkPreviewEl.querySelector('.note-link-preview-thumb'));
    if (!scroll || !bar || !thumb) {
      return;
    }
    const max = scroll.scrollHeight - scroll.clientHeight;
    if (max <= 1) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const thumbHeight = Math.max(16, (scroll.clientHeight / scroll.scrollHeight) * scroll.clientHeight);
    const top = (scroll.scrollTop / max) * (scroll.clientHeight - thumbHeight);
    thumb.style.height = thumbHeight + 'px';
    thumb.style.transform = 'translateY(' + top + 'px)';
  }

  /**
   * Select the whole note (or focused input). Used for Cmd/A that reaches the
   * webview, and to clamp a document-wide selectAll down to the active note.
   * @param {HTMLElement} [preferred]
   */
  function selectAllInFocusedField(preferred) {
    cancelNoteBlurEnd();
    const active = document.activeElement;
    if (
      !preferred &&
      (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
    ) {
      active.select();
      return;
    }
    /** @type {HTMLElement | null} */
    let editable = preferred ?? activeNoteEdit?.input ?? null;
    if (!editable) {
      const editing = root.querySelector('.note-input.is-editing');
      if (editing instanceof HTMLElement) {
        editable = editing;
      }
    }
    if (!editable && lastNoteEditId) {
      const node = root.querySelector(
        '.note-card[data-note-id="' + CSS.escape(lastNoteEditId) + '"] .note-input',
      );
      if (node instanceof HTMLElement) {
        editable = node;
      }
    }
    if (!editable && active instanceof HTMLElement) {
      const noteInput = active.closest?.('.note-input');
      if (noteInput instanceof HTMLElement) {
        editable = noteInput;
      } else if (active.isContentEditable) {
        editable = active;
      }
    }
    if (!editable) {
      return;
    }
    if (editable.classList.contains('note-input') && editable.contentEditable !== 'true') {
      if (editable.dataset.locked === '1') {
        return;
      }
      beginNoteEdit(editable);
      editable = activeNoteEdit?.input ?? editable;
    }
    if (!editable) {
      return;
    }
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    if (sel && (sel.isCollapsed || !editable.contains(sel.anchorNode))) {
      document.execCommand('selectAll');
    }
    if (activeNoteEdit?.input === editable) {
      saveNoteSelection();
    }
  }

  /**
   * If VS Code's built-in webview selectAll selected past the note,
   * shrink it to the note being edited.
   */
  function clampSelectAllToActiveNote() {
    if (!activeNoteEdit?.input?.isConnected) {
      return;
    }
    const input = activeNoteEdit.input;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      return;
    }
    const range = sel.getRangeAt(0);
    if (input.contains(range.startContainer) && input.contains(range.endContainer)) {
      return;
    }
    selectAllInFocusedField(input);
  }

  /** Undo in the focused text field; otherwise undo map history for the page. */
  function undoInFocusedField() {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      document.execCommand('undo');
      return;
    }
    let editable = active instanceof HTMLElement && active.isContentEditable ? active : null;
    if (editable?.closest?.('.note-input')) {
      editable = /** @type {HTMLElement} */ (editable.closest('.note-input'));
    }
    if (editable) {
      editable.focus();
      document.execCommand('undo');
      if (editable.classList.contains('note-input')) {
        refreshNoteEmptyClass(editable);
      }
      return;
    }
    vscode.postMessage({ type: 'history', direction: 'back', pageId: uiState.activePageId });
  }

  function copyInFocusedField() {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      const start = active.selectionStart ?? 0;
      const end = active.selectionEnd ?? 0;
      const text =
        start !== end ? active.value.slice(start, end) : window.getSelection()?.toString() || '';
      if (text) {
        vscode.postMessage({ type: 'clipboardWrite', text });
      }
      return;
    }
    saveNoteSelection();
    restoreNoteSelection();
    const sel = window.getSelection();
    const text = sel?.toString() || '';
    if (!text) {
      return;
    }
    const codeLang = languageFromCodeSelection(sel);
    if (codeLang) {
      vscode.postMessage({
        type: 'clipboardWrite',
        text,
        languageId: codeLang.languageId,
        label: codeLang.label,
      });
      codeStamp = { text, languageId: codeLang.languageId, label: codeLang.label };
      return;
    }
    vscode.postMessage({ type: 'clipboardWrite', text });
  }

  /**
   * Language of a selection that lies entirely inside one code block.
   * @param {Selection | null | undefined} sel
   * @returns {{ languageId: string, label: string } | undefined}
   */
  function languageFromCodeSelection(sel) {
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
      return undefined;
    }
    const startCode = closestNoteCode(sel.anchorNode);
    const endCode = closestNoteCode(sel.focusNode);
    if (!startCode || startCode !== endCode) {
      return undefined;
    }
    const languageId = startCode.dataset.languageId;
    const label = startCode.dataset.label;
    if (!languageId || !label) {
      return undefined;
    }
    return { languageId, label };
  }

  /**
   * Strip the shared leading indent from a pasted code snippet (e.g. a method
   * copied from inside a class keeps relative indents, drops the outer column).
   * @param {string} text
   * @returns {string}
   */
  function dedentSharedIndent(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n');
    if (!normalized) {
      return normalized;
    }
    const lines = normalized.split('\n');
    /** @type {string[]} */
    const indents = [];
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      const match = /^[ \t]*/.exec(line);
      indents.push(match ? match[0] : '');
    }
    if (!indents.length) {
      return normalized;
    }
    let common = indents[0];
    for (let i = 1; i < indents.length; i++) {
      let j = 0;
      while (j < common.length && j < indents[i].length && common[j] === indents[i][j]) {
        j += 1;
      }
      common = common.slice(0, j);
      if (!common) {
        return normalized;
      }
    }
    if (!common) {
      return normalized;
    }
    return lines.map((line) => (line.startsWith(common) ? line.slice(common.length) : line)).join('\n');
  }

  /**
   * Insert plain text at the current (or saved) caret in the active note.
   * Preserves newlines/indentation (important for code). Prefer insertText for undo.
   * @param {string} text
   * @param {{ languageId?: string, label?: string }} [stamp]
   */
  function insertTextAtNoteCaret(text, stamp) {
    if (!activeNoteEdit) {
      return;
    }
    // Match language stamp against the raw clipboard, then drop shared indent.
    const payload = dedentSharedIndent(text);
    const input = activeNoteEdit.input;
    input.focus();
    restoreNoteSelection();
    let sel = window.getSelection();
    if (!sel || !sel.rangeCount || !input.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      placeCaretAtEnd(input);
      sel = window.getSelection();
    }
    if (!sel || !sel.rangeCount) {
      return;
    }
    const code = closestNoteCode(sel.anchorNode);
    if (code && input.contains(code)) {
      pasteIntoCodeBlock(code, payload, stamp);
      refreshNoteEmptyClass(input);
      saveNoteSelection();
      return;
    }
    // Language-bearing paste from editor/note → insert a real code section.
    if (stamp?.languageId && stamp?.label && payload) {
      insertStampedCodeBlock(payload, stamp.languageId, stamp.label);
      refreshNoteEmptyClass(input);
      saveNoteSelection();
      return;
    }
    // insertText keeps \n and spaces; works inside paste user-gesture and for undo.
    if (payload && document.execCommand('insertText', false, payload)) {
      refreshNoteEmptyClass(input);
      saveNoteSelection();
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(payload);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    refreshNoteEmptyClass(input);
    saveNoteSelection();
  }

  /**
   * Paste language-stamped text as a `pre.note-code` block at the caret.
   * @param {string} text
   * @param {string} languageId
   * @param {string} label
   */
  function insertStampedCodeBlock(text, languageId, label) {
    if (!activeNoteEdit) {
      return;
    }
    const input = activeNoteEdit.input;
    const sel = window.getSelection();
    const pre = el('pre', 'note-code');
    if (sel && sel.rangeCount) {
      insertCodeBlockAtSelection(input, pre, sel, { text, languageId, label });
    } else {
      fillCodeBlock(pre, text, { languageId, label, highlight: false });
      input.append(pre);
    }
    if (!(pre.nextElementSibling instanceof HTMLElement) || !pre.nextElementSibling.classList.contains('note-p')) {
      const after = el('div', 'note-p');
      after.append(document.createElement('br'));
      pre.after(after);
    }
    const after = pre.nextElementSibling;
    if (after instanceof HTMLElement && sel) {
      const caret = document.createRange();
      caret.selectNodeContents(after);
      caret.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caret);
    }
  }

  /**
   * @param {HTMLElement} code
   * @param {string} text
   * @param {{ languageId?: string, label?: string }} [stamp]
   */
  function pasteIntoCodeBlock(code, text, stamp) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      return;
    }
    const range = sel.getRangeAt(0);
    const before = codeTextFromPre(code);
    const fullSelected =
      !sel.isCollapsed && selectionCoversCodeBlock(sel, code) && plainTextFromRange(range) === before;
    const empty = !before;
    // insertText into the body so badge stays out of the text.
    const body = code.querySelector(':scope > .note-code-body');
    if (body instanceof HTMLElement && !body.contains(range.commonAncestorContainer)) {
      // Caret may sit on the pre; place inside body.
      const caret = document.createRange();
      caret.selectNodeContents(body);
      caret.collapse(false);
      sel.removeAllRanges();
      sel.addRange(caret);
    }
    if (text && document.execCommand('insertText', false, text)) {
      // ok
    } else {
      const r = sel.getRangeAt(0);
      r.deleteContents();
      r.insertNode(document.createTextNode(text));
    }
    // Language rules after the text is in the DOM.
    const existingId = code.dataset.languageId;
    if (stamp?.languageId && stamp?.label) {
      if (empty || fullSelected) {
        applyCodeBlockLanguage(code, stamp.languageId, stamp.label);
      } else if (existingId && existingId !== stamp.languageId) {
        applyCodeBlockLanguage(code, undefined, undefined);
      }
    } else if (fullSelected) {
      applyCodeBlockLanguage(code, undefined, undefined);
    }
    // Keep a single body wrapper if the browser flattened the pre.
    ensureCodeBlockBody(code);
  }

  /** @param {HTMLElement} code */
  function ensureCodeBlockBody(code) {
    let body = code.querySelector(':scope > .note-code-body');
    if (!(body instanceof HTMLElement)) {
      const text = codeTextFromPre(code);
      const langId = code.dataset.languageId;
      const langLabel = code.dataset.label;
      fillCodeBlock(code, text, {
        languageId: langId,
        label: langLabel,
        highlight: false,
      });
      return;
    }
    body.querySelectorAll('.note-code-lang').forEach((node) => node.remove());
  }

  /**
   * @param {Selection} sel
   * @param {HTMLElement} code
   */
  function selectionCoversCodeBlock(sel, code) {
    if (!sel.rangeCount) {
      return false;
    }
    const range = sel.getRangeAt(0);
    const body = code.querySelector(':scope > .note-code-body') || code;
    const full = document.createRange();
    full.selectNodeContents(body);
    return (
      range.compareBoundaryPoints(Range.START_TO_START, full) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, full) >= 0
    );
  }

  /**
   * Compare clipboard/stamp texts: ignore CR and a single trailing newline drift.
   * @param {string} a
   * @param {string} b
   */
  function stampTextsMatch(a, b) {
    const na = String(a || '').replace(/\r\n/g, '\n');
    const nb = String(b || '').replace(/\r\n/g, '\n');
    if (na === nb) {
      return true;
    }
    if (na.replace(/\n$/, '') === nb.replace(/\n$/, '')) {
      return true;
    }
    // Indent-only drift (stamp kept original columns; paste path may already dedent).
    return dedentSharedIndent(na) === dedentSharedIndent(nb);
  }

  /**
   * Resolve stamp for pasted text: explicit args, or matching codeStamp.
   * @param {string} text
   * @param {string | undefined} languageId
   * @param {string | undefined} label
   */
  function stampForPaste(text, languageId, label) {
    if (languageId && label) {
      return { languageId, label };
    }
    if (codeStamp?.languageId && codeStamp?.label && stampTextsMatch(codeStamp.text, text)) {
      return { languageId: codeStamp.languageId, label: codeStamp.label };
    }
    return undefined;
  }

  /** @param {string} text @param {string} [languageId] @param {string} [label] */
  function applyPasteInFocusedField(text, languageId, label) {
    const active = document.activeElement;
    if (
      (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
      !active.closest?.('.note-input')
    ) {
      const start = active.selectionStart ?? active.value.length;
      const end = active.selectionEnd ?? start;
      active.setRangeText(text, start, end, 'end');
      active.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (!activeNoteEdit) {
      return;
    }
    const input = activeNoteEdit.input;
    input.focus();
    restoreNoteSelection();
    const sel = window.getSelection();
    const clip = text.trim();
    const code = sel ? closestNoteCode(sel.anchorNode) : null;
    const inCode = !!(code && input.contains(code));
    if (sel && sel.rangeCount && !sel.isCollapsed && !inCode && isPasteableNoteUrl(clip)) {
      const linkLabel = sel.toString();
      if (linkLabel) {
        insertTextAtNoteCaret('[' + linkLabel + '](' + clip + ')');
        return;
      }
    }
    insertTextAtNoteCaret(text, stampForPaste(text, languageId, label));
  }

  /** @param {string} text */
  function isPasteableNoteUrl(text) {
    const trimmed = text.trim();
    // Allow surrounding whitespace already trimmed; reject whitespace inside.
    if (!/^https?:\/\/\S+$/i.test(trimmed)) {
      return false;
    }
    try {
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Note card: root looks like a group; nested looks like a subgroup header with text field.
   * @param {*} note
   * @param {Record<string, *>} noteMap
   */
  function renderNoteCard(note, noteMap) {
    const locked = isLocked(note);
    const childIds = note.children || [];
    const hasChildren = childIds.length > 0;
    const nested = !!(note.markerId || note.parentNote);
    // Any note can fold to its first line (children hide when folded).
    const canFold = true;
    const collapsed = isCollapsed(note.id);
    const section = el(
      'section',
      'group note-card' +
        (collapsed ? ' collapsed' : '') +
        (locked ? ' locked' : '') +
        (nested ? ' nested node' : ''),
    );
    section.dataset.noteId = note.id;
    section.dataset.depth = String(note.depth || 0);
    if (note.color) {
      section.style.setProperty('--group-color', note.color);
    }

    const header = el('div', 'group-header note-header');
    header.draggable = !locked;
    setMapContext(header, {
      webviewSection: 'note',
      noteId: note.id,
      markerId: note.markerId,
      parentNote: note.parentNote,
      depth: note.depth || 0,
      locked,
      hasChildren,
    });
    header.append(el('span', 'chevron', canFold ? '▾' : ''));
    const bar = el('span', 'bar');
    bar.title = locked ? t('noteLocked') : t('changeColor');
    bar.addEventListener('click', (event) => {
      event.stopPropagation();
      if (locked) {
        flashLock(note.id, header);
        return;
      }
      openColorPicker(note.id, bar, section, 'note');
    });
    header.append(bar);
    const input = el('div', 'note-input');
    input.dataset.noteId = note.id;
    input.dataset.raw = note.text || '';
    input.dataset.locked = locked ? '1' : '0';
    input.dataset.placeholder = t('notePlaceholder');
    input.setAttribute('role', 'textbox');
    input.setAttribute('aria-multiline', 'true');
    input.title = locked ? t('noteLocked') : '';
    paintNoteInput(input, note.text || '', { editing: false, locked });
    input.addEventListener('keydown', (event) => {
      if (locked || activeNoteEdit?.input !== input) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        endNoteEdit(input, { restore: true });
        input.blur();
        return;
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        exitCodeBlock(input);
        return;
      }
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        insertNoteLineBreak(input);
        refreshNoteEmptyClass(input);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        endNoteEdit(input);
        input.blur();
        return;
      }
      if (event.key === 'ArrowDown') {
        const code = closestNoteCode(window.getSelection()?.anchorNode || null);
        if (!code || !input.contains(code)) {
          return;
        }
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount || !sel.isCollapsed) {
          return;
        }
        const preRange = document.createRange();
        preRange.selectNodeContents(code);
        const caret = sel.getRangeAt(0);
        if (caret.compareBoundaryPoints(Range.END_TO_END, preRange) >= 0) {
          event.preventDefault();
          exitCodeBlock(input);
        }
        return;
      }
      if (event.key === 'ArrowUp') {
        const code = closestNoteCode(window.getSelection()?.anchorNode || null);
        if (!code || !input.contains(code)) {
          return;
        }
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount || !sel.isCollapsed) {
          return;
        }
        if (caretOnFirstCodeLine(code, sel.getRangeAt(0))) {
          event.preventDefault();
          enterBeforeCodeBlock(input);
        }
      }
    });
    input.addEventListener('beforeinput', (event) => {
      if (locked || activeNoteEdit?.input !== input) {
        return;
      }
      if (event.inputType !== 'insertText' || !event.data) {
        return;
      }
      if (!pendingNoteMarks.bold && !pendingNoteMarks.quote && !pendingNoteMarks.color) {
        return;
      }
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed) {
        return;
      }
      if (closestNoteCode(sel.anchorNode)) {
        return;
      }
      event.preventDefault();
      let node = /** @type {Node} */ (document.createTextNode(event.data));
      if (pendingNoteMarks.quote) {
        const wrap = el('span', 'note-quote');
        wrap.append(node);
        node = wrap;
      }
      if (pendingNoteMarks.color) {
        const wrap = el('span');
        wrap.style.color = pendingNoteMarks.color;
        wrap.append(node);
        node = wrap;
      }
      if (pendingNoteMarks.bold) {
        const wrap = el('b');
        wrap.append(node);
        node = wrap;
      }
      const range = sel.getRangeAt(0);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      refreshNoteEmptyClass(input);
    });
    input.addEventListener('input', () => {
      refreshNoteEmptyClass(input);
    });
    input.addEventListener('paste', (event) => {
      if (locked || activeNoteEdit?.input !== input) {
        return;
      }
      // Always take text/plain: HTML paste collapses whitespace/newlines (kills code formatting).
      // Still inside the native paste gesture, so insertText works.
      const raw =
        event.clipboardData?.getData('text/plain') ||
        event.clipboardData?.getData('text/uri-list') ||
        '';
      const clip = raw.trim();
      const sel = window.getSelection();
      const code = sel ? closestNoteCode(sel.anchorNode) : null;
      const inCode = !!(code && input.contains(code));
      if (sel && sel.rangeCount && !sel.isCollapsed && !inCode && isPasteableNoteUrl(clip)) {
        const linkLabel = plainTextFromRange(sel.getRangeAt(0)) || sel.toString();
        if (linkLabel) {
          event.preventDefault();
          event.stopPropagation();
          insertTextAtNoteCaret('[' + linkLabel + '](' + clip + ')');
          return;
        }
      }
      event.preventDefault();
      event.stopPropagation();
      insertTextAtNoteCaret(raw, stampForPaste(raw));
    });
    input.addEventListener('copy', () => {
      // Native copy already filled the clipboard; stamp language if inside one code block.
      window.setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString() || '';
        if (!text) {
          return;
        }
        const codeLang = languageFromCodeSelection(sel);
        if (codeLang) {
          vscode.postMessage({
            type: 'clipboardWrite',
            text,
            languageId: codeLang.languageId,
            label: codeLang.label,
          });
          codeStamp = { text, languageId: codeLang.languageId, label: codeLang.label };
        }
      }, 0);
    });
    input.addEventListener('focus', () => {
      if (locked) {
        return;
      }
      if (activeNoteEdit?.input !== input) {
        beginNoteEdit(input);
      }
    });
    input.addEventListener('blur', () => {
      cancelNoteBlurEnd();
      // Delay past host Cmd/A postMessage so select-all can cancel and keep editing.
      noteBlurTimer = window.setTimeout(() => {
        noteBlurTimer = null;
        if (activeNoteEdit?.input !== input) {
          return;
        }
        const next = document.activeElement;
        if (next === input || (next instanceof Node && input.contains(next))) {
          return;
        }
        if (next instanceof Node && toolbarFormatWrap?.contains(next)) {
          return;
        }
        if (!contextMenu.hidden) {
          return;
        }
        if (pendingClipboardMenu) {
          return;
        }
        if (colorTarget?.kind === 'text') {
          return;
        }
        endNoteEdit(input);
      }, 50);
    });
    input.addEventListener('click', (event) => {
      event.stopPropagation();
      if (locked) {
        flashLock(note.id, header);
        return;
      }
      if (event.target instanceof Element && event.target.closest('a.note-link')) {
        return;
      }
      if (activeNoteEdit?.input !== input) {
        beginNoteEdit(input);
      }
    });
    input.addEventListener('pointerdown', (event) => {
      // Do not let header trackPress treat field presses as fold toggles.
      event.stopPropagation();
    });
    input.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      if (locked) {
        event.preventDefault();
        return;
      }
      // Keep text caret; do not start a header drag from inside the field.
      if (header.draggable) {
        header.draggable = false;
        window.setTimeout(() => {
          if (activeNoteEdit?.input === input) {
            header.draggable = false;
          } else if (input.dataset.locked !== '1') {
            header.draggable = true;
          }
        }, 0);
      }
    });
    const field = el('span', 'group-text note-field');
    field.append(input);
    header.append(field);
    header.append(noteLockButton(note));
    if (hasChildren) {
      header.append(el('span', 'count', String(childIds.length)));
    }
    header.title = locked ? t('locked') : t('dragHint');
    trackPress(header, (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.lock-btn')) {
        return;
      }
      if (locked) {
        flashLock(note.id, header);
        return;
      }
      if (target instanceof Element && (target.closest('.note-input') || target.closest('.bar'))) {
        return;
      }
      if (!canFold) {
        return;
      }
      toggleCollapsed(note.id);
    });
    section.append(header);
    bindNoteSection(section, header, note);

    if (!hasChildren || collapsed) {
      if (collapsed && hasChildren) {
        const dots = el('div', 'dots');
        for (const childId of childIds) {
          const child = noteMap[childId];
          const dot = el('span', 'dot note-dot');
          dot.title = notePlainLabel(child?.text) || t('notePlaceholder');
          dots.append(dot);
        }
        section.append(dots);
      }
      return section;
    }

    const children = el('div', 'children');
    const ordered = childIds
      .map((id) => noteMap[id])
      .filter(Boolean)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
    for (const child of ordered) {
      children.append(renderNoteCard(child, noteMap));
    }
    section.append(children);
    return section;
  }

  function noteLockButton(note) {
    const locked = isLocked(note);
    const button = el('button', 'lock-btn' + (locked ? ' is-locked' : ''));
    button.type = 'button';
    button.title = locked ? t('unlockNote') : t('lockNote');
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', locked ? 'true' : 'false');
    button.append(locked ? lockClosedIcon() : lockOpenIcon());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      vscode.postMessage({ type: 'toggleNoteLock', noteId: note.id });
    });
    button.addEventListener('dragstart', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    return button;
  }

  function bindNoteSection(section, header, note) {
    header.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      if (isLocked(note) || section.classList.contains('is-note-editing') || activeNoteEdit) {
        event.preventDefault();
        return;
      }
      beginDrag(
        event,
        {
          kind: 'note',
          id: note.id,
          depth: note.depth || 0,
          subtreeHeight: note.subtreeHeight || 0,
          label: notePlainLabel(note.text) || t('noteFallback'),
        },
        'move',
        notePlainLabel(note.text) || t('noteFallback'),
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
      const decision = decideNoteDrop(event, section, note, payload);
      applyNoteDecision(event, section, header, note, decision);
    });

    section.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = readPayload(event);
      const decision = decideNoteDrop(event, section, note, payload);
      clearDropHighlights();
      hideDropHint();
      document.body.classList.remove('is-dragging');
      if (!decision || decision.blocked) {
        return;
      }
      if (decision.action === 'place') {
        if (decision.dragKind === 'note') {
          vscode.postMessage({
            type: 'placeNote',
            id: decision.id,
            targetKind: 'note',
            targetId: note.id,
            position: decision.position,
          });
        } else {
          vscode.postMessage({
            type: 'placeMarkerAtNote',
            id: decision.id,
            targetNoteId: note.id,
            position: decision.position,
          });
        }
        return;
      }
      if (decision.action === 'nest' && decision.dragKind === 'note') {
        vscode.postMessage({ type: 'nestNote', id: decision.id, noteId: note.id });
      }
    });
  }

  /**
   * @param {DragEvent} event
   * @param {HTMLElement} section
   * @param {*} note
   * @param {*} payload
   */
  function decideNoteDrop(event, section, note, payload) {
    if (!payload) {
      return null;
    }
    if (payload.kind === 'note') {
      if (payload.id === note.id || isLocked(note)) {
        return { blocked: true };
      }
      const edge = dropEdgePosition(event, section);
      if (edge) {
        return { action: 'place', id: payload.id, position: edge, dragKind: 'note' };
      }
      const nextDepth = (note.depth || 0) + 1 + (payload.subtreeHeight || 0);
      if (nextDepth > MAX_DEPTH) {
        return { blocked: true, reason: 'depth' };
      }
      return { action: 'nest', id: payload.id, dragKind: 'note' };
    }
    if (payload.kind === 'marker') {
      // Markers may sit beside a note at the same scope, not inside it.
      if (note.parentNote || isLocked(note)) {
        return { blocked: true };
      }
      const rect = section.getBoundingClientRect();
      const edge = dropEdgePosition(event, section);
      const position = edge || (event.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      return {
        action: 'place',
        id: payload.id,
        position,
        dragKind: 'marker',
      };
    }
    return { blocked: true };
  }

  function applyNoteDecision(event, section, header, note, decision) {
    clearDropHighlights();
    if (!decision) {
      return;
    }
    if (decision.blocked) {
      section.classList.add('drop-blocked');
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
      return;
    }
    if (decision.action === 'place') {
      showDropEdge(section, decision.position === 'before' ? 'before' : 'after');
    } else if (decision.action === 'nest') {
      section.classList.add('drop-into');
      header.classList.add('drop-into');
    }
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
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
    let pressStarted = false;
    let moved = false;
    let dragged = false;
    let activated = false;
    let x = 0;
    let y = 0;

    node.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        tracking = false;
        pressStarted = false;
        return;
      }
      // Presses inside the note field are for editing, not fold/unfold.
      if (event.target instanceof Element && event.target.closest('.note-input')) {
        tracking = false;
        pressStarted = false;
        return;
      }
      tracking = true;
      pressStarted = true;
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
        pressStarted = false;
        return;
      }
      activated = true;
      pressStarted = false;
      onActivate(event);
    });

    node.addEventListener('pointercancel', () => {
      tracking = false;
      pressStarted = false;
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
      // Selection drag from .note-input often ends with mouseup on the header;
      // the browser then fires click on the common ancestor. Only treat click as
      // a fallback when this node actually received the matching press.
      if (!pressStarted) {
        return;
      }
      pressStarted = false;
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
    setMapContext(node, {
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
    setMapContext(node, {
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
      const decision = decideDrop(event, section, group, payload);
      applyDecision(event, section, header, group, decision);
    });

    section.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = readPayload(event);
      const decision = decideDrop(event, section, group, payload);
      clearDropHighlights();
      hideDropHint();
      document.body.classList.remove('is-dragging');

      if (!decision || decision.blocked) {
        return;
      }
      if (decision.action === 'place') {
        if (decision.dragKind === 'note') {
          vscode.postMessage({
            type: 'placeNote',
            id: decision.id,
            targetKind: 'marker',
            targetId: group.id,
            position: decision.position,
          });
        } else {
          vscode.postMessage({
            type: 'placeMarker',
            id: decision.id,
            target: group.id,
            position: decision.position,
          });
        }
        return;
      }
      if (decision.action === 'nest') {
        if (decision.dragKind === 'note') {
          vscode.postMessage({ type: 'nestNote', id: decision.id, markerId: group.id });
        } else {
          vscode.postMessage({ type: 'nestMarker', id: decision.id, parent: group.id });
        }
        return;
      }
      if (decision.action === 'item') {
        handleItemOrExternalDrop(event, group.id, payload);
      }
    });
  }

  /**
   * @returns {{ action: string, mode: string, hint: string, blocked?: boolean, id?: string, position?: string, dragKind?: string } | null}
   */
  function decideDrop(event, section, group, payload) {
    const notesPage = activePage()?.kind === 'notes';
    if (payload && payload.kind === 'note') {
      if (isLocked(group)) {
        return {
          action: 'nest',
          mode: 'blocked',
          hint: 'Group is locked',
          blocked: true,
          id: payload.id,
          dragKind: 'note',
        };
      }
      const edge = dropEdgePosition(event, section);
      if (edge) {
        return {
          action: 'place',
          mode: edge,
          hint: (edge === 'before' ? 'Place before "' : 'Place after "') + group.label + '"',
          id: payload.id,
          position: edge,
          dragKind: 'note',
        };
      }
      return {
        action: 'nest',
        mode: 'into',
        hint: 'Nest into "' + group.label + '"',
        id: payload.id,
        dragKind: 'note',
      };
    }
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
      const edge = dropEdgePosition(event, section);
      if (edge) {
        return {
          action: 'place',
          mode: edge,
          hint: (edge === 'before' ? 'Place before "' : 'Place after "') + group.label + '"',
          id: payload.id,
          position: edge,
        };
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
    const same =
      dropHighlight &&
      dropHighlight.section === section &&
      dropHighlight.mode === mode &&
      dropHighlight.header === header;
    if (mode === 'before' || mode === 'after') {
      if (!same) {
        clearDropHighlights();
        dropHighlight = { section, header, mode };
      }
      showDropEdge(section, mode);
      return;
    }
    if (same) {
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
    if (header && mode === 'into') {
      header.classList.add('drop-into');
    }
  }

  /**
   * Band thickness. Full 16px on a tall card. On a short card each band is at
   * most a third of the height, so the middle stays a nest target.
   * @param {number} height
   */
  function dropEdgeSize(height) {
    if (!(height > 0)) {
      return 0;
    }
    return Math.min(DROP_EDGE, height / 3);
  }

  /**
   * Reorder band: top or bottom edge of the card. A nested child that
   * stops the event keeps the pointer; only the free edge reaches here.
   * @param {DragEvent} event
   * @param {HTMLElement} section
   * @returns {'before' | 'after' | null}
   */
  function dropEdgePosition(event, section) {
    const rect = section.getBoundingClientRect();
    const edge = dropEdgeSize(rect.height);
    if (edge <= 0) {
      return null;
    }
    const y = event.clientY - rect.top;
    const fromBottom = rect.height - y;
    if (y <= edge && fromBottom <= edge) {
      return y <= fromBottom ? 'before' : 'after';
    }
    if (y <= edge) {
      return 'before';
    }
    if (fromBottom <= edge) {
      return 'after';
    }
    return null;
  }

  /**
   * Root card fills its column. Inside a group the band uses that group's width.
   * @param {HTMLElement} section
   */
  function dropEdgeContainer(section) {
    if (section.classList.contains('nested')) {
      const parent = section.parentElement?.closest('section.group');
      if (parent instanceof HTMLElement) {
        return parent;
      }
    }
    return section;
  }

  /**
   * @param {HTMLElement} section
   * @param {'before' | 'after'} position
   */
  function showDropEdge(section, position) {
    const rect = section.getBoundingClientRect();
    const box = dropEdgeContainer(section).getBoundingClientRect();
    const edge = dropEdgeSize(rect.height);
    const top = position === 'before' ? rect.top : Math.max(rect.top, rect.bottom - edge);
    dropEdge.hidden = false;
    dropEdge.style.top = top + 'px';
    dropEdge.style.height = edge + 'px';
    dropEdge.style.left = box.left + 'px';
    dropEdge.style.width = Math.max(0, box.width) + 'px';
    dropEdge.classList.toggle('at-top', Math.abs(top - box.top) < 1);
    dropEdge.classList.toggle('at-bottom', edge > 0 && Math.abs(top + edge - box.bottom) < 1);
    section.classList.add('drop-edge-target');
  }

  function hideDropEdge() {
    dropEdge.hidden = true;
    dropEdge.style.width = '';
    dropEdge.classList.remove('at-top', 'at-bottom');
    for (const node of root.querySelectorAll('.drop-edge-target')) {
      node.classList.remove('drop-edge-target');
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
    hideDropEdge();
    if (dropHighlight) {
      dropHighlight.section.classList.remove('drop-target', 'drop-into', 'drop-blocked', 'drop-edge-target');
      dropHighlight.header?.classList.remove('drop-before', 'drop-after', 'drop-into');
      dropHighlight = null;
    }
    for (const node of root.querySelectorAll('.drop-before, .drop-after, .drop-into, .drop-target, .drop-blocked, .drop-edge-target')) {
      node.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-target', 'drop-blocked', 'drop-edge-target');
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

  function setMapContext(node, context) {
    node.dataset.syn3Context = JSON.stringify(context);
  }

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'color-input';
  colorInput.tabIndex = -1;
  document.body.append(colorInput);

  /** @type {{ kind: 'marker' | 'note' | 'text', id?: string, section?: HTMLElement } | null} */
  let colorTarget = null;

  colorInput.addEventListener('input', () => {
    if (colorTarget?.kind === 'text') {
      return;
    }
    colorTarget?.section?.style.setProperty('--group-color', colorInput.value);
  });
  colorInput.addEventListener('change', () => {
    if (colorTarget) {
      if (colorTarget.kind === 'text') {
        applyTextColor(colorInput.value);
      } else if (colorTarget.kind === 'note' && colorTarget.id) {
        vscode.postMessage({ type: 'setColor', noteId: colorTarget.id, color: colorInput.value });
      } else if (colorTarget.id) {
        vscode.postMessage({ type: 'setColor', markerId: colorTarget.id, color: colorInput.value });
      }
    }
    colorTarget = null;
    if (activeNoteEdit) {
      activeNoteEdit.input.focus();
    }
  });
  colorInput.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (colorTarget?.kind !== 'text') {
        return;
      }
      colorTarget = null;
      activeNoteEdit?.input.focus();
    }, 0);
  });

  /**
   * Opens the system color picker; must be called from a user gesture.
   * @param {string} id
   * @param {HTMLElement} bar
   * @param {HTMLElement} section
   * @param {'marker' | 'note'} [kind]
   */
  function openColorPicker(id, bar, section, kind = 'marker') {
    const rect = bar.getBoundingClientRect();
    colorInput.style.left = rect.left + 'px';
    colorInput.style.top = rect.bottom + 'px';
    colorInput.value = toHex(getComputedStyle(bar).backgroundColor) || '#8b8d98';
    colorTarget = { kind, id, section };
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
