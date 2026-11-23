// @ts-check
(function () {
  // @ts-ignore acquireVsCodeApi is provided by the webview, or stashed by the boot script.
  const vscode = /** @type {any} */ (window).__syn3Vscode || acquireVsCodeApi();
  const bootRev = document.body?.dataset.bootRev || '';
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
  const toolbarReviewTab = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-review-tab'));
  const reviewFilters = /** @type {HTMLElement | null} */ (document.getElementById('review-filters'));
  const reviewFilterCheckout = /** @type {HTMLButtonElement | null} */ (document.getElementById('review-filter-checkout'));
  const reviewFilterGeneral = /** @type {HTMLButtonElement | null} */ (document.getElementById('review-filter-general'));
  const reviewFilterDiscussions = /** @type {HTMLButtonElement | null} */ (document.getElementById('review-filter-discussions'));
  const reviewTalk = /** @type {HTMLElement | null} */ (document.getElementById('review-talk'));
  const reviewTalkSourceRow = /** @type {HTMLElement | null} */ (document.getElementById('review-talk-source'));
  const reviewTalkSourceLabel = /** @type {HTMLElement | null} */ (document.getElementById('review-talk-source-label'));
  const reviewTalkSourceClear = /** @type {HTMLButtonElement | null} */ (document.getElementById('review-talk-source-clear'));
  const reviewTalkInput = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('review-talk-input'));
  const reviewTalkSend = /** @type {HTMLButtonElement | null} */ (document.getElementById('review-talk-send'));
  /** @type {Map<string, { messageId: string, label: string }>} */
  const reviewTalkSource = new Map();
  let reviewTalkBusy = false;
  const reviewFilePane = /** @type {HTMLElement | null} */ (document.getElementById('review-file'));
  const reviewFileTitle = /** @type {HTMLElement | null} */ (document.getElementById('review-file-title'));
  const reviewFileBody = /** @type {HTMLElement | null} */ (document.getElementById('review-file-body'));
  const reviewFileClose = /** @type {HTMLButtonElement | null} */ (document.getElementById('review-file-close'));
  const reviewFileGrow = /** @type {HTMLButtonElement | null} */ (document.getElementById('review-file-grow'));
  const reviewFileShrink = /** @type {HTMLButtonElement | null} */ (document.getElementById('review-file-shrink'));
  const reviewFileSave = /** @type {HTMLButtonElement | null} */ (document.getElementById('review-file-save'));
  const reviewFixesPane = /** @type {HTMLElement | null} */ (document.getElementById('review-fixes'));
  const reviewFixesBody = /** @type {HTMLElement | null} */ (document.getElementById('review-fixes-body'));
  const reviewFixesClose = /** @type {HTMLButtonElement | null} */ (document.getElementById('review-fixes-close'));
  const explainFilePane = /** @type {HTMLElement | null} */ (document.getElementById('explain-file'));
  const explainFileTitle = /** @type {HTMLElement | null} */ (document.getElementById('explain-file-title'));
  const explainFileBody = /** @type {HTMLElement | null} */ (document.getElementById('explain-file-body'));
  const explainFileClose = /** @type {HTMLButtonElement | null} */ (document.getElementById('explain-file-close'));
  const explainFileGrow = /** @type {HTMLButtonElement | null} */ (document.getElementById('explain-file-grow'));
  const explainFileShrink = /** @type {HTMLButtonElement | null} */ (document.getElementById('explain-file-shrink'));
  const explainFileSave = /** @type {HTMLButtonElement | null} */ (document.getElementById('explain-file-save'));
  const toolbarExplorer = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-explorer'));
  const toolbarMore = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-more'));
  const toolbarMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-menu'));
  const toolbarMoreWrap = /** @type {HTMLElement | null} */ (document.querySelector('.toolbar-more'));
  const toolbarFormatWrap = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-format-wrap'));
  const toolbarFormat = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-format'));
  const toolbarFormatMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-format-menu'));
  const toolbarProject = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-project'));
  const toolbarProjectMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-project-menu'));
  const toolbarProjectList = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-project-list'));
  const toolbarProjectAdd = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-project-add'));
  const toolbarProjectWrap = /** @type {HTMLElement | null} */ (document.querySelector('.toolbar-project'));
  const toolbarLock = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-lock'));
  const toolbarProfile = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-profile'));
  const toolbarProfileMenu = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-profile-menu'));
  const toolbarProfileList = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-profile-list'));
  const toolbarProfileAdd = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-profile-add'));
  const toolbarProfileWrap = /** @type {HTMLElement | null} */ (document.querySelector('.toolbar-profile'));
  const toolbarCloudCheck = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-cloud-check'));
  const toolbarCloudPull = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-cloud-pull'));
  const toolbarCloudPush = /** @type {HTMLButtonElement | null} */ (document.getElementById('toolbar-cloud-push'));
  const toolbarBaseLoader = /** @type {HTMLElement | null} */ (document.getElementById('toolbar-base-loader'));
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

  /** @type {{ kind: 'toolbar' | 'toolbar-create' | 'context', viewExpanded: boolean, createExpanded?: boolean, deleteExpanded?: boolean, pullExpanded?: boolean, reviewExpanded?: boolean, reviewScope?: '' | 'branch' | 'changes', explainExpanded?: boolean, explainScope?: '' | 'branch' | 'changes', reviewStatusExpanded?: boolean, neurofixExpanded?: boolean, rereviewExpanded?: boolean, studyExpanded?: boolean, ctx?: Record<string, unknown>, x?: number, y?: number } | null} */
  let openMenuState = null;
  /**
   * Host branch picker for «Подтянуть → другая ветка» / «Создать ревью → другая ветка» / «Что сделано → другая ветка».
   * @type {{
   *   mode: 'pull' | 'review' | 'explain',
   *   pageId: string,
   *   parentMessageId?: string,
   *   currentBranch: string,
   *   branches: string[],
   *   nextPage: number | undefined,
   *   loading: boolean,
   *   step: 'branches' | 'bases',
   *   selectedBranch?: string,
   *   selectedDepth?: string,
   *   parentBranch?: string,
   *   selectedBase?: string,
   *   requestId?: string,
   *   query?: string,
   *   activeQuery?: string,
   *   pendingSearchFocus?: boolean,
   * } | null}
   */
  let branchPicker = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let branchSearchTimer = null;
  const BRANCH_SEARCH_MS = 3000;
  /** @type {HTMLElement | null} */
  let branchDepthMenu = null;
  /** Create-menu «Создать ревью» uses the same scope/depth flyout as the MR chip. */
  const MENU_CLOSE_MS = 300;
  /** Pointer travel from the click before an unentered context menu dismisses. */
  const CONTEXT_AWAY_PX = 24;
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const menuCloseTimers = new Map();

  /** @type {{ noteId: string, input: HTMLElement, lastSaved: string, locked: boolean } | null} */
  let activeNoteEdit = null;
  /** Last note edited — survives blur race with host Cmd/A. */
  let lastNoteEditId = '';
  /** Expand-then-edit: note id + how many paints left to re-focus (local + host state). */
  let pendingEditAfterExpandId = '';
  let pendingEditAfterExpandPaints = 0;
  /**
   * Caret captured from a click on a folded note, applied after the expand paints.
   * @type {{ noteId: string, blockIndex: number, offset: number } | null}
   */
  let pendingNoteCaret = null;
  /**
   * Click point from pointerdown, in case focus starts editing before the click event.
   * @type {{ input: HTMLElement, x: number, y: number, at: number } | null}
   */
  let notePointer = null;
  /**
   * Single click on note text waits this long so a double-click can edit
   * before focus/expand repaints the card and drops the second click.
   */
  const NOTE_CLICK_MS = 220;
  /** Wait before folding a group, so a second click can open settings on the same header. */
  const GROUP_CLICK_MS = 120;
  /** Second press on the same group within this window opens settings instead of folding. */
  const GROUP_DOUBLE_MS = 600;
  /**
   * Header click kept off the DOM node. A repaint between the two presses must
   * not drop the double-click, and must not fold once the second press starts.
   * @type {{ id: string, at: number, timer: number, folded: boolean, held: boolean } | null}
   */
  let pendingGroupFold = null;
  /**
   * Fold already applied locally. A focus refresh can still deliver the
   * snapshot taken before setCollapsed, and that snapshot would undo the click.
   * @type {{ pageId: string, id: string, on: boolean, until: number } | null}
   */
  let groupFoldSync = null;
  /** Movement past this many pixels is a text selection, not a click. */
  const NOTE_DRAG_PX = 8;
  /**
   * @typedef {Object} NoteClickGesture
   * @property {string} noteId
   * @property {HTMLElement} input
   * @property {number} x
   * @property {number} y
   * @property {string} linkUrl
   * @property {boolean} moved
   * @property {boolean} locked
   * @property {'down' | 'waiting' | 'second'} phase
   * @property {number} upAt
   * @property {number} timer
   * @property {number} pointerId
   */
  /** @type {NoteClickGesture | null} */
  let noteClickGesture = null;
  /**
   * A note click already counted, waiting until the press that interrupted it
   * finishes. Applying it mid-pointerdown repaints and drops that press.
   * @type {NoteClickGesture | null}
   */
  let queuedNoteClick = null;
  /** Press-drag on note text; the click that follows must not activate the note. */
  let notePressWasDrag = false;
  /** Double-click just opened the editor; swallow the word-select that dblclick would apply. */
  let noteDoubleEditAt = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let noteBlurTimer = null;
  /**
   * bold: null follows the caret, true/false forces the next insert.
   * color: null follows the caret, a hex forces the next insert.
   * @type {{ bold: boolean | null, quote: boolean, color: string | null }}
   */
  let pendingNoteMarks = { bold: null, quote: false, color: null };
  /** Spans painted by the open text-color picker, so later picker events recolor them. */
  let liveTextColorSpans = /** @type {HTMLElement[] | null} */ (null);
  /** Skip caret-follow resets while we move the selection ourselves. */
  let markSyncDepth = 0;
  /** Re-entrancy guard for link chips, which move the caret. */
  let linkifyBusy = false;
  /** Double-space at the end of bold, color, or quote: following inserts stay plain until the caret moves. */
  let formattingReleased = false;
  /** @type {Range | null} */
  let savedNoteSelection = null;
  let linkPreviewRequest = 0;
  /** @type {string | null} */
  let linkPreviewPendingId = null;
  /** @type {HTMLElement | null} */
  let linkPreviewEl = null;
  /** Spinner beside the chip while its preview is still loading. */
  /** @type {HTMLElement | null} */
  let linkPreviewLoaderEl = null;
  /** Request whose chip spinner is showing. An older result must not hide the next one. */
  /** @type {string | null} */
  let linkPreviewLoaderRequestId = null;
  /** @type {number} */
  let linkPreviewLoaderTimer = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let linkPreviewHideTimer = null;
  /** @type {string | null} */
  let linkPreviewUrl = null;
  /** Bumped when the page changes so a preview from the previous page cannot stay or reopen. */
  let linkPreviewGen = 0;
  /** Generation captured when the current preview was shown. */
  let linkPreviewShownGen = 0;
  /** Matches figmaLinkPreviewEnabled in src/figmaLink.ts. Hover must not render frames. */
  const figmaLinkPreviewEnabled = false;
  /** Dragging a Figma frame. Mouseleave must not close the card mid-pan. */
  let linkPreviewPanning = false;
  let clipboardRequestId = 0;
  /** Hides «данные скилла скопированы» after a skill copy in review settings. */
  let reviewSkillCopiedTimer = 0;
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

  reviewFilterCheckout?.addEventListener('click', () => postReviewFilter('checkout'));
  reviewFilterGeneral?.addEventListener('click', () => postReviewFilter('general'));
  reviewFilterDiscussions?.addEventListener('click', () => postReviewFilter('discussions'));

  toolbarView?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!toolbarViewMenu || toolbarView?.disabled) {
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
    if (toolbarView?.disabled || !toolbarViewMenu || !toolbarViewMenu.hidden) {
      return;
    }
    closeToolbarMenus();
    closeContextMenu();
    openToolbarViewMenu();
  });
  toolbarViewWrap?.addEventListener('mouseleave', () => {
    if (toolbarViewMenu && !toolbarViewMenu.hidden) {
      scheduleMenuClose('toolbar-view', () => closeToolbarViewMenu());
    }
  });
  toolbarCreate?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (toolbarCreate?.disabled) {
      return;
    }
    if (isLinkMapKind(activePage()?.kind)) {
      cancelMenuClose();
      closeToolbarMenus();
      closeContextMenu();
      postToolbar('createLinkLayout');
      return;
    }
    if (activePage()?.kind === 'scenarios') {
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
      return;
    }
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
    if (toolbarCreate?.disabled || isLinkMapKind(activePage()?.kind) || activePage()?.kind === 'scenarios') {
      return;
    }
    if (!toolbarCreateMenu || !toolbarCreateMenu.hidden) {
      return;
    }
    closeToolbarMenus();
    closeContextMenu();
    openToolbarCreateMenu();
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
    if (activePage()?.kind === 'review') {
      setAllReviewCollapsed(!allTopCollapsed());
      return;
    }
    if (activePage()?.kind === 'scenarios') {
      setAllScenarioCollapsed(!allTopCollapsed());
      return;
    }
    postToolbar(allTopCollapsed() ? 'expandGroups' : 'collapseGroups');
  });
  toolbarReviewTab?.addEventListener('click', () => {
    if (!reviewFileView || reviewFileView.status !== 'ready') {
      return;
    }
    vscode.postMessage({
      type: 'reviewOpenFileTab',
      pageId: reviewFileView.pageId,
      messageId: reviewFileView.messageId,
      filenames: reviewFileView.levelNote ? reviewFileView.filenames : undefined,
    });
  });
  reviewFileClose?.addEventListener('click', () => {
    closeReviewFileView();
  });
  reviewFileGrow?.addEventListener('click', () => {
    stepReviewFont(0.05);
  });
  reviewFileShrink?.addEventListener('click', () => {
    stepReviewFont(-0.05);
  });
  reviewFileSave?.addEventListener('click', () => {
    if (!reviewFileView || reviewFileView.status !== 'ready') {
      return;
    }
    vscode.postMessage({
      type: 'reviewSaveFile',
      pageId: reviewFileView.pageId,
      messageId: reviewFileView.messageId,
    });
  });
  explainFileClose?.addEventListener('click', () => {
    closeExplainFileView();
  });
  explainFileGrow?.addEventListener('click', () => {
    stepReviewFont(0.05);
  });
  explainFileShrink?.addEventListener('click', () => {
    stepReviewFont(-0.05);
  });
  explainFileSave?.addEventListener('click', () => {
    if (!explainFileView || explainFileView.status !== 'ready') {
      return;
    }
    vscode.postMessage({
      type: 'reviewSaveFile',
      pageId: explainFileView.pageId,
      messageId: explainFileView.messageId,
    });
  });
  reviewFixesClose?.addEventListener('click', () => {
    closeReviewFixesView();
  });
  reviewFileBody?.addEventListener('click', openReviewFileLink);
  explainFileBody?.addEventListener('click', openReviewFileLink);
  reviewFixesBody?.addEventListener('click', openReviewFileLink);
  toolbarExplorer?.addEventListener('click', () => {
    cancelMenuClose();
    closeToolbarMenus();
    closeContextMenu();
    postToolbar('toggleExplorer');
  });
  toolbarPanels?.addEventListener('click', (event) => {
    event.stopPropagation();
    openToolbarPanelsMenu();
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
    openToolbarPanelsMenu();
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
    openToolbarMoreMenu();
  });
  toolbarMenu?.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target : null);
    const button = target?.closest('button');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return;
    }
    if (button.id === 'menu-create-page') {
      event.stopPropagation();
      const sub = document.getElementById('menu-create-page-sub');
      if (sub) {
        const open = sub.hidden;
        sub.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      return;
    }
    const action = button.dataset.action;
    if (!action) {
      return;
    }
    cancelMenuClose();
    closeToolbarMenus();
    const sub = document.getElementById('menu-create-page-sub');
    if (sub) {
      sub.hidden = true;
    }
    document.getElementById('menu-create-page')?.setAttribute('aria-expanded', 'false');
    postToolbar(action);
  });
  toolbarMoreWrap?.addEventListener('mouseenter', () => {
    openToolbarMoreMenu();
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

  toolbarProjectWrap?.addEventListener('mouseenter', () => {
    cancelMenuClose('toolbar-project');
    closeToolbarMenus();
    closeContextMenu();
    if (toolbarProjectMenu) {
      toolbarProjectMenu.hidden = false;
      toolbarProject?.setAttribute('aria-expanded', 'true');
    }
  });
  toolbarProjectWrap?.addEventListener('mouseleave', () => {
    scheduleMenuClose('toolbar-project', () => closeProjectMenu());
  });
  toolbarProjectAdd?.addEventListener('click', (event) => {
    event.stopPropagation();
    closeProjectMenu();
    vscode.postMessage({ type: 'project', action: 'create' });
  });
  toolbarProjectList?.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const actionBtn = target?.closest('[data-project-action]');
    if (actionBtn instanceof HTMLElement) {
      return;
    }
    const row = target?.closest('[data-project-id]');
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const id = row.getAttribute('data-project-id');
    if (!id || id === activeProjectId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    vscode.postMessage({ type: 'project', action: 'select', id });
    closeProjectMenu();
  });
  toolbarProjectList?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const actionBtn = target?.closest('[data-project-action]');
    if (actionBtn instanceof HTMLElement) {
      event.stopPropagation();
      const action = actionBtn.getAttribute('data-project-action');
      if (action === 'join') {
        if (baseConfigBusy || (actionBtn instanceof HTMLButtonElement && actionBtn.disabled)) {
          return;
        }
        vscode.postMessage({ type: 'project', action: 'create', mode: 'select' });
        closeProjectMenu();
        return;
      }
      if (action === 'edit') {
        const id = actionBtn.getAttribute('data-project-id');
        if (id) {
          vscode.postMessage({ type: 'projectOpenSettings', id });
          closeProjectMenu();
        }
        return;
      }
      return;
    }
    const row = target?.closest('[data-project-id]');
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const id = row.getAttribute('data-project-id');
    if (!id) {
      return;
    }
    vscode.postMessage({ type: 'project', action: 'select', id });
    closeProjectMenu();
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
    closeProfileMenu();
    vscode.postMessage({ type: 'profileOpenSettings' });
  });
  toolbarLock?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (toolbarLock.disabled) {
      return;
    }
    pagesFixed = !pagesFixed;
    applyToolbarLock();
    renderPager();
    vscode.postMessage({ type: 'setPagesFixed', fixed: pagesFixed });
  });
  toolbarProfileList?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const actionBtn = target?.closest('[data-profile-action]');
    if (actionBtn instanceof HTMLElement) {
      event.stopPropagation();
      const action = actionBtn.getAttribute('data-profile-action');
      const id = actionBtn.getAttribute('data-profile-id') || undefined;
      if (action === 'edit') {
        vscode.postMessage({ type: 'profileOpenSettings', id });
        closeProfileMenu();
        return;
      }
      if (action === 'delete') {
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
  /** @type {((event: PointerEvent) => void) | null} */
  let contextDismissMove = null;

  /**
   * @param {HTMLElement | null} menu
   * @param {number} x
   * @param {number} y
   */
  function menuBoxContains(menu, x, y) {
    if (!menu || menu.hidden) {
      return false;
    }
    const rect = menu.getBoundingClientRect();
    return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
  }

  function clearContextDismissMove() {
    if (!contextDismissMove) {
      return;
    }
    document.removeEventListener('pointermove', contextDismissMove, true);
    contextDismissMove = null;
  }

  /**
   * replaceChildren can synthesize mouseleave. Ignore that until the pointer
   * actually moves — mouseenter never fires if the menu opened off the cursor
   * (flipped above the click), so the first real move must both unlock leave
   * and dismiss when the pointer stays outside.
   */
  function armContextMenuDismiss() {
    ignoreContextLeave = true;
    clearContextDismissMove();
    const originX = openMenuState?.x ?? 0;
    const originY = openMenuState?.y ?? 0;
    contextDismissMove = (event) => {
      if (contextMenu.hidden) {
        clearContextDismissMove();
        ignoreContextLeave = false;
        return;
      }
      ignoreContextLeave = false;
      if (
        menuBoxContains(contextMenu, event.clientX, event.clientY) ||
        menuBoxContains(reviewDepthMenu, event.clientX, event.clientY) ||
        menuBoxContains(neuroFixMenu, event.clientX, event.clientY)
      ) {
        clearContextDismissMove();
        return;
      }
      const dx = event.clientX - originX;
      const dy = event.clientY - originY;
      if (dx * dx + dy * dy < CONTEXT_AWAY_PX * CONTEXT_AWAY_PX) {
        return;
      }
      clearContextDismissMove();
      scheduleMenuClose('context', () => closeContextMenu());
    };
    document.addEventListener('pointermove', contextDismissMove, true);
  }

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
  bindReviewTalk();
  const bodySide = document.body.getAttribute('data-side');
  if (bodySide === 'left' || bodySide === 'right') {
    uiState.side = bodySide;
    vscode.setState(uiState);
  }
  /** Local to this webview — not persisted in setState. */
  let problemsPageOpen = false;
  let debugPageOpen = false;
  /** @type {{ sections: Array<{ id: string, title: string, reason?: string, left: Record<string, unknown>, right: Record<string, unknown> }> } | null} */
  let debugDiffSnapshot = null;
  let debugDiffBusy = false;
  /** True after a diff fetch started while Send was on. Stops a frozen empty screen from lying. */
  let debugFetchedForPush = false;
  /** @type {any} */
  let data = null;
  /** @type {Record<string, { canPull?: boolean, canPush?: boolean }>} */
  let pageConfigSync = {};
  /** Page tabs show the fixed mark. */
  let pagesFixed = false;
  /** Lock value already published. Differs from pagesFixed while that change is unsent. */
  let pagesFixedSent = false;
  /** @type {{ id: string, name: string, active?: boolean }[]} */
  let projectsList = [];
  let activeProjectId = '';
  /** @type {{ canPush?: boolean, canPull?: boolean }} */
  let projectConfigSync = {};
  let canToggleProjectLock = true;
  /** Batch send/receive of page configs is in flight. */
  let pageCloudBusy = false;
  /** Project / profile Discord sync in flight. */
  let baseConfigBusy = false;
  /** @type {Record<string, string[]>} */
  let pageDrafts = {};
  /** Path from assets/download-cloud-2-fill.svg */
  const CLOUD_DOWNLOAD_D =
    'M13 13V18.585L14.8284 16.7574L16.2426 18.1716L12 22.4142L7.75736 18.1716L9.17157 16.7574L11 18.585V13H13ZM12 2C15.5934 2 18.5544 4.70761 18.9541 8.19395C21.2858 8.83154 23 10.9656 23 13.5C23 16.3688 20.8036 18.7246 18.0006 18.9776L18 17C18 13.6863 15.3137 11 12 11C8.7616 11 6.12243 13.5656 6.00414 16.7751L6 17L6.00039 18.9776C3.19696 18.7252 1 16.3692 1 13.5C1 10.9656 2.71424 8.83154 5.04648 8.19411C5.44561 4.70761 8.40661 2 12 2Z';
  /** Path from assets/upload-cloud-2-fill.svg */
  const CLOUD_UPLOAD_D =
    'M12 12.5858L16.2426 16.8284L14.8284 18.2426L13 16.415V22H11V16.413L9.17157 18.2426L7.75736 16.8284L12 12.5858ZM12 2C15.5934 2 18.5544 4.70761 18.9541 8.19395C21.2858 8.83154 23 10.9656 23 13.5C23 16.3688 20.8036 18.7246 18.0006 18.9776L18 17C18 13.6863 15.3137 11 12 11C8.7616 11 6.12243 13.5656 6.00414 16.7751L6 17L6.00039 18.9776C3.19696 18.7252 1 16.3692 1 13.5C1 10.9656 2.71424 8.83154 5.04648 8.19411C5.44561 4.70761 8.40661 2 12 2Z';
  /** Path from assets/delete-bin-2-fill.svg */
  const PROJECT_DELETE_D =
    'M7 6V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7ZM13.4142 13.9997L15.182 12.232L13.7678 10.8178L12 12.5855L10.2322 10.8178L8.81802 12.232L10.5858 13.9997L8.81802 15.7675L10.2322 17.1817L12 15.4139L13.7678 17.1817L15.182 15.7675L13.4142 13.9997ZM9 4V6H15V4H9Z';
  /** Path from assets/reload.svg */
  const CLOUD_RELOAD_D =
    'M12 4C14.5905 4 16.8939 5.23053 18.3573 7.14274L16 9.5H22V3.5L19.7814 5.71863C17.9494 3.452 15.1444 2 12 2C6.47715 2 2 6.47715 2 12H4C4 7.58172 7.58172 4 12 4ZM20 12C20 16.4183 16.4183 20 12 20C9.40951 20 7.10605 18.7695 5.64274 16.8573L8 14.5H2V20.5L4.21863 18.2814C6.05062 20.548 8.85557 22 12 22C17.5228 22 22 17.5228 22 12H20Z';
  /** Discord pages waiting to be created by pull. */
  let pendingRemoteCount = 0;
  /** At least one Discord config channel is configured. */
  let hasConfigChannel = false;
  /** Drops a state push that lost the race with a newer one. */
  let stateSeq = 0;
  /** Bumped when map data changes. Same revision means a visited page can be shown from cache. */
  let bodyRev = -1;
  /** @type {Map<string, { groups: any[], notes: any[], links: any[] }>} */
  const pageBodies = new Map();
  const pager = /** @type {HTMLElement | null} */ (document.getElementById('pager'));
  /** @type {string | null} */
  let pageDragId = null;
  /** Last pager-chip click. A second press still counts after the chip is rebuilt. */
  let pageChipClick = { id: '', at: 0 };
  let wheelLock = false;
  /** @type {any} */
  let dragPayload = null;
  /** @type {{ section: HTMLElement, header?: HTMLElement, mode: string } | null} */
  let dropHighlight = null;
  /** @type {{ groupId: string, blockKind: string, index: number } | null} */
  let dropSlotState = null;
  /** @type {HTMLElement | null} */
  let dropSlotEl = null;
  /** Pending cross-group chip drop waiting for Move / Copy / OK. */
  /** @type {{ kind: 'item' | 'class', relPath?: string, classId?: string, from: string, to: string, isDir?: boolean, blockKind: string, index: number } | null} */
  let pendingChipDrop = null;
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let expandDropTimer = 0;
  /** @type {string | null} */
  let expandDropTargetId = null;
  const EXPAND_DROP_MS = 500;

  const dropHint = el('div', 'drop-hint');
  dropHint.hidden = true;
  document.body.append(dropHint);

  const dropEdge = el('div', 'drop-edge');
  dropEdge.hidden = true;
  document.body.append(dropEdge);

  const dropDialog = el('div', 'drop-dialog');
  dropDialog.hidden = true;
  dropDialog.setAttribute('role', 'dialog');
  dropDialog.setAttribute('aria-modal', 'true');
  document.body.append(dropDialog);
  /** @type {'' | 'drop' | 'choice'} */
  let dialogKind = '';
  /** @type {(() => void) | null} */
  let choiceDismiss = null;

  const refactorBanner = el('div', 'refactor-banner');
  refactorBanner.hidden = true;
  document.body.append(refactorBanner);
  /** @type {number | null} */
  let seenRefactorEpoch = null;
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let refactorTimer = 0;

  const markTip = el('div', 'mark-tip');
  markTip.hidden = true;
  markTip.setAttribute('role', 'tooltip');
  document.body.append(markTip);
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let markTipTimer = 0;
  /** @type {HTMLElement | null} */
  let markTipTarget = null;
  const MARK_TIP_MS = 350;

  const groupDescTip = el('div', 'group-desc-tip');
  groupDescTip.hidden = true;
  groupDescTip.setAttribute('role', 'tooltip');
  document.body.append(groupDescTip);
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let groupDescTipTimer = 0;
  /** @type {HTMLElement | null} */
  let groupDescTipTarget = null;
  const GROUP_DESC_TIP_MS = 2000;

  const dirPopover = el('div', 'dir-popover');
  dirPopover.hidden = true;
  dirPopover.setAttribute('role', 'menu');
  document.body.append(dirPopover);

  /** @type {{ relPath: string, anchor: HTMLElement } | null} */
  let dirPopoverState = null;

  const problemPanel = el('div', 'syn3-menu problem-panel');
  problemPanel.hidden = true;
  problemPanel.setAttribute('role', 'dialog');
  problemPanel.setAttribute('aria-label', 'Errors');
  document.body.append(problemPanel);

  /**
   * @typedef {{ relPath: string, message: string, severity: 'error' | 'warning' | 'info', line: number, character: number, endLine: number, endCharacter: number }} ProblemDiag
   */

  /** @type {{ anchor: HTMLButtonElement, kind: 'file' | 'dir', relPath: string } | null} */
  let problemPanelState = null;

  /**
   * @typedef {{
   *   pageId: string,
   *   loading?: boolean,
   *   loadingEdge?: 'initial' | 'older' | 'newer',
   *   error?: string,
   *   empty?: boolean,
   *   contentBlocked?: boolean,
   *   messages?: Array<{
   *     id: string,
   *     content: string,
   *     author?: string,
   *     timestamp: string,
   *     isMr: boolean,
   *     isReviewRoot?: boolean,
   *     webUrl?: string,
   *     title?: string,
   *     draft?: boolean,
   *     color?: string,
   *     pillLabel?: string,
   *     fixes?: {
   *       counts: { H: number, M: number, L: number },
   *       at?: string,
   *       bullets: { H: number[], M: number[], L: number[] }
   *     },
   *     status?: 'open' | 'closed',
   *     reviewStatus?: 'inProgress' | 'done',
   *     hasFile?: boolean,
   *     filename?: string,
   *     locked?: boolean,
   *     threadId?: string,
   *     hasThread?: boolean,
   *     replies: Array<{
   *       id: string,
   *       content: string,
   *       author?: string,
   *       timestamp: string,
   *       isReview: boolean,
   *       isExplain?: boolean,
   *       isPill?: boolean,
   *       pillLabel?: string,
   *       fixes?: {
   *         counts: { H: number, M: number, L: number },
   *         at?: string,
   *         bullets: { H: number[], M: number[], L: number[] }
   *       },
   *       status?: 'inProgress' | 'done',
   *       color?: string,
   *       branch?: string,
   *       hasFile?: boolean,
   *       filename?: string,
   *       contentMissing?: boolean,
   *       isTalk?: boolean,
   *       profileId?: string,
   *       profileName?: string,
   *       avatar?: string,
   *       talkText?: string,
   *       talkSourceType?: string,
   *       talkSourceTitle?: string,
   *       locked?: boolean
   *     }>,
   *     repliesHasMore: boolean,
   *     repliesHasNewer?: boolean,
   *     gapBeforeReplyId?: string,
   *     repliesLoaded?: boolean,
   *     contentMissing?: boolean,
   *     branch?: string,
   *     isExplainRoot?: boolean,
   *     isTalk?: boolean,
   *     profileId?: string,
   *     profileName?: string,
   *     avatar?: string,
   *     talkText?: string,
   *     talkSourceType?: string,
   *     talkSourceTitle?: string
   *   }>,
   *   canLoadOlder?: boolean,
   *   canLoadNewer?: boolean,
   *   gapBeforeMessageId?: string,
   *   focusMessageId?: string,
   *   checkout?: string,
   *   filters?: { checkout: boolean, general: boolean, discussions: boolean },
   *   resetView?: boolean,
   *   pendingMr?: { title: string, draft?: boolean },
   *   pendingRoot?: { branch: string },
   *   pendingReviewId?: string,
   *   pendingExplainRoot?: { branch: string },
   *   pendingExplainId?: string,
   *   pendingNeurofixId?: string,
   *   skeletonSeq?: number
   * }} ReviewState
   */
  /** @type {ReviewState | null} */
  let reviewState = null;
  /**
   * @typedef {Object} ScenarioChildChip
   * @property {string} id
   * @property {string} title
   * @property {boolean} hasFile
   * @property {string} [md]
   * @property {number} order
   * @property {number} steep
   */
  /**
   * @typedef {Object} ScenarioChip
   * @property {string} id
   * @property {boolean} isGroup
   * @property {string} title
   * @property {string} [color]
   * @property {string} [alias]
   * @property {string} [description]
   * @property {boolean} hasFile
   * @property {string} [md]
   * @property {boolean} locked
   * @property {ScenarioChildChip[]} children
   * @property {boolean} [childrenLoaded]
   */
  /**
   * @typedef {Object} ScenarioPageState
   * @property {string} pageId
   * @property {boolean} loading
   * @property {string} [error]
   * @property {boolean} [empty]
   * @property {ScenarioChip[]} messages
   */
  /** @type {ScenarioPageState | null} */
  let scenarioState = null;
  /** @type {Map<string, ScenarioPageState>} */
  const scenarioByPage = new Map();
  let scenariosStructureKey = '';
  /** @type {string | null} */
  let openScenarioGroupPanelId = null;
  let focusScenarioGroupNameOnOpen = false;
  /** @type {{ pageId: string, messageId: string } | null} */
  let scenarioFormBusy = null;
  /**
   * @type {{
   *   pageId: string,
   *   messageId: string,
   *   questions: { id: string, prompt: string, options: { id: string, label: string }[] }[]
   * } | null}
   */
  let scenarioFormQuestions = null;
  /** @type {Record<string, string>} */
  let scenarioFormPicks = {};
  /** @type {{ id: string, groupId: string, targetGroupId?: string, copy?: boolean } | null} */
  let pendingScenarioDrop = null;
  /** @type {{ kind: 'row', row: HTMLElement, edge: 'before' | 'after' | 'into' } | { kind: 'tail', tail: HTMLElement } | null} */
  let scenarioCue = null;
  /** @type {HTMLElement | null} */
  let scenarioDropSlotEl = null;
  /** @type {HTMLElement | null} */
  let scenarioOverlayEl = null;
  /** @type {string | null} */
  let scenarioOverlayMessageId = null;
  /** Optimistic channel-load edge until the host snapshot arrives. */
  /** @type {{ pageId: string, edge: 'initial' | 'older' | 'newer' } | null} */
  let reviewLoadPending = null;
  /**
   * Optimistic thread-load slot until a settled snapshot arrives.
   * `armed` flips on the next turn so a reviewState already in the queue
   * does not put the chip back before this load's own snapshot.
   * @type {{ pageId: string, messageId: string, direction: 'older' | 'newer', armed: boolean } | null}
   */
  let reviewThreadLoadPending = null;
  /**
   * MR chip drawn before the host snapshot. Cleared once that snapshot carries
   * the same title. A newer skeletonSeq from another operation leaves it up.
   * @type {{ pageId: string, title: string, draft: boolean } | null}
   */
  let localPendingMr = null;
  /**
   * Review pill drawn in a thread before the Discord reply is in the snapshot.
   * Cleared once that snapshot carries the same messageId.
   * @type {{ pageId: string, messageId: string } | null}
   */
  let localPendingReview = null;
  /**
   * Root review chip drawn before the host snapshot. Cleared once that snapshot
   * carries the same branch.
   * @type {{ pageId: string, branch: string } | null}
   */
  let localPendingRoot = null;
  /**
   * Explain pill drawn in a thread before the Discord reply is in the snapshot.
   * @type {{ pageId: string, messageId: string } | null}
   */
  let localPendingExplain = null;
  /**
   * Root explain chip drawn before the host snapshot.
   * @type {{ pageId: string, branch: string } | null}
   */
  let localPendingExplainRoot = null;
  /**
   * Green fix chip drawn under a review message before the host snapshot.
   * Cleared once that snapshot carries the same messageId.
   * @type {{ pageId: string, messageId: string } | null}
   */
  let localPendingNeurofix = null;
  /** Highest skeletonSeq applied per page. Lower snapshots are stale. */
  const reviewSkeletonSeq = new Map();
  /** Last placeholder scrolled into view, so later paints do not jump. */
  let reviewSkelShown = '';
  /** Pages that already sent reviewLoad while the snapshot was still missing. */
  const reviewAutoLoad = new Set();
  /** Initial channel load should land on the newest rows once the list is painted. */
  let reviewScrollToEnd = false;
  /** Page slide must not put back the previous offset after that glide. */
  let reviewPinEnd = false;
  /** Bumps cancel an in-flight glide to the end of the review list. */
  let reviewScrollAnim = 0;
  /** Pages that already sent scenarioReload while the snapshot was still missing. */
  const scenarioAutoLoad = new Set();
  /** Settled review snapshots, so switching back does not refetch. */
  const reviewByPage = new Map();
  /** @type {{ pageId: string, branches: string[], parent: string, people: Array<{ nick: string, name?: string }>, defaultAssignee: string, provider: 'gitlab' | 'github' } | null} */
  let reviewMrPanel = null;
  /** Collapsed review threads (MR chips and plain messages). Default open. */
  const reviewCollapsed = new Set();
  /** Last closed flag per MR, so a closed thread folds once on load and on close. */
  const reviewClosedSeen = new Map();
  /** MR titles expanded past one line. */
  const reviewTitleExpanded = new Set();
  /** Plain parents with expanded body + thread. */
  const reviewPlainExpanded = new Set();
  /** Tree identity aside from fold flags, so a collapse can animate in place. */
  let reviewStructureKeyValue = '';
  /** Downloaded review bodies, keyed by Discord message id. */
  const reviewFileCache = new Map();
  /**
   * @type {{
   *   pageId: string,
   *   messageId: string,
   *   title: string,
   *   filename: string,
   *   status: 'loading' | 'ready' | 'error',
   *   text: string,
   *   error: string,
   * } | null}
   */
  let reviewFileView = null;
  /**
   * Neurofix bullet picker opened from «Фикс списком».
   * @type {{
   *   pageId: string,
   *   messageId: string,
   *   left: number,
   *   top: number,
   *   width: number,
   *   status: 'loading' | 'ready' | 'error',
   *   error: string,
   *   entered: boolean,
   *   pointerInside: boolean,
   *   el: HTMLElement | null,
   * } | null}
   */
  let neuroFixListPanel = null;

  /** Thrown by fetch when the machine is offline. Not an HTTP error from Discord. */
  function isReviewFetchError(text) {
    return /fetch failed|fetch error|failed to fetch|networkerror|network request failed|enotfound|econnrefused|econnreset|etimedout|eai_again|offline|getaddrinfo/i.test(
      String(text || ''),
    );
  }

  /** @param {ReviewState | null | undefined} state */
  function reviewStateMessages(state) {
    return state && Array.isArray(state.messages) ? state.messages : [];
  }

  /**
   * A reload that dies before the network answers must not replace a card
   * that already has messages.
   * @param {ReviewState | null} incoming
   * @returns {ReviewState | null}
   */
  function keepLoadedReview(incoming) {
    if (!incoming || !incoming.pageId || !isReviewFetchError(incoming.error)) {
      return incoming;
    }
    const cached = reviewByPage.get(incoming.pageId);
    const current = reviewState && reviewState.pageId === incoming.pageId ? reviewState : null;
    const kept = reviewStateMessages(incoming).length
      ? incoming
      : reviewStateMessages(current).length
        ? current
        : reviewStateMessages(cached).length
          ? cached
          : null;
    if (!kept) {
      return incoming;
    }
    return {
      ...kept,
      pageId: incoming.pageId,
      loading: false,
      loadingEdge: undefined,
      error: '',
      skeletonSeq: incoming.skeletonSeq,
      checkout: typeof incoming.checkout === 'string' ? incoming.checkout : kept.checkout,
      filters: incoming.filters || kept.filters,
      resetView: incoming.resetView === true,
      pendingMr: incoming.pendingMr || kept.pendingMr,
      pendingRoot: incoming.pendingRoot || kept.pendingRoot,
      pendingReviewId: incoming.pendingReviewId || kept.pendingReviewId,
      pendingExplainRoot: incoming.pendingExplainRoot || kept.pendingExplainRoot,
      pendingExplainId: incoming.pendingExplainId || kept.pendingExplainId,
      pendingNeurofixId: incoming.pendingNeurofixId || kept.pendingNeurofixId,
    };
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'reviewSkillCopied' || message.type === 'scenarioSkillCopied') {
      const note = document.getElementById(
        message.type === 'scenarioSkillCopied' ? 'scenario-skill-copied' : 'review-skill-copied',
      );
      if (note) {
        note.textContent = t('reviewSkillCopied');
        note.hidden = false;
        window.clearTimeout(reviewSkillCopiedTimer);
        reviewSkillCopiedTimer = window.setTimeout(() => {
          note.hidden = true;
        }, 2200);
      }
    } else if (message.type === 'reviewFile') {
      onReviewFileResult(message);
    } else if (message.type === 'reviewFixes') {
      onReviewFixesResult(message);
    } else if (message.type === 'reviewNeurofixIdle') {
      if (
        localPendingNeurofix &&
        localPendingNeurofix.pageId === message.pageId &&
        localPendingNeurofix.messageId === message.messageId
      ) {
        localPendingNeurofix = null;
        if (activePage()?.kind === 'review' && activePage()?.id === message.pageId) {
          paintReviewPage();
        }
      }
    } else if (message.type === 'reviewTalkResult') {
      reviewTalkBusy = false;
      if (message.ok && reviewTalkInput) {
        reviewTalkInput.value = '';
        resizeReviewTalk();
      }
      syncReviewTalk();
    } else if (message.type === 'reviewState') {
      const incoming = keepLoadedReview(message.review || null);
      const incomingSeq = incoming && incoming.pageId ? incoming.skeletonSeq || 0 : 0;
      if (
        incoming &&
        incoming.pageId &&
        incomingSeq < (reviewSkeletonSeq.get(incoming.pageId) || 0)
      ) {
        return;
      }
      reviewState = incoming;
      reviewSchemeId = normalizeReviewScheme(incoming && (incoming.scheme || incoming.theme));
      if (incoming && incoming.resetView) {
        closeReviewFileView();
        closeExplainFileView();
        closeReviewFixesView();
      }
      syncReviewFilters();
      if (reviewState && reviewState.pageId) {
        if (incomingSeq > (reviewSkeletonSeq.get(reviewState.pageId) || 0)) {
          reviewSkeletonSeq.set(reviewState.pageId, incomingSeq);
        }
        if (localPendingMr && localPendingMr.pageId === reviewState.pageId) {
          const hostMr = reviewState.pendingMr;
          if (hostMr && hostMr.title === localPendingMr.title) {
            localPendingMr = null;
          }
        }
        if (localPendingReview && localPendingReview.pageId === reviewState.pageId) {
          if (reviewState.pendingReviewId === localPendingReview.messageId) {
            localPendingReview = null;
          }
        }
        if (localPendingRoot && localPendingRoot.pageId === reviewState.pageId) {
          // Host skeleton (any branch) replaces the optimistic «…» row.
          if (reviewState.pendingRoot) {
            localPendingRoot = null;
          }
        }
        if (localPendingExplain && localPendingExplain.pageId === reviewState.pageId) {
          if (reviewState.pendingExplainId === localPendingExplain.messageId) {
            localPendingExplain = null;
          }
        }
        if (localPendingExplainRoot && localPendingExplainRoot.pageId === reviewState.pageId) {
          if (reviewState.pendingExplainRoot) {
            localPendingExplainRoot = null;
          }
        }
        if (localPendingNeurofix && localPendingNeurofix.pageId === reviewState.pageId) {
          if (reviewState.pendingNeurofixId === localPendingNeurofix.messageId) {
            localPendingNeurofix = null;
          }
        }
        if (reviewState.pendingReviewId) {
          reviewCollapsed.delete(reviewState.pendingReviewId);
        }
        if (reviewState.pendingExplainId) {
          reviewCollapsed.delete(reviewState.pendingExplainId);
        }
        if (reviewState.pendingNeurofixId) {
          reviewCollapsed.delete(reviewFoldParentId(reviewState.pendingNeurofixId));
        }
        reviewAutoLoad.delete(reviewState.pageId);
        if (reviewState.error || reviewState.loadingEdge === 'initial') {
          reviewByPage.delete(reviewState.pageId);
        } else if (!reviewState.loadingEdge) {
          reviewByPage.set(reviewState.pageId, reviewState);
        }
      }
      if (
        reviewLoadPending &&
        reviewState &&
        reviewLoadPending.pageId === reviewState.pageId &&
        (reviewState.loadingEdge || !reviewState.loading)
      ) {
        reviewLoadPending = null;
      }
      if (
        reviewThreadLoadPending &&
        reviewThreadLoadPending.armed &&
        reviewState &&
        reviewThreadLoadPending.pageId === reviewState.pageId &&
        !reviewState.loading
      ) {
        reviewThreadLoadPending = null;
      }
      if (activePage()?.kind === 'review') {
        paintReviewPage();
      }
    } else if (message.type === 'scenarioState') {
      const incoming = message.scenario || null;
      scenarioState = incoming;
      if (incoming && incoming.pageId) {
        if (incoming.loading) {
          scenarioByPage.delete(incoming.pageId);
        } else {
          scenarioByPage.set(incoming.pageId, incoming);
          scenarioAutoLoad.delete(incoming.pageId);
        }
      }
      if (activePage()?.kind === 'scenarios') {
        render();
      }
    } else if (message.type === 'scenarioFormBusy') {
      const pageId = typeof message.pageId === 'string' ? message.pageId : '';
      const messageId = typeof message.messageId === 'string' ? message.messageId : '';
      if (pageId && messageId) {
        scenarioFormBusy = { pageId, messageId };
      }
      closeContextMenu();
      if (activePage()?.kind === 'scenarios') {
        paintScenariosPage();
      }
    } else if (message.type === 'scenarioFormIdle') {
      scenarioFormBusy = null;
      closeScenarioFormPanel(false);
      if (activePage()?.kind === 'scenarios') {
        paintScenariosPage();
      }
    } else if (message.type === 'scenarioQuestions') {
      const pageId = typeof message.pageId === 'string' ? message.pageId : '';
      const messageId = typeof message.messageId === 'string' ? message.messageId : '';
      const questions = Array.isArray(message.questions) ? message.questions : [];
      scenarioFormQuestions =
        pageId && messageId && questions.length
          ? { pageId, messageId, questions }
          : null;
      scenarioFormPicks = {};
      if (scenarioFormQuestions) {
        scenarioFormBusy = { pageId, messageId };
      }
      closeContextMenu();
      if (activePage()?.kind === 'scenarios') {
        paintScenariosPage();
      }
    } else if (message.type === 'scenarioPagePanel') {
      openScenarioPagePanel({
        mode: message.mode === 'edit' ? 'edit' : 'create',
        pageId: typeof message.pageId === 'string' ? message.pageId : '',
        name: typeof message.name === 'string' ? message.name : '',
        description: typeof message.description === 'string' ? message.description : '',
        channelId: typeof message.channelId === 'string' ? message.channelId : '',
        hasDiscord: message.hasDiscord === true,
        scenarioSkillPath:
          typeof message.scenarioSkillPath === 'string' ? message.scenarioSkillPath : '',
        scenarioModel: typeof message.scenarioModel === 'string' ? message.scenarioModel : '',
        scenarioPrintThinking: message.scenarioPrintThinking === true,
        scenarioPrintTools: message.scenarioPrintTools !== false,
      });
    } else if (message.type === 'scenarioPageDone') {
      setPanelBusy(document.getElementById('scenario-page-panel'), false);
      closeScenarioPagePanel();
    } else if (message.type === 'scenarioPageError') {
      const panel = document.getElementById('scenario-page-panel');
      setPanelBusy(panel, false);
      const error = panel?.querySelector('.review-panel-error');
      if (error instanceof HTMLElement) {
        error.hidden = false;
        error.textContent = typeof message.message === 'string' ? message.message : '';
      }
    } else if (message.type === 'reviewMrPanel') {
      reviewMrPanel = {
        pageId: message.pageId,
        branches: Array.isArray(message.branches) ? message.branches : [],
        parent: typeof message.parent === 'string' ? message.parent : '',
        people: Array.isArray(message.people) ? message.people : [],
        defaultAssignee: typeof message.defaultAssignee === 'string' ? message.defaultAssignee : '',
        provider: message.provider === 'github' ? 'github' : 'gitlab',
      };
      openReviewMrPanel();
    } else if (message.type === 'reviewBranches') {
      onReviewBranchesMessage({
        requestId: typeof message.requestId === 'string' ? message.requestId : '',
        ok: message.ok === true,
        branches: Array.isArray(message.branches) ? message.branches : [],
        nextPage: typeof message.nextPage === 'number' ? message.nextPage : undefined,
        currentBranch: typeof message.currentBranch === 'string' ? message.currentBranch : '',
        message: typeof message.message === 'string' ? message.message : undefined,
      });
    } else if (message.type === 'reviewOpenRequests') {
      onReviewOpenRequestsMessage({
        requestId: typeof message.requestId === 'string' ? message.requestId : '',
        ok: message.ok === true,
        requests: readOpenRequests(message.requests),
        nextPage: typeof message.nextPage === 'number' ? message.nextPage : undefined,
        currentBranch: typeof message.currentBranch === 'string' ? message.currentBranch : '',
        message: typeof message.message === 'string' ? message.message : undefined,
      });
    } else if (message.type === 'reviewParent') {
      onReviewParentMessage({
        requestId: typeof message.requestId === 'string' ? message.requestId : '',
        ok: message.ok === true,
        parent: typeof message.parent === 'string' ? message.parent : undefined,
        message: typeof message.message === 'string' ? message.message : undefined,
      });
    } else if (message.type === 'projectSettingsPanel') {
      openProjectEditPanel({
        id: typeof message.id === 'string' ? message.id : '',
        name: typeof message.name === 'string' ? message.name : '',
        repoUrl: typeof message.repoUrl === 'string' ? message.repoUrl : '',
        profileName: typeof message.profileName === 'string' ? message.profileName : '',
        githubToken: typeof message.githubToken === 'string' ? message.githubToken : '',
        gitlabToken: typeof message.gitlabToken === 'string' ? message.gitlabToken : '',
      });
    } else if (message.type === 'projectSettingsError') {
      const panel = document.getElementById('project-edit-panel');
      if (panel instanceof HTMLElement) {
        panel.classList.remove('is-busy');
      }
      const error = document.querySelector('#project-edit-panel .review-panel-error');
      if (error instanceof HTMLElement) {
        error.hidden = false;
        error.textContent = typeof message.message === 'string' ? message.message : '';
      }
    } else if (message.type === 'projectSettingsSaved') {
      closeProjectEditPanel();
    } else if (message.type === 'profileSettingsPanel') {
      openProfileSettingsPanel({
        id: typeof message.id === 'string' ? message.id : '',
        creating: message.creating === true,
        nameLocked: message.nameLocked === true,
        name: typeof message.name === 'string' ? message.name : '',
        githubNick: typeof message.githubNick === 'string' ? message.githubNick : '',
        gitlabNick: typeof message.gitlabNick === 'string' ? message.gitlabNick : '',
        githubToken: typeof message.githubToken === 'string' ? message.githubToken : '',
        gitlabToken: typeof message.gitlabToken === 'string' ? message.gitlabToken : '',
      });
    } else if (message.type === 'profileSettingsError') {
      const error = document.querySelector('#profile-settings-panel .review-panel-error');
      if (error instanceof HTMLElement) {
        error.hidden = false;
        error.textContent = typeof message.message === 'string' ? message.message : '';
      }
    } else if (message.type === 'profileSettingsSaved') {
      closeProfileSettingsPanel();
    } else if (message.type === 'pageSettingsPanel') {
      openPageSettingsPanel({
        mode: message.mode === 'edit' ? 'edit' : 'create',
        pageId: typeof message.pageId === 'string' ? message.pageId : '',
        kind:
          message.kind === 'notes' ||
          message.kind === 'links' ||
          message.kind === 'figma' ||
          message.kind === 'review'
            ? message.kind
            : 'files',
        name: typeof message.name === 'string' ? message.name : '',
        description: typeof message.description === 'string' ? message.description : '',
        channelId: typeof message.channelId === 'string' ? message.channelId : '',
        hasDiscord: message.hasDiscord === true,
        figmaToken: typeof message.figmaToken === 'string' ? message.figmaToken : '',
        figmaFiles: Array.isArray(message.figmaFiles)
          ? message.figmaFiles.filter((item) => typeof item === 'string')
          : [],
      });
    } else if (message.type === 'pageSettingsError') {
      const panel = document.getElementById('page-settings-panel');
      setPanelBusy(panel, false);
      const error = panel?.querySelector('.review-panel-error');
      if (error instanceof HTMLElement) {
        error.hidden = false;
        error.textContent = typeof message.message === 'string' ? message.message : '';
      }
    } else if (message.type === 'pageSettingsSaved') {
      setPanelBusy(document.getElementById('page-settings-panel'), false);
      closePageSettingsPanel();
    } else if (message.type === 'reviewCreatePagePanel') {
      openReviewCreatePagePanel({
        origin: typeof message.origin === 'string' ? message.origin : '',
        suggestedProvider: message.suggestedProvider === 'github' ? 'github' : 'gitlab',
        channelId: typeof message.channelId === 'string' ? message.channelId : '',
        repoUrl: typeof message.repoUrl === 'string' ? message.repoUrl : '',
        projectRepoLocked: message.projectRepoLocked === true,
        hasGitlab: message.hasGitlab === true,
        hasGithub: message.hasGithub === true,
        hasDiscord: message.hasDiscord === true,
        githubToken: typeof message.githubToken === 'string' ? message.githubToken : '',
        gitlabToken: typeof message.gitlabToken === 'string' ? message.gitlabToken : '',
      });
    } else if (message.type === 'reviewCreatePageDone') {
      setPanelBusy(document.getElementById('review-create-page-panel'), false);
      closeReviewCreatePagePanel();
    } else if (message.type === 'reviewCreatePageError') {
      const panel = document.getElementById('review-create-page-panel');
      setPanelBusy(panel, false);
      const error = panel?.querySelector('.review-panel-error');
      if (error instanceof HTMLElement) {
        error.hidden = false;
        error.textContent = typeof message.message === 'string' ? message.message : '';
      }
    } else if (message.type === 'discordGatePanel') {
      if (message.i18n && typeof message.i18n === 'object') {
        i18nBag = message.i18n;
      }
      openProjectCreatePanel({
        needChannel: true,
        gate: true,
        hasDiscord: message.hasDiscord === true,
        mode: 'create',
        profileName: typeof message.profileName === 'string' ? message.profileName : '',
      });
    } else if (message.type === 'discordGateClear') {
      closeDiscordGatePanel();
    } else if (message.type === 'discordGateError') {
      applyDiscordGateError(
        typeof message.field === 'string' ? message.field : '',
        typeof message.message === 'string' ? message.message : '',
      );
    } else if (message.type === 'reviewPageSettingsPanel') {
      openReviewCreatePagePanel({
        pageId: typeof message.pageId === 'string' ? message.pageId : '',
        name: typeof message.name === 'string' ? message.name : '',
        description: typeof message.description === 'string' ? message.description : '',
        channelId: typeof message.channelId === 'string' ? message.channelId : '',
        origin: typeof message.origin === 'string' ? message.origin : '',
        repoUrl: typeof message.repoUrl === 'string' ? message.repoUrl : '',
        projectRepoLocked: message.projectRepoLocked === true,
        suggestedProvider: message.suggestedProvider === 'github' ? 'github' : 'gitlab',
        hasGitlab: message.hasGitlab === true,
        hasGithub: message.hasGithub === true,
        hasDiscord: message.hasDiscord === true,
        githubToken: typeof message.githubToken === 'string' ? message.githubToken : '',
        gitlabToken: typeof message.gitlabToken === 'string' ? message.gitlabToken : '',
        reviewSkillPath: typeof message.reviewSkillPath === 'string' ? message.reviewSkillPath : '',
        reviewFixSkillPath: typeof message.reviewFixSkillPath === 'string' ? message.reviewFixSkillPath : '',
        explainSkillPath: typeof message.explainSkillPath === 'string' ? message.explainSkillPath : '',
        studySkillPath: typeof message.studySkillPath === 'string' ? message.studySkillPath : '',
        reviewDirPath: typeof message.reviewDirPath === 'string' ? message.reviewDirPath : '',
        reviewModel: typeof message.reviewModel === 'string' ? message.reviewModel : '',
        reviewFixModel: typeof message.reviewFixModel === 'string' ? message.reviewFixModel : '',
        reviewPrintThinking: message.reviewPrintThinking === true,
        reviewPrintTools: message.reviewPrintTools !== false,
        reviewScheme: typeof message.reviewScheme === 'string' ? message.reviewScheme : '',
      });
    } else if (message.type === 'pageCloudBusy') {
      pageCloudBusy = message.busy === true;
      if (!pageCloudBusy && message.ok === true && message.pushed > 0) {
        pagesFixedSent = pagesFixed;
        applyToolbarLock();
      }
      applyBaseConfigLoader();
      applyWorkspaceCloudButtons();
    } else if (message.type === 'baseConfigBusy') {
      baseConfigBusy = message.busy === true;
      applyBaseConfigLoader();
      applyWorkspaceCloudButtons();
      renderProjects(projectsList, activeProjectId, projectConfigSync);
      renderProfiles(
        Array.isArray(data?.profiles) ? data.profiles : undefined,
        typeof data?.activeProfileId === 'string' ? data.activeProfileId : undefined,
        data?.profileConfigSync,
      );
    } else if (message.type === 'projectCreatePanel') {
      if (message.i18n && typeof message.i18n === 'object') {
        i18nBag = message.i18n;
      }
      openProjectCreatePanel({
        needChannel: message.needChannel === true,
        gate: message.gate === true,
        hasDiscord: message.hasDiscord !== false,
        mode: message.mode === 'select' ? 'select' : 'create',
        profileName: typeof message.profileName === 'string' ? message.profileName : '',
      });
    } else if (message.type === 'projectCreateDone') {
      setProjectCreateBusy(false);
      closeProjectCreatePanel();
    } else if (message.type === 'projectCreateError') {
      setProjectCreateBusy(false);
      const panel = document.getElementById('project-create-panel');
      const error = panel?.querySelector('.review-panel-error');
      if (error instanceof HTMLElement) {
        error.hidden = false;
        error.textContent = typeof message.message === 'string' ? message.message : '';
      }
      const submit = panel?.querySelector('[data-project-create-submit]');
      if (submit instanceof HTMLButtonElement && message.canRetry === true) {
        submit.textContent = t('projectCreateRetry');
        submit.dataset.projectCreateRetry = '1';
      }
    } else if (message.type === 'state') {
      if (typeof message.stateSeq === 'number') {
        if (message.stateSeq < stateSeq) {
          return;
        }
        stateSeq = message.stateSeq;
      }
      closeDirPopover();
      closeProblemPanel();
      const previousPageId = uiState.activePageId;
      const previousProblems = problemsPageOpen;
      const previousDebug = debugPageOpen;
      data = message;
      pagesFixed = message.pagesFixed === true;
      pagesFixedSent = message.pagesFixedSent === true;
      reconcileGroupFoldSync();
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
      const incomingProjectId =
        typeof message.activeProjectId === 'string' ? message.activeProjectId : '';
      if (activeProjectId && incomingProjectId !== activeProjectId) {
        cancelSlide();
        isFolding = false;
        renderDeferred = false;
        pageBodies.clear();
        uiState.activePageId = '';
        vscode.setState(uiState);
        activeProjectId = incomingProjectId;
      }
      ensureActivePage();
      syncPageBodies();
      if (message.i18n && typeof message.i18n === 'object') {
        i18nBag = message.i18n;
      }
      applyToolbarLocale();
      setHistoryButtons(message.history);
      setToolbar(activePage() || message);
      setPanelToggles(message.open);
      updatePageMenu();
      pageConfigSync =
        message.pageConfigSync && typeof message.pageConfigSync === 'object'
          ? message.pageConfigSync
          : {};
      pendingRemoteCount =
        typeof message.pendingRemoteCount === 'number' && message.pendingRemoteCount > 0
          ? message.pendingRemoteCount
          : 0;
      hasConfigChannel = message.hasConfigChannel === true;
      pageDrafts =
        message.pageDrafts && typeof message.pageDrafts === 'object' ? message.pageDrafts : {};
      renderProfiles(message.profiles, message.activeProfileId, message.profileConfigSync);
      projectsList = Array.isArray(message.projects)
        ? /** @type {{ id: string, name: string, active?: boolean }[]} */ (message.projects)
        : [];
      activeProjectId =
        typeof message.activeProjectId === 'string'
          ? message.activeProjectId
          : projectsList.find((p) => p.active)?.id || '';
      projectConfigSync =
        message.projectConfigSync && typeof message.projectConfigSync === 'object'
          ? message.projectConfigSync
          : {};
      canToggleProjectLock = message.canToggleProjectLock !== false;
      renderProjects(projectsList, activeProjectId, projectConfigSync);
      applyToolbarLock();
      applyWorkspaceCloudButtons();
      if (isDebugPageOpen() && workspaceCloudCanPush() && !debugFetchedForPush && !debugDiffBusy) {
        requestDebugDiff(true);
      }
      applyAppearance(message.appearance);
      if (!showProblemsTab()) {
        problemsPageOpen = false;
      }
      if (
        previousPageId !== uiState.activePageId ||
        previousProblems !== problemsPageOpen ||
        previousDebug !== debugPageOpen
      ) {
        dismissLinkPreview();
      }
      renderPager();
      render();
      if (typeof message.focusNoteId === 'string' && !isAuxPageOpen()) {
        focusNoteInput(message.focusNoteId);
      }
      noteRefactorEpoch(message.refactorEpoch);
      pumpEntityReveal();
      if (flashNodes && Date.now() < flashUntil) {
        requestAnimationFrame(() => applyEntityFlash(false));
      }
      vscode.postMessage({ type: 'activePage', pageId: uiState.activePageId });
    } else if (message.type === 'entityLinkTarget') {
      if (!message.pageId || !Array.isArray(message.chain) || !message.chain.length) {
        return;
      }
      startEntityReveal(message.pageId, message.chain);
    } else if (message.type === 'entityLinkBroken') {
      const source = entityLinkSource;
      entityLinkSource = null;
      openBrokenLinkDialog(
        source && source.url === message.url
          ? source
          : { url: typeof message.url === 'string' ? message.url : '' },
      );
    } else if (message.type === 'openFlags') {
      if (data) {
        data.open = message.open;
      }
      setPanelToggles(message.open);
    } else if (message.type === 'openGroupDraft') {
      openGroupSettingsPanel({
        mode: 'create',
        parentId: typeof message.parentId === 'string' ? message.parentId : undefined,
        pageId: typeof message.pageId === 'string' ? message.pageId : undefined,
        requestId: typeof message.requestId === 'string' ? message.requestId : undefined,
      });
    } else if (message.type === 'openPage') {
      if (!message.pageId) {
        return;
      }
      if (pages().some((page) => page.id === message.pageId)) {
        setActivePage(message.pageId);
        return;
      }
      rememberSlide(message.pageId);
      dismissLinkPreview();
      uiState.activePageId = message.pageId;
      vscode.setState(uiState);
    } else if (message.type === 'active' && data) {
      data.active = message.active;
      updateActive(true);
    } else if (message.type === 'tabs' && data) {
      data.openPaths = Array.isArray(message.openPaths) ? message.openPaths : [];
      data.focusedPath = typeof message.focusedPath === 'string' ? message.focusedPath : '';
      applyTabMarks();
    } else if (message.type === 'changes' && data) {
      data.dirtyPaths = Array.isArray(message.dirtyPaths) ? message.dirtyPaths : [];
      applyChangeMarks();
    } else if (message.type === 'problems' && data) {
      data.problems = Array.isArray(message.problems) ? message.problems : [];
      if (isProblemsPageOpen()) {
        paintProblemsPage();
      } else {
        applyProblemMarks();
      }
    } else if (message.type === 'debugDiff') {
      debugDiffBusy = false;
      debugDiffSnapshot = {
        sections: Array.isArray(message.sections) ? message.sections : [],
      };
      if (isDebugPageOpen()) {
        paintDebugPage();
      }
    } else if (message.type === 'dropAlreadyExists') {
      openDropExistsDialog();
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
    if (action === 'refresh') {
      const page = activePage();
      if (page && page.kind === 'scenarios') {
        vscode.postMessage({ type: 'scenarioReload', pageId: page.id });
        return;
      }
      if (page && page.kind === 'review') {
        requestReviewChannelLoad(page.id, 'initial');
        return;
      }
    }
    if (action === 'scenarioCreate') {
      const pageId = uiState.activePageId;
      if (pageId) {
        vscode.postMessage({ type: 'scenarioCreate', pageId });
      }
      return;
    }
    if (action === 'scenarioCreateGroup') {
      const pageId = uiState.activePageId;
      if (pageId) {
        vscode.postMessage({ type: 'scenarioCreateGroup', pageId });
      }
      return;
    }
    if (action === 'pullMr') {
      const pageId = uiState.activePageId;
      if (pageId) {
        // Same title as ReviewMapController.pullSkeletonTitle. The host snapshot clears this row.
        beginLocalMrSkeleton(pageId, '…', false);
      }
    }
    vscode.postMessage({ type: 'toolbar', action, pageId: uiState.activePageId });
  }

  function pages() {
    return data && Array.isArray(data.pages) ? data.pages : [];
  }

  /** Links and Figma share the link-card canvas. */
  function isLinkMapKind(kind) {
    return kind === 'links' || kind === 'figma';
  }

  function activePage() {
    const list = pages();
    return list.find((page) => page.id === uiState.activePageId) || list[0];
  }

  function ensureActivePage() {
    const list = pages();
    if (list.length === 0) {
      if (uiState.activePageId) {
        uiState.activePageId = '';
        vscode.setState(uiState);
      }
      return;
    }
    if (!list.some((page) => page.id === uiState.activePageId)) {
      uiState.activePageId = list[0].id;
      vscode.setState(uiState);
    }
  }

  /** @param {string} pageId */
  function rememberPageBody(pageId) {
    if (!data || !pageId) {
      return;
    }
    pageBodies.set(pageId, {
      groups: Array.isArray(data.groups) ? data.groups : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      links: Array.isArray(data.links) ? data.links : [],
    });
  }

  /** Put a previously opened page back on screen. @param {string} pageId */
  function applyPageBody(pageId) {
    const body = pageBodies.get(pageId);
    if (!data || !body) {
      return false;
    }
    data.groups = body.groups;
    data.notes = body.notes;
    data.links = body.links;
    data.contentPageId = pageId;
    return true;
  }

  function syncPageBodies() {
    if (!data) {
      return;
    }
    if (typeof data.bodyRev === 'number' && data.bodyRev !== bodyRev) {
      pageBodies.clear();
      bodyRev = data.bodyRev;
    }
    if (typeof data.contentPageId === 'string') {
      rememberPageBody(data.contentPageId);
    }
    const alive = new Set(pages().map((page) => page.id));
    for (const id of pageBodies.keys()) {
      if (!alive.has(id)) {
        pageBodies.delete(id);
      }
    }
    const activeId = activePage()?.id;
    if (activeId && data.contentPageId !== activeId) {
      applyPageBody(activeId);
    }
  }

  /** 1 = next page enters from the right, -1 = previous enters from the left. */
  let pendingSlide = 0;
  let isSliding = false;
  let pageSlideToken = 0;
  let renderDeferred = false;
  let renderFromToggle = false;
  let isFolding = false;
  /** Entity-link reveal should land on the final layout, without a fold animation. */
  let skipNextFolds = false;
  let foldToken = 0;
  const FOLD_MS = 200;
  const FOLD_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const FOLD_TRANSITION =
    'height ' + FOLD_MS + 'ms ' + FOLD_EASE + ', margin-top ' + FOLD_MS + 'ms ' + FOLD_EASE + ', opacity 160ms ease';
  /** @type {((event: TransitionEvent) => void) | null} */
  let slideEndHandler = null;
  let slideTimer = 0;

  function setActivePage(pageId) {
    if (!pages().some((page) => page.id === pageId)) {
      return;
    }
    const samePage = uiState.activePageId === pageId;
    const leaveAux = problemsPageOpen || debugPageOpen;
    problemsPageOpen = false;
    debugPageOpen = false;
    if (samePage && !leaveAux) {
      return;
    }
    closeMapSettingsPanels();
    dismissLinkPreview();
    if (!samePage) {
      rememberSlide(pageId);
      uiState.activePageId = pageId;
      vscode.setState(uiState);
      setHistoryButtons(data && data.history);
      setToolbar(activePage() || data);
      updatePageMenu();
      vscode.postMessage({ type: 'activePage', pageId });
      applyPageBody(pageId);
    }
    renderPager();
    render();
  }

  function showProblemsTab() {
    return data?.appearance?.showProblemsTab !== false;
  }

  function isProblemsPageOpen() {
    return problemsPageOpen && showProblemsTab();
  }

  function isDebugPageOpen() {
    return debugPageOpen;
  }

  /** Problems or Debug overlay instead of a map page. */
  function isAuxPageOpen() {
    return isProblemsPageOpen() || isDebugPageOpen();
  }

  function openProblemsPage() {
    if (!showProblemsTab() || problemsPageOpen) {
      return;
    }
    closeMapSettingsPanels();
    dismissLinkPreview();
    problemsPageOpen = true;
    debugPageOpen = false;
    closeProblemPanel();
    cancelSlide();
    pendingSlide = 0;
    renderPager();
    render();
  }

  function openDebugPage() {
    if (debugPageOpen) {
      return;
    }
    closeMapSettingsPanels();
    dismissLinkPreview();
    debugPageOpen = true;
    problemsPageOpen = false;
    debugDiffSnapshot = null;
    closeProblemPanel();
    cancelSlide();
    pendingSlide = 0;
    if (workspaceCloudCanPush()) {
      debugDiffBusy = true;
      debugFetchedForPush = true;
    } else {
      debugDiffBusy = false;
      debugFetchedForPush = false;
      debugDiffSnapshot = { sections: [] };
    }
    renderPager();
    render();
    if (workspaceCloudCanPush()) {
      vscode.postMessage({ type: 'debugDiff' });
    }
  }

  /**
   * @param {boolean} force
   */
  function requestDebugDiff(force) {
    if (!workspaceCloudCanPush()) {
      debugDiffBusy = false;
      debugFetchedForPush = false;
      debugDiffSnapshot = { sections: [] };
      if (isDebugPageOpen()) {
        paintDebugPage();
      }
      return;
    }
    debugFetchedForPush = true;
    if (debugDiffBusy && !force) {
      return;
    }
    debugDiffBusy = true;
    if (isDebugPageOpen()) {
      paintDebugPage();
    }
    vscode.postMessage({ type: 'debugDiff' });
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
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const caret = pendingNoteCaret?.noteId === noteId ? pendingNoteCaret : null;
      beginNoteEdit(node);
      if (activeNoteEdit?.input !== node) {
        return;
      }
      if (caret) {
        placeNoteCaretLater(node, caret);
        return;
      }
      placeCaretAtEnd(node);
    });
  }

  function pageHasSettings(page) {
    return page?.kind === 'review' || page?.kind === 'scenarios';
  }

  function updatePageMenu() {
    const list = pages();
    const max = typeof data?.maxPages === 'number' ? data.maxPages : 4;
    const usedKinds = new Set(
      Array.isArray(data?.usedPageKinds)
        ? data.usedPageKinds
        : list.map((page) => page.kind).filter(Boolean),
    );
    const createBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('menu-create-page'));
    const deleteBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('menu-delete-page'));
    const kindActions = [
      ['createPageFiles', 'files'],
      ['createPageNotes', 'notes'],
      ['createPageLinks', 'links'],
      ['createPageFigma', 'figma'],
      ['createPageReview', 'review'],
      ['createPageScenarios', 'scenarios'],
    ];
    let available = 0;
    for (const [action, kind] of kindActions) {
      const btn = document.querySelector(`[data-action="${action}"]`);
      if (!(btn instanceof HTMLElement)) {
        continue;
      }
      const taken = usedKinds.has(kind);
      btn.hidden = taken;
      if (!taken) {
        available += 1;
      }
    }
    if (createBtn) {
      createBtn.disabled = list.length >= max || available === 0;
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
    const pageLoading = pageSkeletonKind() !== '';
    if (historyBack) {
      historyBack.disabled = pageLoading || back === 0;
      const backLabel = t('toolbarBack');
      historyBack.title = back ? backLabel + ' (' + back + ')' : backLabel;
      historyBack.setAttribute('aria-label', historyBack.title);
    }
    if (historyForward) {
      historyForward.disabled = pageLoading || forward === 0;
      const forwardLabel = t('toolbarForward');
      historyForward.title = forward ? forwardLabel + ' (' + forward + ')' : forwardLabel;
      historyForward.setAttribute('aria-label', historyForward.title);
    }
    if (historyAccept) {
      historyAccept.hidden = back + forward === 0;
      historyAccept.disabled = pageLoading;
      historyAccept.title = t('toolbarDone');
      historyAccept.setAttribute('aria-label', historyAccept.title);
    }
  }

  /** Apply profile language to static toolbar chrome and more-menu labels. */
  function applyToolbarLocale() {
    contextMenu.setAttribute('aria-label', t('contextMenu'));
    setBtnLocale(toolbarProject, 'toolbarProject');
    setElLocale(toolbarProjectMenu, 'projectSelect', 'aria-label');
    setBtnLocale(toolbarProjectAdd, 'projectCreate');
    applyToolbarLock();
    setBtnLocale(toolbarProfile, 'toolbarProfile');
    setElLocale(toolbarProfileMenu, 'profiles', 'aria-label');
    setBtnLocale(toolbarProfileAdd, 'profileCreate');
    applyWorkspaceCloudButtons();
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
    setBtnLocale(toolbarExplorer, 'toolbarExplorer');
    setBtnLocale(toolbarMore, 'toolbarMore');
    setMenuItemLocale('menu-create-page', 'menuNewPage');
    setMenuItemLocaleByAction('createPageFiles', 'menuNewPageGroups');
    setMenuItemLocaleByAction('createPageNotes', 'menuNewPageNotes');
    setMenuItemLocaleByAction('createPageLinks', 'menuNewPageLinks');
    setMenuItemLocaleByAction('createPageFigma', 'menuNewPageFigma');
    setMenuItemLocaleByAction('createPageReview', 'menuNewPageReview');
    setMenuItemLocaleByAction('createPageScenarios', 'menuNewPageScenarios');
    setMenuItemLocale('menu-delete-page', 'menuDeletePage');
    setMenuItemLocaleByAction('openSettings', 'menuOpenSettings');
    setMenuItemLocaleByAction('whySyn3', 'menuWhy');
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
    const i18nSpan = button.querySelector('[data-i18n]');
    if (i18nSpan) {
      i18nSpan.textContent = label;
      return;
    }
    const icon = button.querySelector('.tool-icon, img, svg');
    const caret = button.querySelector('.toolbar-menu-caret');
    button.replaceChildren();
    if (icon) {
      button.append(icon);
    }
    button.append(document.createTextNode(label));
    if (caret) {
      button.append(caret);
    }
  }

  function openToolbarPanelsMenu() {
    if (!toolbarPanelsMenu || toolbarPanels?.disabled) {
      return;
    }
    cancelMenuClose('toolbar-panels');
    closeToolbarMenus();
    closeContextMenu();
    toolbarPanelsMenu.hidden = false;
    toolbarPanels?.setAttribute('aria-expanded', 'true');
  }

  function openToolbarMoreMenu() {
    if (!toolbarMenu) {
      return;
    }
    cancelMenuClose('toolbar-more');
    closeToolbarMenus();
    closeContextMenu();
    toolbarMenu.hidden = false;
  }

  function closeToolbarMenus() {
    cancelMenuClose();
    if (toolbarMenu) {
      toolbarMenu.hidden = true;
    }
    const createSub = document.getElementById('menu-create-page-sub');
    if (createSub) {
      createSub.hidden = true;
    }
    document.getElementById('menu-create-page')?.setAttribute('aria-expanded', 'false');
    if (toolbarPanelsMenu) {
      toolbarPanelsMenu.hidden = true;
    }
    toolbarPanels?.setAttribute('aria-expanded', 'false');
    closeToolbarViewMenu();
    closeToolbarCreateMenu();
    closeProjectMenu();
    closeProfileMenu();
    closeFormatMenu();
  }

  function closeToolbarCreateMenu() {
    cancelMenuClose('toolbar-create');
    clearReviewDepthMenu();
    if (toolbarCreateMenu) {
      toolbarCreateMenu.hidden = true;
    }
    toolbarCreate?.setAttribute('aria-expanded', 'false');
    if (openMenuState?.kind === 'toolbar-create') {
      openMenuState = null;
    }
  }

  function openToolbarCreateMenu() {
    if (!toolbarCreateMenu || !toolbarCreateWrap || !canUseCreateViewToolbar()) {
      return;
    }
    openMenuState = {
      kind: 'toolbar-create',
      viewExpanded: false,
      pullExpanded: false,
      reviewExpanded: false,
      reviewScope: '',
      explainExpanded: false,
      explainScope: '',
    };
    fillCreateMenu(toolbarCreateMenu);
    positionToolbarMenu(toolbarCreateMenu, toolbarCreateWrap);
    toolbarCreate?.setAttribute('aria-expanded', 'true');
  }

  function rerenderCreateMenu() {
    if (!openMenuState || openMenuState.kind !== 'toolbar-create' || !toolbarCreateMenu) {
      return;
    }
    fillCreateMenu(toolbarCreateMenu);
    cancelMenuClose('toolbar-create');
    if (openMenuState.reviewExpanded && openMenuState.reviewScope) {
      mountReviewDepthMenu(
        openMenuState.reviewScope,
        String(activePage()?.id || ''),
        '',
        true,
      );
    }
    if (openMenuState.explainExpanded && openMenuState.explainScope) {
      mountExplainDepthMenu(
        openMenuState.explainScope,
        String(activePage()?.id || ''),
        '',
        true,
      );
    }
  }

  /** @param {HTMLElement} root */
  function fillCreateMenu(menuRoot) {
    const isMenu = menuRoot.classList.contains('syn3-menu');
    const target = isMenu ? ensureMenuChrome(menuRoot).scroller : menuRoot;
    clearReviewDepthMenu();
    target.replaceChildren();
    if (isLinkMapKind(activePage()?.kind)) {
      target.append(menuActionChoice(t('linkLayoutFallback'), { toolbar: 'createLinkLayout' }));
    } else if (activePage()?.kind === 'scenarios') {
      target.append(menuActionChoice(t('createScenario'), { toolbar: 'scenarioCreate' }));
      target.append(menuActionChoice(t('createScenarioGroup'), { toolbar: 'scenarioCreateGroup' }));
    } else if (activePage()?.kind === 'review') {
      const isGithub = data?.reviewProvider === 'github';
      target.append(menuActionChoice(t(isGithub ? 'createPr' : 'createMr'), { toolbar: 'createMr' }));
      appendExpandableMenuBlock(
        target,
        t(isGithub ? 'pullPr' : 'pullMr'),
        !!openMenuState?.pullExpanded,
        'togglePull',
        (nest) => {
          nest.append(menuActionChoice(t('pullOwnBranch'), { toolbar: 'pullMr' }));
          const other = menuAction(t('pullOtherBranch'));
          other.dataset.menuAction = 'openBranchPanelPull';
          nest.append(other);
        },
        { plain: true },
      );
      appendExpandableMenuBlock(
        target,
        t('createReview'),
        !!openMenuState?.reviewExpanded,
        'toggleReview',
        (nest) => {
          appendReviewScopeRow(nest, 'branch', t('reviewScopeBranch'));
          appendReviewScopeRow(nest, 'changes', t('reviewScopeUnpushed'));
          const other = menuAction(t('reviewScopeOtherBranch'));
          other.dataset.menuAction = 'openBranchPanelReview';
          nest.append(other);
        },
        { plain: true },
      );
      appendExpandableMenuBlock(
        target,
        t('createExplain'),
        !!openMenuState?.explainExpanded,
        'toggleExplain',
        (nest) => {
          appendExplainScopeRow(nest, 'branch', t('reviewScopeBranch'));
          appendExplainScopeRow(nest, 'changes', t('reviewScopeUnpushed'));
          const other = menuAction(t('reviewScopeOtherBranch'));
          other.dataset.menuAction = 'openBranchPanelExplain';
          nest.append(other);
        },
        { plain: true },
      );
    } else {
      target.append(menuActionChoice(t('createGroup'), { toolbar: 'createMarker' }));
      target.append(menuActionChoice(t('createNote'), { toolbar: 'createNote' }));
    }
    if (isMenu) {
      updateMenuScrollbar(menuRoot);
    }
  }

  /**
   * @param {string} label
   * @param {{ toolbar?: string, create?: string, deleteAction?: string, review?: string, reviewDepth?: string, reviewRoot?: boolean, explain?: string, explainDepth?: string, explainRoot?: boolean, reviewEdit?: string, neuroFix?: string, rereview?: string, study?: string, pageId?: string, messageId?: string }} attrs
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
    if (attrs.review) {
      button.dataset.review = attrs.review;
    }
    if (attrs.reviewDepth) {
      button.dataset.reviewDepth = attrs.reviewDepth;
    }
    if (attrs.reviewRoot) {
      button.dataset.reviewRoot = '1';
    }
    if (attrs.explain) {
      button.dataset.explain = attrs.explain;
    }
    if (attrs.explainDepth) {
      button.dataset.explainDepth = attrs.explainDepth;
    }
    if (attrs.explainRoot) {
      button.dataset.explainRoot = '1';
    }
    if (attrs.reviewEdit) {
      button.dataset.reviewEdit = attrs.reviewEdit;
    }
    if (attrs.neuroFix) {
      button.dataset.neuroFix = attrs.neuroFix;
    }
    if (attrs.rereview) {
      button.dataset.rereview = attrs.rereview;
    }
    if (attrs.study) {
      button.dataset.study = attrs.study;
    }
    if (attrs.pageId) {
      button.dataset.pageId = attrs.pageId;
    }
    if (attrs.messageId) {
      button.dataset.messageId = attrs.messageId;
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
    clearContextDismissMove();
    // Hiding and replaceChildren can synthesize mouseleave; don't re-arm a close.
    ignoreContextLeave = true;
    clearReviewDepthMenu();
    clearNeuroFixMenu();
    clearRereviewMenu();
    clearStudyMenu();
    contextMenu.hidden = true;
    contextMenu.style.maxHeight = '';
    const chrome = ensureMenuChrome(contextMenu);
    chrome.scroller.replaceChildren();
    chrome.scroller.scrollTop = 0;
    chrome.bar.hidden = true;
    ignoreContextLeave = false;
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
    if (!toolbarViewMenu || !toolbarView || !toolbarViewWrap || !canUseCreateViewToolbar()) {
      return;
    }
    cancelMenuClose('toolbar-view');
    openMenuState = { kind: 'toolbar', viewExpanded: true };
    fillViewSections(toolbarViewMenu);
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
    closeNeuroFixListPanel();
    // Always start collapsed; user expands «Вид» / «Создать» / delete explicitly.
    openMenuState = {
      kind: 'context',
      viewExpanded: false,
      createExpanded: false,
      deleteExpanded: false,
      reviewExpanded: false,
      reviewScope: '',
      explainExpanded: false,
      explainScope: '',
      reviewStatusExpanded: false,
      neurofixExpanded: false,
      rereviewExpanded: false,
      studyExpanded: false,
      ctx,
      x,
      y,
    };
    renderContextMenu();
    contextMenu.hidden = false;
    positionMenu(contextMenu, { left: x, top: y, preferBelow: true });
  }

  /**
   * @param {HTMLElement} scroller
   * @param {string} label
   * @param {boolean} expanded
   * @param {string} toggleAction
   * @param {(nest: HTMLElement) => void} fillNest
   * @param {{ plain?: boolean }} [opts]
   */
  function appendExpandableMenuBlock(scroller, label, expanded, toggleAction, fillNest, opts) {
    const block = document.createElement('div');
    block.className = 'syn3-menu-view-block' + (opts?.plain ? ' is-plain' : '');
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

  /** @type {HTMLElement | null} */
  let reviewDepthMenu = null;
  /** @type {HTMLElement | null} */
  let neuroFixMenu = null;
  /** @type {HTMLElement | null} */
  let rereviewMenu = null;
  /** @type {HTMLElement | null} */
  let studyMenu = null;

  function clearReviewDepthMenu() {
    reviewDepthMenu?.remove();
    reviewDepthMenu = null;
  }

  function clearNeuroFixMenu() {
    neuroFixMenu?.remove();
    neuroFixMenu = null;
  }

  function clearRereviewMenu() {
    rereviewMenu?.remove();
    rereviewMenu = null;
  }

  function clearStudyMenu() {
    studyMenu?.remove();
    studyMenu = null;
  }

  /** Total H/M/L on the source review pill, including bullets already fixed. */
  function sourceSeverityCounts(node) {
    return parsePillSeverityCounts(node && node.pillLabel);
  }

  /** @param {{ open?: { H?: number[], M?: number[], L?: number[] } } | null | undefined} node */
  function reviewOpenBullets(node) {
    const open = node && node.open;
    return {
      H: Array.isArray(open && open.H) ? open.H : [],
      M: Array.isArray(open && open.M) ? open.M : [],
      L: Array.isArray(open && open.L) ? open.L : [],
    };
  }

  /** Open re-review rows that neurofix has not recorded yet. */
  function rereviewRemainingCounts(node) {
    const open = reviewOpenBullets(node);
    const fixed = reviewFixBullets(node);
    const left = (letter) => open[letter].filter((index) => !fixed[letter].includes(index));
    return {
      H: left('H').length,
      M: left('M').length,
      L: left('L').length,
    };
  }

  function reviewThreadParentId(messageId) {
    const messages = reviewState?.messages || [];
    if (messages.some((item) => item.id === messageId)) {
      return messageId;
    }
    for (const msg of messages) {
      if ((msg.replies || []).some((item) => item.id === messageId)) {
        return msg.id;
      }
    }
    return messageId;
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   * @param {{ H?: number[] | 'all', M?: number[] | 'all', L?: number[] | 'all' }} selection
   */
  function postRereview(pageId, messageId, selection) {
    beginLocalReviewSkeleton(pageId, reviewThreadParentId(messageId));
    vscode.postMessage({
      type: 'reviewRereview',
      pageId,
      messageId,
      selection,
    });
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   * @param {{ H?: number[] | 'all', M?: number[] | 'all', L?: number[] | 'all' }} selection
   */
  function postStudy(pageId, messageId, selection) {
    beginLocalReviewSkeleton(pageId, reviewThreadParentId(messageId));
    vscode.postMessage({
      type: 'reviewStudy',
      pageId,
      messageId,
      selection,
    });
  }

  /**
   * Neurofix row inside the root review chip menu. Click opens the scope flyout.
   * On a foreign branch the row stays muted and still opens the flyout.
   * The actions inside are muted, and a click reports the error.
   * @param {HTMLElement} scroller
   * @param {boolean} expanded
   * @param {boolean} [blocked]
   */
  function appendNeuroFixRow(scroller, expanded, blocked) {
    const row = menuAction('', expanded ? 'is-expanded' : '');
    row.dataset.menuAction = 'toggleNeuroFix';
    if (blocked) {
      row.classList.add('is-muted');
      row.title = t('neurofixForeignBranch');
    }
    row.setAttribute('aria-haspopup', 'menu');
    row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const title = document.createElement('span');
    title.className = 'syn3-menu-item-label';
    title.textContent = t('neurofix');
    const caret = document.createElement('span');
    caret.className = 'syn3-menu-item-caret';
    caret.textContent = '▸';
    caret.setAttribute('aria-hidden', 'true');
    row.append(title, caret);
    scroller.append(row);
  }

  /**
   * Side flyout for Neurofix scopes on the root review chip.
   * @param {string} pageId
   * @param {string} messageId
   * @param {{ H: number, M: number, L: number }} counts
   */
  function mountNeuroFixMenu(pageId, messageId, counts) {
    clearNeuroFixMenu();
    if (!(contextMenu instanceof HTMLElement)) {
      return;
    }
    const blocked = reviewNeurofixBlocked(messageId);
    const anchor = contextMenu.querySelector('[data-menu-action="toggleNeuroFix"]');
    if (!(anchor instanceof HTMLElement)) {
      return;
    }
    const fly = document.createElement('div');
    fly.className = 'syn3-menu syn3-menu-sub';
    fly.setAttribute('role', 'menu');
    /** @type {Array<{ scope: 'H' | 'M' | 'L' | 'all', label: string, show: boolean }>} */
    const items = [
      { scope: 'H', label: t('neurofixHigh'), show: counts.H > 0 },
      { scope: 'M', label: t('neurofixMedium'), show: counts.M > 0 },
      { scope: 'L', label: t('neurofixSimple'), show: counts.L > 0 },
      {
        scope: 'all',
        label: t('neurofixAll'),
        show: counts.H > 0 || counts.M > 0 || counts.L > 0,
      },
    ];
    for (const item of items) {
      if (!item.show) {
        continue;
      }
      const choice = menuActionChoice(item.label, {
        neuroFix: item.scope,
        pageId,
        messageId,
      });
      if (blocked) {
        muteNeurofixAction(choice);
      }
      fly.append(choice);
    }
    const listBtn = menuAction(t('neurofixList'));
    listBtn.dataset.menuAction = 'neuroFixList';
    listBtn.dataset.pageId = pageId;
    listBtn.dataset.messageId = messageId;
    if (blocked) {
      muteNeurofixAction(listBtn);
    }
    fly.append(listBtn);
    fly.addEventListener('mouseenter', () => {
      cancelMenuClose('context');
    });
    fly.addEventListener('mouseleave', () => {
      scheduleMenuClose('context', () => closeContextMenu());
    });
    fly.addEventListener('click', (event) => {
      handleSyn3MenuClick(event, 'context');
    });
    document.body.append(fly);
    neuroFixMenu = fly;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = contextMenu.getBoundingClientRect();
    const flyWidth = fly.offsetWidth || 196;
    const flyHeight = fly.offsetHeight || 96;
    let top = anchorRect.top;
    if (top + flyHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 8 - flyHeight);
    }
    const roomRight = window.innerWidth - menuRect.right;
    const left = roomRight >= flyWidth + 8 ? menuRect.right - 6 : Math.max(8, menuRect.left - flyWidth + 6);
    fly.style.top = top + 'px';
    fly.style.left = left + 'px';
  }

  /**
   * Re-review row. Click opens High / Medium / Low / All / List.
   * @param {HTMLElement} scroller
   * @param {boolean} expanded
   */
  function appendRereviewRow(scroller, expanded) {
    const row = menuAction('', expanded ? 'is-expanded' : '');
    row.dataset.menuAction = 'toggleRereview';
    row.setAttribute('aria-haspopup', 'menu');
    row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const title = document.createElement('span');
    title.className = 'syn3-menu-item-label';
    title.textContent = t('rereview');
    const caret = document.createElement('span');
    caret.className = 'syn3-menu-item-caret';
    caret.textContent = '▸';
    caret.setAttribute('aria-hidden', 'true');
    row.append(title, caret);
    scroller.append(row);
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   * @param {{ H: number, M: number, L: number }} counts
   */
  function mountRereviewMenu(pageId, messageId, counts) {
    clearRereviewMenu();
    if (!(contextMenu instanceof HTMLElement)) {
      return;
    }
    const anchor = contextMenu.querySelector('[data-menu-action="toggleRereview"]');
    if (!(anchor instanceof HTMLElement)) {
      return;
    }
    const fly = document.createElement('div');
    fly.className = 'syn3-menu syn3-menu-sub';
    fly.setAttribute('role', 'menu');
    /** @type {Array<{ scope: 'H' | 'M' | 'L' | 'all', label: string, show: boolean }>} */
    const items = [
      { scope: 'H', label: t('rereviewHigh'), show: counts.H > 0 },
      { scope: 'M', label: t('rereviewMedium'), show: counts.M > 0 },
      { scope: 'L', label: t('rereviewLow'), show: counts.L > 0 },
      {
        scope: 'all',
        label: t('rereviewAll'),
        show: counts.H > 0 || counts.M > 0 || counts.L > 0,
      },
    ];
    for (const item of items) {
      if (!item.show) {
        continue;
      }
      const choice = menuActionChoice(item.label, {
        rereview: item.scope,
        pageId,
        messageId,
      });
      fly.append(choice);
    }
    const listBtn = menuAction(t('rereviewList'));
    listBtn.dataset.menuAction = 'rereviewList';
    listBtn.dataset.pageId = pageId;
    listBtn.dataset.messageId = messageId;
    fly.append(listBtn);
    fly.addEventListener('mouseenter', () => {
      cancelMenuClose('context');
    });
    fly.addEventListener('mouseleave', () => {
      scheduleMenuClose('context', () => closeContextMenu());
    });
    fly.addEventListener('click', (event) => {
      handleSyn3MenuClick(event, 'context');
    });
    document.body.append(fly);
    rereviewMenu = fly;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = contextMenu.getBoundingClientRect();
    const flyWidth = fly.offsetWidth || 196;
    const flyHeight = fly.offsetHeight || 96;
    let top = anchorRect.top;
    if (top + flyHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 8 - flyHeight);
    }
    const roomRight = window.innerWidth - menuRect.right;
    const left = roomRight >= flyWidth + 8 ? menuRect.right - 6 : Math.max(8, menuRect.left - flyWidth + 6);
    fly.style.top = top + 'px';
    fly.style.left = left + 'px';
  }

  /**
   * Study row. Click opens High / Medium / Low / All / List.
   * @param {HTMLElement} scroller
   * @param {boolean} expanded
   */
  function appendStudyRow(scroller, expanded) {
    const row = menuAction('', expanded ? 'is-expanded' : '');
    row.dataset.menuAction = 'toggleStudy';
    row.setAttribute('aria-haspopup', 'menu');
    row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const title = document.createElement('span');
    title.className = 'syn3-menu-item-label';
    title.textContent = t('study');
    const caret = document.createElement('span');
    caret.className = 'syn3-menu-item-caret';
    caret.textContent = '▸';
    caret.setAttribute('aria-hidden', 'true');
    row.append(title, caret);
    scroller.append(row);
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   * @param {{ H: number, M: number, L: number }} counts
   */
  function mountStudyMenu(pageId, messageId, counts) {
    clearStudyMenu();
    if (!(contextMenu instanceof HTMLElement)) {
      return;
    }
    const anchor = contextMenu.querySelector('[data-menu-action="toggleStudy"]');
    if (!(anchor instanceof HTMLElement)) {
      return;
    }
    const fly = document.createElement('div');
    fly.className = 'syn3-menu syn3-menu-sub';
    fly.setAttribute('role', 'menu');
    /** @type {Array<{ scope: 'H' | 'M' | 'L' | 'all', label: string, show: boolean }>} */
    const items = [
      { scope: 'H', label: t('studyHigh'), show: counts.H > 0 },
      { scope: 'M', label: t('studyMedium'), show: counts.M > 0 },
      { scope: 'L', label: t('studyLow'), show: counts.L > 0 },
      {
        scope: 'all',
        label: t('studyAll'),
        show: counts.H > 0 || counts.M > 0 || counts.L > 0,
      },
    ];
    for (const item of items) {
      if (!item.show) {
        continue;
      }
      fly.append(
        menuActionChoice(item.label, {
          study: item.scope,
          pageId,
          messageId,
        }),
      );
    }
    const listBtn = menuAction(t('studyList'));
    listBtn.dataset.menuAction = 'studyList';
    listBtn.dataset.pageId = pageId;
    listBtn.dataset.messageId = messageId;
    fly.append(listBtn);
    fly.addEventListener('mouseenter', () => {
      cancelMenuClose('context');
    });
    fly.addEventListener('mouseleave', () => {
      scheduleMenuClose('context', () => closeContextMenu());
    });
    fly.addEventListener('click', (event) => {
      handleSyn3MenuClick(event, 'context');
    });
    document.body.append(fly);
    studyMenu = fly;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = contextMenu.getBoundingClientRect();
    const flyWidth = fly.offsetWidth || 196;
    const flyHeight = fly.offsetHeight || 96;
    let top = anchorRect.top;
    if (top + flyHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 8 - flyHeight);
    }
    const roomRight = window.innerWidth - menuRect.right;
    const left = roomRight >= flyWidth + 8 ? menuRect.right - 6 : Math.max(8, menuRect.left - flyWidth + 6);
    fly.style.top = top + 'px';
    fly.style.left = left + 'px';
  }

  /**
   * Scope row inside «Ревью». Click opens the depth submenu.
   * @param {HTMLElement} nest
   * @param {'branch' | 'changes'} scope
   * @param {string} label
   */
  function appendReviewScopeRow(nest, scope, label) {
    const expanded = openMenuState?.reviewScope === scope;
    const row = menuAction('', expanded ? 'is-expanded' : '');
    row.dataset.menuAction = 'toggleReviewScope';
    row.dataset.reviewScope = scope;
    row.setAttribute('aria-haspopup', 'menu');
    row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    row.title = label;
    const title = document.createElement('span');
    title.className = 'syn3-menu-item-label';
    title.textContent = label;
    const caret = document.createElement('span');
    caret.className = 'syn3-menu-item-caret';
    caret.textContent = '▸';
    caret.setAttribute('aria-hidden', 'true');
    row.append(title, caret);
    nest.append(row);
  }

  /**
   * Scope row inside «Что сделано». Click opens the depth submenu.
   * @param {HTMLElement} nest
   * @param {'branch' | 'changes'} scope
   * @param {string} label
   */
  function appendExplainScopeRow(nest, scope, label) {
    const expanded = openMenuState?.explainScope === scope;
    const row = menuAction('', expanded ? 'is-expanded' : '');
    row.dataset.menuAction = 'toggleExplainScope';
    row.dataset.explainScope = scope;
    row.setAttribute('aria-haspopup', 'menu');
    row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    row.title = label;
    const title = document.createElement('span');
    title.className = 'syn3-menu-item-label';
    title.textContent = label;
    const caret = document.createElement('span');
    caret.className = 'syn3-menu-item-caret';
    caret.textContent = '▸';
    caret.setAttribute('aria-hidden', 'true');
    row.append(title, caret);
    nest.append(row);
  }

  /**
   * @param {string} messageId
   */
  function findReviewReply(messageId) {
    for (const msg of reviewState?.messages || []) {
      const reply = (msg.replies || []).find((item) => item.id === messageId);
      if (reply) {
        return reply;
      }
    }
    return undefined;
  }

  /** Parent chip to unfold so a neurofix skeleton under this message stays visible. */
  function reviewFoldParentId(messageId) {
    for (const msg of reviewState?.messages || []) {
      if (msg.id === messageId) {
        return msg.id;
      }
      if ((msg.replies || []).some((item) => item.id === messageId)) {
        return msg.id;
      }
    }
    return messageId;
  }

  /**
   * @param {HTMLElement} nest
   * @param {'inProgress' | 'done'} status
   * @param {string} label
   * @param {boolean} active
   * @param {string} pageId
   * @param {string} messageId
   */
  function appendReviewStatusChoice(nest, status, label, active, pageId, messageId) {
    const row = menuAction('', active ? 'is-active' : '');
    row.dataset.reviewStatus = status;
    row.dataset.pageId = pageId;
    row.dataset.messageId = messageId;
    const ico = document.createElement('span');
    ico.className = 'syn3-menu-item-ico';
    ico.append(status === 'done' ? reviewDoneIcon() : reviewProgressIcon());
    const title = document.createElement('span');
    title.className = 'syn3-menu-item-label';
    title.textContent = label;
    row.append(ico, title);
    nest.append(row);
  }

  /**
   * Depth flyout for the open scope. Lives on document.body so the context
   * menu's overflow does not clip it.
   * @param {'branch' | 'changes'} scope
   * @param {string} pageId
   * @param {string} messageId
   * @param {boolean} [asRoot]
   */
  function mountReviewDepthMenu(scope, pageId, messageId, asRoot) {
    clearReviewDepthMenu();
    const hostMenu =
      openMenuState?.kind === 'toolbar-create' ? toolbarCreateMenu : contextMenu;
    if (!(hostMenu instanceof HTMLElement)) {
      return;
    }
    const anchor = hostMenu.querySelector('[data-review-scope="' + scope + '"]');
    if (!(anchor instanceof HTMLElement)) {
      return;
    }
    const closeKind = openMenuState?.kind === 'toolbar-create' ? 'toolbar-create' : 'context';
    const fly = document.createElement('div');
    fly.className = 'syn3-menu syn3-menu-sub';
    fly.setAttribute('role', 'menu');
    const depths = [
      ['shallow', 'reviewDepthShallow'],
      ['medium', 'reviewDepthMedium'],
      ['deep', 'reviewDepthDeep'],
    ];
    for (const [depth, key] of depths) {
      fly.append(
        menuActionChoice(t(key), {
          review: scope,
          reviewDepth: depth,
          reviewRoot: !!asRoot,
          pageId,
          messageId,
        }),
      );
    }
    fly.addEventListener('mouseenter', () => {
      cancelMenuClose(closeKind);
    });
    fly.addEventListener('mouseleave', () => {
      if (closeKind === 'toolbar-create') {
        scheduleMenuClose('toolbar-create', () => closeToolbarCreateMenu());
      } else {
        scheduleMenuClose('context', () => closeContextMenu());
      }
    });
    fly.addEventListener('click', (event) => {
      handleSyn3MenuClick(event, closeKind === 'toolbar-create' ? 'toolbar-create' : 'context');
    });
    document.body.append(fly);
    reviewDepthMenu = fly;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = hostMenu.getBoundingClientRect();
    const flyWidth = fly.offsetWidth || 196;
    const flyHeight = fly.offsetHeight || 96;
    let top = anchorRect.top;
    if (top + flyHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 8 - flyHeight);
    }
    const roomRight = window.innerWidth - menuRect.right;
    const left = roomRight >= flyWidth + 8 ? menuRect.right - 6 : Math.max(8, menuRect.left - flyWidth + 6);
    fly.style.top = top + 'px';
    fly.style.left = left + 'px';
  }

  /**
   * Depth flyout for «Что сделано».
   * @param {'branch' | 'changes'} scope
   * @param {string} pageId
   * @param {string} messageId
   * @param {boolean} [asRoot]
   */
  function mountExplainDepthMenu(scope, pageId, messageId, asRoot) {
    clearReviewDepthMenu();
    const hostMenu =
      openMenuState?.kind === 'toolbar-create' ? toolbarCreateMenu : contextMenu;
    if (!(hostMenu instanceof HTMLElement)) {
      return;
    }
    const anchor = hostMenu.querySelector('[data-explain-scope="' + scope + '"]');
    if (!(anchor instanceof HTMLElement)) {
      return;
    }
    const closeKind = openMenuState?.kind === 'toolbar-create' ? 'toolbar-create' : 'context';
    const fly = document.createElement('div');
    fly.className = 'syn3-menu syn3-menu-sub';
    fly.setAttribute('role', 'menu');
    const depths = [
      ['shallow', 'reviewDepthShallow'],
      ['medium', 'reviewDepthMedium'],
      ['deep', 'reviewDepthDeep'],
    ];
    for (const [depth, key] of depths) {
      fly.append(
        menuActionChoice(t(key), {
          explain: scope,
          explainDepth: depth,
          explainRoot: !!asRoot,
          pageId,
          messageId,
        }),
      );
    }
    fly.addEventListener('mouseenter', () => {
      cancelMenuClose(closeKind);
    });
    fly.addEventListener('mouseleave', () => {
      if (closeKind === 'toolbar-create') {
        scheduleMenuClose('toolbar-create', () => closeToolbarCreateMenu());
      } else {
        scheduleMenuClose('context', () => closeContextMenu());
      }
    });
    fly.addEventListener('click', (event) => {
      handleSyn3MenuClick(event, closeKind === 'toolbar-create' ? 'toolbar-create' : 'context');
    });
    document.body.append(fly);
    reviewDepthMenu = fly;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = hostMenu.getBoundingClientRect();
    const flyWidth = fly.offsetWidth || 196;
    const flyHeight = fly.offsetHeight || 96;
    let top = anchorRect.top;
    if (top + flyHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 8 - flyHeight);
    }
    const roomRight = window.innerWidth - menuRect.right;
    const left = roomRight >= flyWidth + 8 ? menuRect.right - 6 : Math.max(8, menuRect.left - flyWidth + 6);
    fly.style.top = top + 'px';
    fly.style.left = left + 'px';
  }

  function rerenderContextMenu() {
    if (!openMenuState || openMenuState.kind !== 'context') {
      return;
    }
    // Keep the open menu where it is. Re-anchoring to the original click
    // flips a taller menu above the pointer, and the next move closes it.
    const placedLeft = parseFloat(contextMenu.style.left);
    const placedTop = parseFloat(contextMenu.style.top);
    renderContextMenu();
    cancelMenuClose('context');
    positionMenu(contextMenu, {
      left: Number.isFinite(placedLeft) ? placedLeft : (openMenuState.x ?? 0),
      top: Number.isFinite(placedTop) ? placedTop : (openMenuState.y ?? 0),
      keepPosition: true,
    });
    if (openMenuState.reviewExpanded && openMenuState.reviewScope && openMenuState.ctx) {
      mountReviewDepthMenu(
        openMenuState.reviewScope,
        String(openMenuState.ctx.reviewPageId || ''),
        String(openMenuState.ctx.reviewMessageId || ''),
      );
    }
    if (openMenuState.explainExpanded && openMenuState.explainScope && openMenuState.ctx) {
      const asRoot = String(openMenuState.ctx.webviewSection || '') === 'reviewExplain';
      mountExplainDepthMenu(
        openMenuState.explainScope,
        String(openMenuState.ctx.reviewPageId || ''),
        String(openMenuState.ctx.reviewMessageId || ''),
        asRoot,
      );
    }
    if (openMenuState.neurofixExpanded && openMenuState.ctx) {
      const pageId = String(openMenuState.ctx.reviewPageId || '');
      const messageId = String(openMenuState.ctx.reviewMessageId || '');
      const reply = findReviewReply(messageId);
      const chip = (reviewState?.messages || []).find((item) => item.id === messageId);
      const source = reply || chip;
      const counts = source?.isRereview
        ? rereviewRemainingCounts(source)
        : remainingSeverityCounts(parsePillSeverityCounts(source?.pillLabel), source);
      if (counts && counts.H + counts.M + counts.L > 0) {
        mountNeuroFixMenu(pageId, messageId, counts);
      }
    }
    if (openMenuState.rereviewExpanded && openMenuState.ctx) {
      const pageId = String(openMenuState.ctx.reviewPageId || '');
      const messageId = String(openMenuState.ctx.reviewMessageId || '');
      const reply = findReviewReply(messageId);
      const chip = (reviewState?.messages || []).find((item) => item.id === messageId);
      const counts = sourceSeverityCounts(reply || chip);
      if (counts && counts.H + counts.M + counts.L > 0) {
        mountRereviewMenu(pageId, messageId, counts);
      }
    }
    if (openMenuState.studyExpanded && openMenuState.ctx) {
      const pageId = String(openMenuState.ctx.reviewPageId || '');
      const messageId = String(openMenuState.ctx.reviewMessageId || '');
      const reply = findReviewReply(messageId);
      const chip = (reviewState?.messages || []).find((item) => item.id === messageId);
      const counts = sourceSeverityCounts(reply || chip);
      if (counts && counts.H + counts.M + counts.L > 0) {
        mountStudyMenu(pageId, messageId, counts);
      }
    }
  }

  function renderContextMenu() {
    if (!openMenuState || openMenuState.kind !== 'context' || !openMenuState.ctx) {
      return;
    }
    const ctx = openMenuState.ctx;
    const section = String(ctx.webviewSection || '');
    const depth = Number(ctx.depth) || 0;
    // replaceChildren can synthesize mouseleave; ignore it until the pointer moves again.
    armContextMenuDismiss();
    cancelMenuClose('context');
    clearReviewDepthMenu();
    clearNeuroFixMenu();
    clearRereviewMenu();
    clearStudyMenu();
    const { scroller } = ensureMenuChrome(contextMenu);
    scroller.replaceChildren();
    if (section === 'reviewMr') {
      const pageId = String(ctx.reviewPageId || '');
      const messageId = String(ctx.reviewMessageId || '');
      const chip = (reviewState?.messages || []).find((item) => item.id === messageId);
      const isPr = typeof chip?.webUrl === 'string' && /\/pull\/\d+/.test(chip.webUrl);
      appendExpandableMenuBlock(
        scroller,
        t('reviewMenu'),
        !!openMenuState.reviewExpanded,
        'toggleReview',
        (nest) => {
          const mrBranch = reviewBranchLabel(chip?.branch);
          // Pulled MR of another branch: review that branch, not the checkout.
          if (mrBranch && !reviewBranchMatchesCheckout(mrBranch)) {
            appendReviewScopeRow(nest, 'branch', mrBranch);
            return;
          }
          appendReviewScopeRow(nest, 'branch', t('reviewScopeBranch'));
          appendReviewScopeRow(nest, 'changes', t('reviewScopeUnpushed'));
        },
        { plain: true },
      );
      appendExpandableMenuBlock(
        scroller,
        t('explainMenu'),
        !!openMenuState.explainExpanded,
        'toggleExplain',
        (nest) => {
          const mrBranch = reviewBranchLabel(chip?.branch);
          if (mrBranch && !reviewBranchMatchesCheckout(mrBranch)) {
            appendExplainScopeRow(nest, 'branch', mrBranch);
            return;
          }
          appendExplainScopeRow(nest, 'branch', t('reviewScopeBranch'));
          appendExplainScopeRow(nest, 'changes', t('reviewScopeUnpushed'));
        },
        { plain: true },
      );
      scroller.append(
        menuActionChoice(t(isPr ? 'reviewRenamePr' : 'reviewRenameMr'), {
          reviewEdit: 'rename',
          pageId,
          messageId,
        }),
      );
      scroller.append(
        menuActionChoice(t(chip?.draft ? 'reviewClearDraft' : 'reviewSetDraft'), {
          reviewEdit: 'draft',
          pageId,
          messageId,
        }),
      );
      scroller.append(
        menuActionChoice(t(isPr ? 'reviewClosePr' : 'reviewCloseMr'), {
          reviewEdit: 'close',
          pageId,
          messageId,
        }),
      );
      scroller.append(
        menuActionChoice(t('menuDelete'), {
          reviewEdit: 'delete',
          pageId,
          messageId,
        }),
      );
      scroller.append(
        menuActionChoice(t(chip?.locked ? 'reviewUnlock' : 'reviewLock'), {
          reviewEdit: 'lock',
          pageId,
          messageId,
        }),
      );
      if (chip?.status === 'closed' || chip?.locked) {
        const reviewStays = !!chip?.locked && chip?.status !== 'closed';
        scroller.querySelectorAll('button').forEach((button) => {
          if (button.dataset.reviewEdit === 'lock') {
            return;
          }
          if (chip?.status === 'closed' && !chip?.locked && button.dataset.reviewEdit === 'delete') {
            return;
          }
          // A lock freezes edits. Starting a review on an open MR stays available.
          if (
            reviewStays &&
            (button.dataset.menuAction === 'toggleReview' ||
              button.dataset.menuAction === 'toggleReviewScope' ||
              button.dataset.menuAction === 'toggleExplain' ||
              button.dataset.menuAction === 'toggleExplainScope')
          ) {
            return;
          }
          button.disabled = true;
        });
      }
      updateMenuScrollbar(contextMenu);
      return;
    }
    if (section === 'reviewRoot') {
      const pageId = String(ctx.reviewPageId || '');
      const messageId = String(ctx.reviewMessageId || '');
      const chip = (reviewState?.messages || []).find((item) => item.id === messageId);
      const status = chip?.reviewStatus || '';
      appendExpandableMenuBlock(
        scroller,
        t('reviewMenu'),
        !!openMenuState.reviewExpanded,
        'toggleReview',
        (nest) => {
          const rootBranch = reviewBranchLabel(chip?.branch);
          if (rootBranch && !reviewBranchMatchesCheckout(rootBranch)) {
            appendReviewScopeRow(nest, 'branch', rootBranch);
            return;
          }
          appendReviewScopeRow(nest, 'branch', t('reviewScopeBranch'));
          appendReviewScopeRow(nest, 'changes', t('reviewScopeUnpushed'));
        },
        { plain: true },
      );
      appendExpandableMenuBlock(
        scroller,
        t('explainMenu'),
        !!openMenuState.explainExpanded,
        'toggleExplain',
        (nest) => {
          const rootBranch = reviewBranchLabel(chip?.branch);
          if (rootBranch && !reviewBranchMatchesCheckout(rootBranch)) {
            appendExplainScopeRow(nest, 'branch', rootBranch);
            return;
          }
          appendExplainScopeRow(nest, 'branch', t('reviewScopeBranch'));
          appendExplainScopeRow(nest, 'changes', t('reviewScopeUnpushed'));
        },
        { plain: true },
      );
      appendExpandableMenuBlock(
        scroller,
        t('reviewStatus'),
        !!openMenuState.reviewStatusExpanded,
        'toggleReviewStatus',
        (nest) => {
          appendReviewStatusChoice(
            nest,
            'inProgress',
            t('reviewStatusProgress'),
            status === 'inProgress',
            pageId,
            messageId,
          );
          appendReviewStatusChoice(
            nest,
            'done',
            t('reviewStatusDone'),
            status === 'done',
            pageId,
            messageId,
          );
        },
        { plain: true },
      );
      const counts = remainingSeverityCounts(parsePillSeverityCounts(chip?.pillLabel), chip);
      if (counts && counts.H + counts.M + counts.L > 0) {
        appendNeuroFixRow(scroller, !!openMenuState.neurofixExpanded, reviewNeurofixBlocked(messageId));
      }
      const rereviewCounts = sourceSeverityCounts(chip);
      if (rereviewCounts && rereviewCounts.H + rereviewCounts.M + rereviewCounts.L > 0) {
        appendRereviewRow(scroller, !!openMenuState.rereviewExpanded);
        appendStudyRow(scroller, !!openMenuState.studyExpanded);
      }
      scroller.append(
        menuActionChoice(t('reviewMigrate'), {
          reviewEdit: 'migrate',
          pageId,
          messageId,
        }),
      );
      scroller.append(
        menuActionChoice(t('menuDelete'), {
          reviewEdit: 'delete',
          pageId,
          messageId,
        }),
      );
      scroller.append(
        menuActionChoice(t(chip?.locked ? 'reviewUnlock' : 'reviewLock'), {
          reviewEdit: 'lock',
          pageId,
          messageId,
        }),
      );
      if (chip?.locked) {
        scroller.querySelectorAll('button').forEach((button) => {
          if (button.dataset.reviewEdit === 'lock' || button.dataset.reviewEdit === 'migrate') {
            return;
          }
          if (
            button.dataset.menuAction === 'toggleReview' ||
            button.dataset.menuAction === 'toggleReviewScope' ||
            button.dataset.menuAction === 'toggleExplain' ||
            button.dataset.menuAction === 'toggleExplainScope'
          ) {
            return;
          }
          button.disabled = true;
        });
      }
      updateMenuScrollbar(contextMenu);
      return;
    }
    if (section === 'reviewExplain') {
      const pageId = String(ctx.reviewPageId || '');
      const messageId = String(ctx.reviewMessageId || '');
      const chip =
        (reviewState?.messages || []).find((item) => item.id === messageId) ||
        findReviewReply(messageId);
      scroller.append(
        menuActionChoice(t('menuDelete'), {
          reviewEdit: 'delete',
          pageId,
          messageId,
        }),
      );
      updateMenuScrollbar(contextMenu);
      return;
    }
    if (section === 'reviewPill') {
      const pageId = String(ctx.reviewPageId || '');
      const messageId = String(ctx.reviewMessageId || '');
      const reply = findReviewReply(messageId);
      const status = reply?.status || '';
      appendExpandableMenuBlock(
        scroller,
        t('reviewStatus'),
        !!openMenuState.reviewStatusExpanded,
        'toggleReviewStatus',
        (nest) => {
          appendReviewStatusChoice(
            nest,
            'inProgress',
            t('reviewStatusProgress'),
            status === 'inProgress',
            pageId,
            messageId,
          );
          appendReviewStatusChoice(
            nest,
            'done',
            t('reviewStatusDone'),
            status === 'done',
            pageId,
            messageId,
          );
        },
        { plain: true },
      );
      if (!reply?.isRereview && !reply?.isStudy) {
        const counts = remainingSeverityCounts(parsePillSeverityCounts(reply?.pillLabel), reply);
        if (counts && counts.H + counts.M + counts.L > 0) {
          appendNeuroFixRow(scroller, !!openMenuState.neurofixExpanded, reviewNeurofixBlocked(messageId));
        }
        const rereviewCounts = sourceSeverityCounts(reply);
        if (rereviewCounts && rereviewCounts.H + rereviewCounts.M + rereviewCounts.L > 0) {
          appendRereviewRow(scroller, !!openMenuState.rereviewExpanded);
          appendStudyRow(scroller, !!openMenuState.studyExpanded);
        }
      }
      if (!reply?.isRereview && !reply?.isStudy) {
        scroller.append(
          menuActionChoice(t('reviewMigrate'), {
            reviewEdit: 'migrate',
            pageId,
            messageId,
          }),
        );
      }
      scroller.append(
        menuActionChoice(t('menuDelete'), {
          reviewEdit: 'delete',
          pageId,
          messageId,
        }),
      );
      updateMenuScrollbar(contextMenu);
      return;
    }
    if (section === 'reviewNeurofix') {
      const pageId = String(ctx.reviewPageId || '');
      const messageId = String(ctx.reviewMessageId || '');
      const reply = findReviewReply(messageId);
      const rootChip = (reviewState?.messages || []).find(
        (item) => item.id === messageId && item.isReviewRoot,
      );
      const source = reply || rootChip;
      const blocked = reviewNeurofixBlocked(messageId);
      const counts = source?.isRereview
        ? rereviewRemainingCounts(source)
        : remainingSeverityCounts(parsePillSeverityCounts(source?.pillLabel), source);
      if (counts) {
        /** @type {Array<{ scope: 'H' | 'M' | 'L' | 'all', label: string, show: boolean }>} */
        const items = [
          { scope: 'H', label: t('neurofixHigh'), show: counts.H > 0 },
          { scope: 'M', label: t('neurofixMedium'), show: counts.M > 0 },
          { scope: 'L', label: t('neurofixSimple'), show: counts.L > 0 },
          {
            scope: 'all',
            label: t('neurofixAll'),
            show: counts.H > 0 || counts.M > 0 || counts.L > 0,
          },
        ];
        let any = false;
        for (const item of items) {
          if (!item.show) {
            continue;
          }
          any = true;
          const choice = menuActionChoice(item.label, {
            neuroFix: item.scope,
            pageId,
            messageId,
          });
          if (blocked) {
            muteNeurofixAction(choice);
          }
          scroller.append(choice);
        }
        if (any) {
          const listBtn = menuAction(t('neurofixList'));
          listBtn.dataset.menuAction = 'neuroFixList';
          listBtn.dataset.pageId = pageId;
          listBtn.dataset.messageId = messageId;
          if (blocked) {
            muteNeurofixAction(listBtn);
          }
          scroller.append(listBtn);
        }
      }
      if (!source?.isRereview && !source?.isStudy) {
        const rereviewCounts = sourceSeverityCounts(source);
        if (rereviewCounts && rereviewCounts.H + rereviewCounts.M + rereviewCounts.L > 0) {
          appendRereviewRow(scroller, !!openMenuState.rereviewExpanded);
          appendStudyRow(scroller, !!openMenuState.studyExpanded);
        }
      }
      updateMenuScrollbar(contextMenu);
      return;
    }
    if (section === 'reviewMsg') {
      const pageId = String(ctx.reviewPageId || '');
      const messageId = String(ctx.reviewMessageId || '');
      const parent = (reviewState?.messages || []).find((item) => item.id === messageId);
      const del = menuActionChoice(t('menuDelete'), {
        reviewEdit: 'delete',
        pageId,
        messageId,
      });
      if (parent?.locked) {
        del.disabled = true;
      }
      scroller.append(del);
      if (parent) {
        scroller.append(
          menuActionChoice(t(parent.locked ? 'reviewUnlock' : 'reviewLock'), {
            reviewEdit: 'lock',
            pageId,
            messageId,
          }),
        );
      }
      updateMenuScrollbar(contextMenu);
      return;
    }
    if (section === 'problems') {
      const filters = problemsFilterState();
      scroller.append(
        menuChoice(t('filterProblemsError'), filters.error, {
          set: 'problemsFilter',
          value: 'error',
        }),
      );
      scroller.append(
        menuChoice(t('filterProblemsWarning'), filters.warning, {
          set: 'problemsFilter',
          value: 'warning',
        }),
      );
      scroller.append(
        menuChoice(t('filterProblemsInfo'), filters.info, {
          set: 'problemsFilter',
          value: 'info',
        }),
      );
      updateMenuScrollbar(contextMenu);
      return;
    }
    for (const item of contextMenuItems(ctx)) {
      if (item.kind === 'separator') {
        scroller.append(menuSeparator());
        continue;
      }
      if (item.kind === 'view') {
        appendExpandableMenuBlock(scroller, t('toolbarView'), !!openMenuState.viewExpanded, 'toggleView', (nest) => {
          fillViewSections(nest);
        });
        continue;
      }
      if (item.kind === 'settings') {
        const row = menuAction(t('menuSettings'));
        row.dataset.menuAction = 'openSettings';
        scroller.append(row);
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
      if (item.kind === 'copyLink') {
        const row = menuAction(t('menuCopyLink'));
        row.dataset.menuAction = 'copyLink';
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
    const entityLocked = !!ctx.locked;
    const locked = entityLocked;
    const hasAlias = !!ctx.hasAlias;
    const depth = Number(ctx.depth) || 0;
    const isDir = !!ctx.isDir;
    const noteEditing = !!ctx.noteEditing;
    /** @type {Array<{ kind: 'command', command: string, label: string } | { kind: 'view' } | { kind: 'create' } | { kind: 'delete' } | { kind: 'settings' } | { kind: 'unlock' } | { kind: 'separator' } | { kind: 'copy' } | { kind: 'copyLink' } | { kind: 'paste', disabled?: boolean }>} */
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

    if (section === 'marker') {
      items.push({ kind: 'settings' });
    }
    if (section === 'marker' && !locked) {
      items.push({ kind: 'create' });
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

    if (section === 'marker' || section === 'note') {
      items.push({ kind: 'copyLink' });
    }

    if ((section === 'marker' || section === 'note') && entityLocked) {
      items.push({ kind: 'unlock' });
    }

    return items;
  }

  function aliasTitleOn() {
    return data?.appearance?.aliasTitle === true;
  }

  /**
   * Small alias line stays above the title. When aliasTitle is on and an alias
   * is set, those two strings trade places; the line styles stay put.
   * No alias: title only.
   * @param {HTMLElement} wrap
   * @param {string} titleClass
   * @param {string} titleText
   * @param {string | undefined} alias
   * @returns {HTMLElement}
   */
  function appendNameSlots(wrap, titleClass, titleText, alias) {
    const swap = aliasTitleOn() && !!alias;
    if (alias) {
      wrap.append(el('span', 'alias', swap ? titleText : alias));
    }
    const titleEl = el('span', titleClass, swap ? alias : titleText);
    wrap.append(titleEl);
    return titleEl;
  }

  /** @param {HTMLElement} root */
  function fillViewSections(root) {
    const isMenu = root.classList.contains('syn3-menu');
    const target = isMenu ? ensureMenuChrome(root).scroller : root;
    target.replaceChildren();
    const page = activePage();
    const layout = page?.layout || data?.layout || 'chips';
    const groupsLayout = page?.groupsLayout || data?.groupsLayout || 'flow';

    // Map and group layout stay in one block. Alias is its own row under a rule.
    target.append(menuLabel(t('viewMap')));
    target.append(menuChoice(t('viewCards'), layout === 'chips', { set: 'layout', value: 'chips' }));
    target.append(menuChoice(t('viewList'), layout === 'list', { set: 'layout', value: 'list' }));
    target.append(menuLabel(t('viewMapLayout')));
    target.append(menuChoice(t('viewFlow'), groupsLayout === 'flow', { set: 'groups', value: 'flow' }));
    target.append(menuChoice(t('viewCol1'), groupsLayout === '1', { set: 'groups', value: '1' }));
    target.append(menuChoice(t('viewCol2'), groupsLayout === '2', { set: 'groups', value: '2' }));
    target.append(menuChoice(t('viewCol3'), groupsLayout === '3', { set: 'groups', value: '3' }));
    target.append(menuSeparator());
    target.append(menuChoice(t('viewAlias'), aliasTitleOn(), { set: 'aliasTitle', value: '1' }));
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
    if (button.dataset.neurofixBlocked === '1') {
      event.preventDefault();
      event.stopPropagation();
      denyForeignNeurofix();
      return;
    }
    event.stopPropagation();
    if (button.disabled) {
      return;
    }
    // Rebuilds replace DOM and can fire mouseleave — keep the menu open.
    if (source === 'context') {
      cancelMenuClose('context');
    }

    if (button.dataset.toolbar) {
      closeToolbarMenus();
      postToolbar(button.dataset.toolbar);
      return;
    }

    if (button.dataset.review) {
      const pageId = button.dataset.pageId || activePage()?.id || '';
      const messageId = button.dataset.messageId || '';
      const kind = button.dataset.review;
      const depth = button.dataset.reviewDepth || 'medium';
      const asRoot = button.dataset.reviewRoot === '1' || !messageId;
      closeContextMenu();
      closeToolbarCreateMenu();
      if (asRoot) {
        vscode.postMessage({
          type: 'reviewStartRoot',
          pageId,
          kind,
          depth,
        });
      } else {
        beginLocalReviewSkeleton(pageId, messageId);
        vscode.postMessage({
          type: 'reviewStart',
          pageId,
          messageId,
          kind,
          depth,
        });
      }
      return;
    }

    if (button.dataset.explain) {
      const pageId = button.dataset.pageId || activePage()?.id || '';
      const messageId = button.dataset.messageId || '';
      const kind = button.dataset.explain;
      const depth = button.dataset.explainDepth || 'medium';
      const asRoot = button.dataset.explainRoot === '1' || !messageId;
      closeContextMenu();
      closeToolbarCreateMenu();
      if (asRoot) {
        beginLocalExplainRootSkeleton(pageId, t('explainMenu'));
        vscode.postMessage({
          type: 'explainStartRoot',
          pageId,
          kind,
          depth,
        });
      } else {
        beginLocalExplainSkeleton(pageId, messageId);
        vscode.postMessage({
          type: 'explainStart',
          pageId,
          messageId,
          kind,
          depth,
        });
      }
      return;
    }

    if (button.dataset.menuAction === 'togglePull') {
      if (openMenuState?.kind === 'toolbar-create') {
        openMenuState.pullExpanded = !openMenuState.pullExpanded;
        if (openMenuState.pullExpanded) {
          openMenuState.reviewExpanded = false;
          openMenuState.reviewScope = '';
          openMenuState.explainExpanded = false;
          openMenuState.explainScope = '';
        }
        rerenderCreateMenu();
      }
      return;
    }

    if (button.dataset.menuAction === 'openBranchPanelPull') {
      closeToolbarCreateMenu();
      openHostBranchPanel('pull');
      return;
    }

    if (button.dataset.menuAction === 'openBranchPanelReview') {
      closeToolbarCreateMenu();
      openHostBranchPanel('review');
      return;
    }

    if (button.dataset.menuAction === 'openBranchPanelExplain') {
      closeToolbarCreateMenu();
      openHostBranchPanel('explain');
      return;
    }

    if (button.dataset.menuAction === 'toggleReview') {
      if (openMenuState?.kind === 'context') {
        openMenuState.reviewExpanded = !openMenuState.reviewExpanded;
        if (!openMenuState.reviewExpanded) {
          openMenuState.reviewScope = '';
        }
        if (openMenuState.reviewExpanded) {
          openMenuState.explainExpanded = false;
          openMenuState.explainScope = '';
        }
        openMenuState.neurofixExpanded = false;
        rerenderContextMenu();
      } else if (openMenuState?.kind === 'toolbar-create') {
        openMenuState.reviewExpanded = !openMenuState.reviewExpanded;
        if (!openMenuState.reviewExpanded) {
          openMenuState.reviewScope = '';
        }
        if (openMenuState.reviewExpanded) {
          openMenuState.pullExpanded = false;
          openMenuState.explainExpanded = false;
          openMenuState.explainScope = '';
        }
        rerenderCreateMenu();
      }
      return;
    }

    if (button.dataset.menuAction === 'toggleExplain') {
      if (openMenuState?.kind === 'context') {
        openMenuState.explainExpanded = !openMenuState.explainExpanded;
        if (!openMenuState.explainExpanded) {
          openMenuState.explainScope = '';
        }
        if (openMenuState.explainExpanded) {
          openMenuState.reviewExpanded = false;
          openMenuState.reviewScope = '';
        }
        openMenuState.neurofixExpanded = false;
        rerenderContextMenu();
      } else if (openMenuState?.kind === 'toolbar-create') {
        openMenuState.explainExpanded = !openMenuState.explainExpanded;
        if (!openMenuState.explainExpanded) {
          openMenuState.explainScope = '';
        }
        if (openMenuState.explainExpanded) {
          openMenuState.pullExpanded = false;
          openMenuState.reviewExpanded = false;
          openMenuState.reviewScope = '';
        }
        rerenderCreateMenu();
      }
      return;
    }

    if (button.dataset.menuAction === 'toggleNeuroFix') {
      if (openMenuState?.kind === 'context') {
        openMenuState.neurofixExpanded = !openMenuState.neurofixExpanded;
        if (openMenuState.neurofixExpanded) {
          openMenuState.reviewExpanded = false;
          openMenuState.reviewScope = '';
          openMenuState.reviewStatusExpanded = false;
          openMenuState.rereviewExpanded = false;
          openMenuState.studyExpanded = false;
        }
        rerenderContextMenu();
      }
      return;
    }

    if (button.dataset.menuAction === 'toggleRereview') {
      if (openMenuState?.kind === 'context') {
        openMenuState.rereviewExpanded = !openMenuState.rereviewExpanded;
        if (openMenuState.rereviewExpanded) {
          openMenuState.neurofixExpanded = false;
          openMenuState.reviewExpanded = false;
          openMenuState.reviewScope = '';
          openMenuState.reviewStatusExpanded = false;
          openMenuState.studyExpanded = false;
        }
        rerenderContextMenu();
      }
      return;
    }

    if (button.dataset.rereview) {
      const pageId = button.dataset.pageId || '';
      const messageId = button.dataset.messageId || '';
      const scope = button.dataset.rereview;
      const selection = scope === 'all' ? { H: 'all', M: 'all', L: 'all' } : { [scope]: 'all' };
      closeContextMenu();
      postRereview(pageId, messageId, selection);
      return;
    }

    if (button.dataset.menuAction === 'toggleStudy') {
      if (openMenuState?.kind === 'context') {
        openMenuState.studyExpanded = !openMenuState.studyExpanded;
        if (openMenuState.studyExpanded) {
          openMenuState.neurofixExpanded = false;
          openMenuState.rereviewExpanded = false;
          openMenuState.reviewExpanded = false;
          openMenuState.reviewScope = '';
          openMenuState.reviewStatusExpanded = false;
        }
        rerenderContextMenu();
      }
      return;
    }

    if (button.dataset.study) {
      const pageId = button.dataset.pageId || '';
      const messageId = button.dataset.messageId || '';
      const scope = button.dataset.study;
      const selection = scope === 'all' ? { H: 'all', M: 'all', L: 'all' } : { [scope]: 'all' };
      closeContextMenu();
      postStudy(pageId, messageId, selection);
      return;
    }

    if (button.dataset.menuAction === 'studyList') {
      const pageId = button.dataset.pageId || '';
      const messageId = button.dataset.messageId || '';
      const menuRect = contextMenu.getBoundingClientRect();
      const flyRect = studyMenu?.getBoundingClientRect();
      const left = Number.isFinite(menuRect.left) ? menuRect.left : 0;
      const top = Number.isFinite(menuRect.top) ? menuRect.top : 0;
      const width = flyRect && flyRect.width > menuRect.width ? flyRect.width : menuRect.width;
      closeContextMenu();
      openNeuroFixListPanel({ pageId, messageId, left, top, width, mode: 'study' });
      return;
    }

    if (button.dataset.menuAction === 'rereviewList') {
      const pageId = button.dataset.pageId || '';
      const messageId = button.dataset.messageId || '';
      const menuRect = contextMenu.getBoundingClientRect();
      const flyRect = rereviewMenu?.getBoundingClientRect();
      const left = Number.isFinite(menuRect.left) ? menuRect.left : 0;
      const top = Number.isFinite(menuRect.top) ? menuRect.top : 0;
      const width = flyRect && flyRect.width > menuRect.width ? flyRect.width : menuRect.width;
      closeContextMenu();
      openNeuroFixListPanel({ pageId, messageId, left, top, width, mode: 'rereview' });
      return;
    }

    if (button.dataset.menuAction === 'neuroFixList') {
      const pageId = button.dataset.pageId || '';
      const messageId = button.dataset.messageId || '';
      const menuRect = contextMenu.getBoundingClientRect();
      const flyRect = neuroFixMenu?.getBoundingClientRect();
      const left = Number.isFinite(menuRect.left) ? menuRect.left : 0;
      const top = Number.isFinite(menuRect.top) ? menuRect.top : 0;
      const width = flyRect && flyRect.width > menuRect.width ? flyRect.width : menuRect.width;
      closeContextMenu();
      openNeuroFixListPanel({ pageId, messageId, left, top, width });
      return;
    }

    if (button.dataset.reviewStatus) {
      closeContextMenu();
      vscode.postMessage({
        type: 'reviewSetStatus',
        pageId: button.dataset.pageId || '',
        messageId: button.dataset.messageId || '',
        status: button.dataset.reviewStatus,
      });
      return;
    }

    if (button.dataset.menuAction === 'toggleReviewStatus') {
      if (openMenuState?.kind === 'context') {
        openMenuState.reviewStatusExpanded = !openMenuState.reviewStatusExpanded;
        openMenuState.neurofixExpanded = false;
        rerenderContextMenu();
      }
      return;
    }

    if (button.dataset.menuAction === 'toggleReviewScope') {
      if (openMenuState?.kind === 'context') {
        const scope = button.dataset.reviewScope || '';
        openMenuState.reviewScope = openMenuState.reviewScope === scope ? '' : scope;
        openMenuState.reviewExpanded = true;
        openMenuState.explainExpanded = false;
        openMenuState.explainScope = '';
        openMenuState.neurofixExpanded = false;
        rerenderContextMenu();
      } else if (openMenuState?.kind === 'toolbar-create') {
        const scope = button.dataset.reviewScope || '';
        openMenuState.reviewScope = openMenuState.reviewScope === scope ? '' : scope;
        openMenuState.reviewExpanded = true;
        openMenuState.explainExpanded = false;
        openMenuState.explainScope = '';
        rerenderCreateMenu();
      }
      return;
    }

    if (button.dataset.menuAction === 'toggleExplainScope') {
      if (openMenuState?.kind === 'context') {
        const scope = button.dataset.explainScope || '';
        openMenuState.explainScope = openMenuState.explainScope === scope ? '' : scope;
        openMenuState.explainExpanded = true;
        openMenuState.reviewExpanded = false;
        openMenuState.reviewScope = '';
        openMenuState.neurofixExpanded = false;
        rerenderContextMenu();
      } else if (openMenuState?.kind === 'toolbar-create') {
        const scope = button.dataset.explainScope || '';
        openMenuState.explainScope = openMenuState.explainScope === scope ? '' : scope;
        openMenuState.explainExpanded = true;
        openMenuState.reviewExpanded = false;
        openMenuState.reviewScope = '';
        rerenderCreateMenu();
      }
      return;
    }

    if (button.dataset.neuroFix) {
      const pageId = button.dataset.pageId || '';
      const messageId = button.dataset.messageId || '';
      closeContextMenu();
      beginLocalNeurofixSkeleton(pageId, messageId);
      vscode.postMessage({
        type: 'reviewNeurofix',
        pageId,
        messageId,
        scope: button.dataset.neuroFix,
      });
      return;
    }

    if (button.dataset.reviewEdit) {
      closeContextMenu();
      const pageId = button.dataset.pageId || '';
      const messageId = button.dataset.messageId || '';
      const parent = (reviewState?.messages || []).find((item) => item.id === messageId);
      const replyChip = parent ? undefined : findReviewReply(messageId);
      const chip = parent || replyChip;
      if (button.dataset.reviewEdit === 'lock') {
        if (parent) {
          vscode.postMessage({
            type: 'reviewSetLock',
            pageId,
            messageId,
            locked: parent.locked !== true,
          });
        }
        return;
      }
      if (button.dataset.reviewEdit === 'migrate') {
        vscode.postMessage({
          type: 'reviewMigrate',
          pageId,
          messageId,
        });
        return;
      }
      if (parent?.locked) {
        return;
      }
      if (button.dataset.reviewEdit === 'rename') {
        openReviewRenamePanel({
          pageId,
          messageId,
          title: parent?.title || '',
          isPr: typeof parent?.webUrl === 'string' && /\/pull\/\d+/.test(parent.webUrl),
        });
      } else if (button.dataset.reviewEdit === 'close') {
        vscode.postMessage({
          type: 'reviewCloseMr',
          pageId,
          messageId,
        });
      } else if (button.dataset.reviewEdit === 'delete') {
        vscode.postMessage({
          type: 'reviewDeleteReview',
          pageId,
          messageId,
        });
      } else {
        vscode.postMessage({
          type: 'reviewUpdateMr',
          pageId,
          messageId,
          draft: chip?.draft !== true,
        });
      }
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

    if (button.dataset.menuAction === 'openSettings') {
      const ctx = openMenuState?.ctx;
      closeContextMenu();
      if (ctx && typeof ctx.markerId === 'string') {
        openGroupSettingsPanel({ mode: 'edit', markerId: ctx.markerId });
      }
      return;
    }

    if (button.dataset.create) {
      const ctx = openMenuState?.ctx;
      const section = ctx && typeof ctx.webviewSection === 'string' ? ctx.webviewSection : '';
      if (button.dataset.create === 'subgroup' && section === 'marker' && typeof ctx?.markerId === 'string') {
        closeContextMenu();
        openGroupSettingsPanel({ mode: 'create', parentId: ctx.markerId });
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
    if (button.dataset.menuAction === 'copyLink') {
      const ctx = openMenuState?.ctx;
      const section = ctx && typeof ctx.webviewSection === 'string' ? ctx.webviewSection : '';
      const url =
        section === 'note' && typeof ctx?.noteId === 'string'
          ? entityLinkFor('note', ctx.noteId)
          : section === 'marker' && typeof ctx?.markerId === 'string'
            ? entityLinkFor('group', ctx.markerId)
            : '';
      if (url) {
        vscode.postMessage({ type: 'clipboardWrite', text: url });
      }
      closeContextMenu();
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

    if (button.dataset.set === 'problemsFilter' && button.dataset.value) {
      const value = button.dataset.value;
      if (value === 'error' || value === 'warning' || value === 'info') {
        toggleProblemsFilter(value);
      }
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
    if (button.dataset.set === 'aliasTitle') {
      const next = !aliasTitleOn();
      if (data && typeof data === 'object') {
        data.appearance = { ...(data.appearance || {}), aliasTitle: next };
      }
      vscode.postMessage({ type: 'setAppearance', appearance: { aliasTitle: next } });
      render();
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
      fillViewSections(toolbarViewMenu);
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
    if (pageSkeletonKind()) {
      return;
    }
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
    closeProjectMenu();
  }

  function closeProjectMenu() {
    cancelMenuClose('toolbar-project');
    if (toolbarProjectMenu) {
      toolbarProjectMenu.hidden = true;
    }
    toolbarProject?.setAttribute('aria-expanded', 'false');
  }

  function applyBaseConfigLoader() {
    if (!toolbarBaseLoader) {
      return;
    }
    if (!baseConfigBusy && !pageCloudBusy) {
      toolbarBaseLoader.hidden = true;
      toolbarBaseLoader.replaceChildren();
      toolbarBaseLoader.removeAttribute('title');
      toolbarBaseLoader.setAttribute('aria-hidden', 'true');
      toolbarBaseLoader.removeAttribute('aria-label');
      return;
    }
    const label = baseConfigBusy ? t('baseConfigWorking') : t('pageCloudWorking');
    toolbarBaseLoader.hidden = false;
    toolbarBaseLoader.title = label;
    toolbarBaseLoader.setAttribute('aria-label', label);
    toolbarBaseLoader.setAttribute('aria-hidden', 'false');
    toolbarBaseLoader.replaceChildren(reviewProgressIcon());
  }

  function workspaceCloudCanPush() {
    if (projectConfigSync && projectConfigSync.canPush) {
      return true;
    }
    const profileSync = data?.profileConfigSync;
    if (profileSync && profileSync.canPush) {
      return true;
    }
    for (const id of Object.keys(pageConfigSync)) {
      if (pageConfigSync[id]?.canPush) {
        return true;
      }
    }
    return false;
  }

  function workspaceCloudCanPull() {
    if (projectConfigSync && projectConfigSync.canPull) {
      return true;
    }
    const profileSync = data?.profileConfigSync;
    if (profileSync && profileSync.canPull) {
      return true;
    }
    for (const id of Object.keys(pageConfigSync)) {
      if (pageConfigSync[id]?.canPull) {
        return true;
      }
    }
    return pendingRemoteCount > 0;
  }

  function applyWorkspaceCloudButtons() {
    const busy = baseConfigBusy || pageCloudBusy;
    if (toolbarCloudPull) {
      const canPull = workspaceCloudCanPull();
      const pullLabel = t('workspaceCloudPull');
      toolbarCloudPull.title = pullLabel;
      toolbarCloudPull.setAttribute('aria-label', pullLabel);
      toolbarCloudPull.disabled = busy || !canPull;
      toolbarCloudPull.classList.toggle('is-cloud-active', canPull);
    }
    if (toolbarCloudPush) {
      const canPush = workspaceCloudCanPush();
      const pushLabel = t('workspaceCloudPush');
      toolbarCloudPush.title = pushLabel;
      toolbarCloudPush.setAttribute('aria-label', pushLabel);
      toolbarCloudPush.disabled = busy || !canPush;
      toolbarCloudPush.classList.toggle('is-cloud-active', canPush);
    }
    applyToolbarCloudCheck();
  }

  function applyToolbarCloudCheck() {
    if (!toolbarCloudCheck) {
      return;
    }
    const label = t('pageCloudCheck');
    toolbarCloudCheck.title = label;
    toolbarCloudCheck.setAttribute('aria-label', label);
    toolbarCloudCheck.hidden = !hasConfigChannel;
    toolbarCloudCheck.disabled = !hasConfigChannel || baseConfigBusy || pageCloudBusy;
  }

  function sendWorkspaceCheck() {
    if (!toolbarCloudCheck || toolbarCloudCheck.disabled || toolbarCloudCheck.hidden) {
      return;
    }
    if (baseConfigBusy || pageCloudBusy || !hasConfigChannel) {
      return;
    }
    pageCloudBusy = true;
    applyBaseConfigLoader();
    applyWorkspaceCloudButtons();
    vscode.postMessage({ type: 'pageCloud', action: 'check' });
  }

  /** @param {'push' | 'pull'} action */
  function sendWorkspaceCloud(action) {
    if (baseConfigBusy || pageCloudBusy) {
      return;
    }
    if (action === 'push' && !workspaceCloudCanPush()) {
      return;
    }
    if (action === 'pull' && !workspaceCloudCanPull()) {
      return;
    }
    const now = Date.now();
    if (now - baseSyncStamp < 400) {
      return;
    }
    baseSyncStamp = now;
    vscode.postMessage({ type: 'workspaceCloud', action });
    baseConfigBusy = true;
    applyBaseConfigLoader();
    applyWorkspaceCloudButtons();
    renderProjects(projectsList, activeProjectId, projectConfigSync);
    renderProfiles(
      Array.isArray(data?.profiles) ? data.profiles : undefined,
      typeof data?.activeProfileId === 'string' ? data.activeProfileId : undefined,
      data?.profileConfigSync,
    );
  }

  /** Ignore a second click on the same cloud button. */
  let baseSyncStamp = 0;

  function initWorkspaceCloudButtons() {
    if (toolbarCloudCheck && !toolbarCloudCheck.querySelector('.cloud-ico')) {
      toolbarCloudCheck.append(cloudSvgIcon('cloud-ico-reload', CLOUD_RELOAD_D));
      toolbarCloudCheck.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        sendWorkspaceCheck();
      });
    }
    if (toolbarCloudPull && !toolbarCloudPull.querySelector('.cloud-ico')) {
      toolbarCloudPull.append(cloudSvgIcon('cloud-ico-download', CLOUD_DOWNLOAD_D));
      toolbarCloudPull.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        sendWorkspaceCloud('pull');
      });
    }
    if (toolbarCloudPush && !toolbarCloudPush.querySelector('.cloud-ico')) {
      toolbarCloudPush.append(cloudSvgIcon('cloud-ico-upload', CLOUD_UPLOAD_D));
      toolbarCloudPush.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        sendWorkspaceCloud('push');
      });
    }
    applyWorkspaceCloudButtons();
  }

  function renderProjects(projects, activeId, _sync) {
    if (!toolbarProjectList) {
      return;
    }
    toolbarProjectList.replaceChildren();
    const list = Array.isArray(projects) ? projects : [];
    if (list.length === 0) {
      const hint = el('div', 'toolbar-profile-row toolbar-project-hint');
      hint.setAttribute('role', 'presentation');
      const hintText = el('span', 'profile-name');
      hintText.textContent = t('projectPickExisting');
      hint.append(hintText);
      toolbarProjectList.append(hint);
      const joinRow = el('div', 'toolbar-profile-row');
      joinRow.setAttribute('role', 'menuitem');
      const joinBtn = el('button', 'history-btn toolbar-project-join-btn');
      joinBtn.type = 'button';
      joinBtn.textContent = t('projectJoin');
      joinBtn.title = t('projectJoinTitle');
      joinBtn.setAttribute('aria-label', joinBtn.title);
      joinBtn.setAttribute('data-project-action', 'join');
      joinBtn.disabled = baseConfigBusy;
      joinRow.append(joinBtn);
      toolbarProjectList.append(joinRow);
      return;
    }
    for (const project of list) {
      const row = el('div', 'toolbar-profile-row' + (project.id === activeId ? ' is-active' : ''));
      row.setAttribute('role', 'menuitem');
      row.setAttribute('data-project-id', project.id);
      const name = el('span', 'profile-name');
      name.textContent = project.name;
      row.append(name);
      const actions = el('span', 'profile-actions');
      const editBtn = el('button', '');
      editBtn.type = 'button';
      editBtn.title = t('profileEdit');
      editBtn.setAttribute('aria-label', t('profileEdit'));
      editBtn.setAttribute('data-project-action', 'edit');
      editBtn.setAttribute('data-project-id', project.id);
      editBtn.textContent = '✎';
      actions.append(editBtn);
      row.append(actions);
      toolbarProjectList.append(row);
    }
  }

  function applyToolbarLock() {
    if (!toolbarLock) {
      return;
    }
    const lockedOut = !canToggleProjectLock;
    toolbarLock.disabled = lockedOut;
    const label = pagesFixed ? t('pagesUnfix') : t('pagesFix');
    toolbarLock.title = label;
    toolbarLock.setAttribute('aria-label', label);
    toolbarLock.setAttribute('aria-pressed', pagesFixed ? 'true' : 'false');
    toolbarLock.classList.toggle('is-fixed', pagesFixed);
    toolbarLock.classList.toggle('toolbar-lock-dirty', pagesFixed !== pagesFixedSent);
    const nextIcon = pagesFixed ? lockClosedIcon() : lockOpenIcon();
    nextIcon.setAttribute('viewBox', pagesFixed ? '2.5 1.75 13.5 13.5' : '2.75 1.75 13.5 13.5');
    toolbarLock.replaceChildren(nextIcon);
  }

  function syncToolbarLockBeforePager() {
    if (!toolbarLock) {
      return;
    }
    toolbarLock.classList.toggle('toolbar-lock-dirty', pagesFixed !== pagesFixedSent);
  }

  /** @param {string} name @param {string} [exceptId] */
  function isCreatableProfileName(name, exceptId) {
    const lower = name.toLocaleLowerCase();
    if (lower === 'админ' || lower === 'общий' || lower === 'general') {
      return false;
    }
    const rows = toolbarProfileList?.querySelectorAll('[data-profile-id]') || [];
    for (const row of rows) {
      if (!(row instanceof HTMLElement)) {
        continue;
      }
      if (exceptId && row.getAttribute('data-profile-id') === exceptId) {
        continue;
      }
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
   * @param {{ canPush?: boolean, canPull?: boolean } | undefined} sync
   */
  function renderProfiles(profiles, activeId, _sync) {
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
      const actions = el('span', 'profile-actions');
      const editBtn = el('button', '');
      editBtn.type = 'button';
      editBtn.title = t('profileEdit');
      editBtn.setAttribute('aria-label', t('profileEdit'));
      editBtn.setAttribute('data-profile-action', 'edit');
      editBtn.setAttribute('data-profile-id', profile.id);
      editBtn.textContent = '✎';
      actions.append(editBtn);
      if (profile.id !== 'general') {
        const deleteBtn = el('button', '');
        deleteBtn.type = 'button';
        deleteBtn.title = t('profileDelete');
        deleteBtn.setAttribute('aria-label', t('profileDelete'));
        deleteBtn.setAttribute('data-profile-action', 'delete');
        deleteBtn.setAttribute('data-profile-id', profile.id);
        deleteBtn.textContent = '×';
        actions.append(deleteBtn);
      }
      if (actions.childNodes.length > 0) {
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
      if (note) {
        return !!note.locked;
      }
      const link = (data?.links || []).find((item) => item.id === groupOrId);
      return !!link?.locked;
    }
    return !!groupOrId?.locked;
  }

  /** Top-level groups, root notes, and link layouts that can fold. */
  function collapsibleTopGroups() {
    const page = activePage();
    if (page?.kind === 'scenarios') {
      return pageScenarioMessages().filter((chip) => {
        if (chip.locked) {
          return false;
        }
        if (chip.isGroup) {
          return (chip.children || []).length > 0;
        }
        return !!(chip.md && chip.hasFile);
      });
    }
    if (isLinkMapKind(page?.kind)) {
      return (data?.links || []).filter(
        (link) =>
          !link.parent &&
          link.page === page.id &&
          !isLocked(link) &&
          (link.children || []).length > 0,
      );
    }
    const groups = pageGroups().filter(
      (group) => !group.parent && !isEmptyGroup(group) && !isLocked(group),
    );
    const notes = (data?.notes || []).filter(
      (note) => note.page === page?.id && !isLocked(note),
    );
    return [...groups, ...notes];
  }

  /** MR chips, root reviews, and plain messages whose thread can fold. */
  /** @param {string | undefined} pillLabel */
  function parsePillSeverityCounts(pillLabel) {
    if (!pillLabel) {
      return undefined;
    }
    const match = pillLabel.match(/H:\s*(\d+)\s*\|\s*M:\s*(\d+)\s*\|\s*[LS]:\s*(\d+)/i);
    if (!match) {
      return undefined;
    }
    return { H: Number(match[1]), M: Number(match[2]), L: Number(match[3]) };
  }

  /** @param {{ fixes?: { counts?: { H?: number, M?: number, L?: number }, bullets?: { H?: number[], M?: number[], L?: number[] }, at?: string } } | null | undefined} node */
  function reviewFixBullets(node) {
    const bullets = node && node.fixes && node.fixes.bullets;
    return {
      H: Array.isArray(bullets && bullets.H) ? bullets.H : [],
      M: Array.isArray(bullets && bullets.M) ? bullets.M : [],
      L: Array.isArray(bullets && bullets.L) ? bullets.L : [],
    };
  }

  /** @param {{ fixes?: { counts?: { H?: number, M?: number, L?: number } } } | null | undefined} node */
  function reviewHasFixes(node) {
    const counts = node && node.fixes && node.fixes.counts;
    if (!counts) {
      return false;
    }
    return (Number(counts.H) || 0) + (Number(counts.M) || 0) + (Number(counts.L) || 0) > 0;
  }

  /** @param {{ fixes?: { counts?: { H?: number, M?: number, L?: number } } } | null | undefined} node */
  function reviewFixLabel(node) {
    const bullets = reviewFixBullets(node);
    const parts = [];
    for (const letter of ['H', 'M', 'L']) {
      const nums = bullets[letter];
      if (nums.length) {
        parts.push(`${letter}:${nums.join(', ')}`);
      }
    }
    const items = parts.length ? parts.join(' | ') : '';
    const run = Number(node && node.fixN) || 0;
    if (items) {
      return run > 0 ? `${t('fixChip')} ${run} | ${items}` : items;
    }
    const counts = node && node.fixes && node.fixes.counts;
    if (!counts) {
      return '';
    }
    const h = Number(counts.H) || 0;
    const m = Number(counts.M) || 0;
    const l = Number(counts.L) || 0;
    const legacy = [];
    if (h) legacy.push(`H:${h}`);
    if (m) legacy.push(`M:${m}`);
    if (l) legacy.push(`L:${l}`);
    const legacyItems = legacy.join(' | ');
    if (run > 0 && legacyItems) {
      return `${t('fixChip')} ${run} | ${legacyItems}`;
    }
    if (run > 0) {
      return `${t('fixChip')} ${run}`;
    }
    return legacyItems;
  }

  /**
   * @param {{ H: number, M: number, L: number } | undefined} counts
   * @param {{ fixes?: { bullets?: { H?: number[], M?: number[], L?: number[] } } } | null | undefined} node
   */
  function remainingSeverityCounts(counts, node) {
    if (!counts) {
      return undefined;
    }
    const bullets = reviewFixBullets(node);
    return {
      H: Math.max(0, counts.H - bullets.H.length),
      M: Math.max(0, counts.M - bullets.M.length),
      L: Math.max(0, counts.L - bullets.L.length),
    };
  }

  function reviewMessageCanFold(msg) {
    if (!msg) {
      return false;
    }
    const pageId = activePage()?.id || '';
    if (activePendingNeurofixId(pageId) === msg.id) {
      return true;
    }
    if (
      (msg.isMr || msg.isReviewRoot) &&
      (activePendingReviewId(pageId) === msg.id || activePendingExplainId(pageId) === msg.id)
    ) {
      return true;
    }
    if (msg.isMr || msg.isReviewRoot) {
      return !!(
        msg.hasThread ||
        msg.threadId ||
        (msg.replies && msg.replies.length) ||
        reviewHasFixes(msg) ||
        levelNoteFiles(msg.rereviewNote).length > 0 ||
        levelNoteFiles(msg.studyNote).length > 0
      );
    }
    if (msg.isExplainRoot) {
      return !!(msg.hasThread || msg.threadId || (msg.replies && msg.replies.length));
    }
    return !!(
      (msg.replies && msg.replies.length) ||
      msg.repliesHasMore ||
      msg.repliesHasNewer
    );
  }

  function foldableReviewMessages() {
    const page = activePage();
    if (!page || page.kind !== 'review' || !reviewState || reviewState.pageId !== page.id) {
      return [];
    }
    if (reviewPaintEdge(page.id) === 'initial') {
      return [];
    }
    return (reviewState.messages || []).filter((msg) => reviewMessageCanFold(msg) && !msg.locked);
  }

  function allTopCollapsed() {
    if (activePage()?.kind === 'scenarios') {
      const items = collapsibleTopGroups();
      return items.length > 0 && items.every((chip) => isCollapsed(chip.id));
    }
    if (activePage()?.kind === 'review') {
      const items = foldableReviewMessages();
      return items.length > 0 && items.every((msg) => reviewCollapsed.has(msg.id));
    }
    const groups = collapsibleTopGroups();
    return groups.length > 0 && groups.every((group) => isCollapsed(group.id));
  }

  /** Create / View need a real map page, not Problems/Debug and not an empty workspace. */
  function canUseCreateViewToolbar() {
    if (isAuxPageOpen() || pageSkeletonKind() !== '') {
      return false;
    }
    return !!activePage();
  }

  function syncCreateViewToolbar() {
    const enabled = canUseCreateViewToolbar();
    if (toolbarCreate) {
      toolbarCreate.disabled = !enabled;
    }
    if (toolbarView) {
      toolbarView.disabled = !enabled;
    }
    if (!enabled) {
      closeToolbarCreateMenu();
      closeToolbarViewMenu();
    }
  }

  function syncToolbarView() {
    const kind = activePage()?.kind;
    const hide = !isAuxPageOpen() && (isLinkMapKind(kind) || kind === 'review' || kind === 'scenarios');
    if (toolbarViewWrap) {
      toolbarViewWrap.hidden = hide;
    }
    if (hide) {
      closeToolbarViewMenu();
    }
    syncCreateViewToolbar();
  }

  function setCollapseButton() {
    const review = activePage()?.kind === 'review';
    const groups = review ? foldableReviewMessages() : collapsibleTopGroups();
    const collapsed = allTopCollapsed();
    const mode = collapsed ? 'expand' : 'collapse';
    if (toolbarCollapse) {
      toolbarCollapse.disabled = groups.length === 0 || pageSkeletonKind() !== '';
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

  /** Expand even when locked — used while dragging a chip onto a folded card. */
  function expandForDrop(groupId) {
    if (!isCollapsed(groupId)) {
      return false;
    }
    const next = { ...pageCollapsed() };
    delete next[groupId];
    persistCollapsed(next);
    renderFromToggle = true;
    render();
    renderFromToggle = false;
    return true;
  }

  function clearExpandForDrop() {
    if (expandDropTimer) {
      clearTimeout(expandDropTimer);
    }
    expandDropTimer = 0;
    expandDropTargetId = null;
  }

  function scheduleExpandForDrop(groupId) {
    if (expandDropTargetId === groupId) {
      return;
    }
    clearExpandForDrop();
    if (!isCollapsed(groupId)) {
      return;
    }
    expandDropTargetId = groupId;
    expandDropTimer = setTimeout(() => {
      expandDropTimer = 0;
      expandDropTargetId = null;
      expandForDrop(groupId);
    }, EXPAND_DROP_MS);
  }

  function clearPendingGroupFold() {
    if (!pendingGroupFold) {
      return;
    }
    window.clearTimeout(pendingGroupFold.timer);
    pendingGroupFold = null;
  }

  /**
   * @param {string} groupId
   * @returns {boolean} true when the group actually folded
   */
  function applyGroupFold(groupId) {
    if (isLocked(groupId)) {
      const header = root.querySelector(
        'section.group[data-marker-id="' + CSS.escape(groupId) + '"] > .group-header',
      );
      if (header instanceof HTMLElement) {
        flashLock(groupId, header);
      }
      return false;
    }
    const group = data?.groups?.find((item) => item.id === groupId);
    if (!group || isEmptyGroup(group)) {
      return false;
    }
    toggleCollapsed(groupId);
    return true;
  }

  /** @param {{ id: string, at: number, timer: number, folded: boolean, held: boolean }} click */
  function finishPendingGroupFold(click) {
    if (pendingGroupFold !== click) {
      return;
    }
    click.folded = applyGroupFold(click.id);
    const rest = GROUP_DOUBLE_MS - (Date.now() - click.at);
    click.timer = window.setTimeout(() => {
      if (pendingGroupFold === click) {
        pendingGroupFold = null;
      }
    }, Math.max(0, rest));
  }

  /**
   * Second press started. Stop the fold so the header is still here for pointerup.
   * @param {string} groupId
   */
  function holdGroupClick(groupId) {
    const pending = pendingGroupFold;
    if (!pending || pending.id !== groupId || pending.held) {
      return;
    }
    if (Date.now() - pending.at >= GROUP_DOUBLE_MS) {
      return;
    }
    window.clearTimeout(pending.timer);
    pending.held = true;
    const rest = GROUP_DOUBLE_MS - (Date.now() - pending.at);
    pending.timer = window.setTimeout(() => {
      if (pendingGroupFold !== pending) {
        return;
      }
      if (!pending.folded) {
        pending.folded = applyGroupFold(pending.id);
      }
      pendingGroupFold = null;
    }, Math.max(0, rest));
  }

  /** @param {string} groupId */
  function scheduleGroupFold(groupId) {
    const now = Date.now();
    const pending = pendingGroupFold;
    if (pending && pending.id === groupId && now - pending.at < GROUP_DOUBLE_MS) {
      const undo = pending.folded;
      clearPendingGroupFold();
      if (undo) {
        toggleCollapsed(groupId);
      }
      openGroupSettingsPanel({ mode: 'edit', markerId: groupId });
      return;
    }
    clearPendingGroupFold();
    const click = { id: groupId, at: now, timer: 0, folded: false, held: false };
    pendingGroupFold = click;
    click.timer = window.setTimeout(() => finishPendingGroupFold(click), GROUP_CLICK_MS);
  }

  /** Keep a just-applied fold when a stale focus snapshot arrives. */
  function reconcileGroupFoldSync() {
    const hold = groupFoldSync;
    if (!hold) {
      return;
    }
    if (Date.now() > hold.until) {
      groupFoldSync = null;
      return;
    }
    const page = pages().find((item) => item.id === hold.pageId);
    if (!page) {
      return;
    }
    const collapsed = { ...(page.collapsed || {}) };
    if (!!collapsed[hold.id] === hold.on) {
      groupFoldSync = null;
      return;
    }
    if (hold.on) {
      collapsed[hold.id] = true;
    } else {
      delete collapsed[hold.id];
    }
    page.collapsed = collapsed;
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
    const page = activePage();
    if (page) {
      groupFoldSync = {
        pageId: page.id,
        id: groupId,
        on: !!next[groupId],
        until: Date.now() + 1200,
      };
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

  /** @param {{ fontGroup?: number, fontSubgroup?: number, fontFolder?: number, fontFile?: number, fontReview?: number, fontScale?: number, gradientDirection?: number, cardGradient?: boolean, cardFill?: number, cardBorder?: number, bgFolder?: number, bgFile?: number, bgSubgroup?: number, bgClass?: number, bgNote?: number, bgHover?: number, openFileMark?: boolean, showErrorIcon?: boolean, openFileAnimate?: boolean, openFileDuration?: number, showProblemsTab?: boolean, cyclePageScroll?: boolean, problemsError?: boolean, problemsWarning?: boolean, problemsInfo?: boolean } | undefined} appearance */
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
    setSize('--size-review', a.fontReview, 1);
    const reviewSize = typeof a.fontReview === 'number' ? a.fontReview : 1;
    for (const grow of [reviewFileGrow, explainFileGrow]) {
      if (!grow) {
        continue;
      }
      grow.disabled = reviewSize >= 1.999;
      grow.title = t('reviewFileGrow');
      grow.setAttribute('aria-label', t('reviewFileGrow'));
    }
    for (const shrink of [reviewFileShrink, explainFileShrink]) {
      if (!shrink) {
        continue;
      }
      shrink.disabled = reviewSize <= 0.601;
      shrink.title = t('reviewFileShrink');
      shrink.setAttribute('aria-label', t('reviewFileShrink'));
    }
    for (const save of [reviewFileSave, explainFileSave]) {
      if (!save) {
        continue;
      }
      save.title = t('reviewFileSave');
      save.setAttribute('aria-label', t('reviewFileSave'));
    }
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

  /** Error glyph is its own toggle. Blink uses the same switch and duration as the corner. */
  function errorIconMode() {
    const a = data?.appearance || {};
    return {
      show: a.showErrorIcon !== false,
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
    if (
      branchDepthMenu &&
      target &&
      !branchDepthMenu.contains(target) &&
      !(target instanceof Element && target.closest('#host-branch-panel'))
    ) {
      clearBranchDepthMenu();
    }
    const inProblem = !!(target && problemPanel.contains(target));
    const onProblemAnchor = !!(
      target &&
      problemPanelState &&
      problemPanelState.anchor.contains(target)
    );
    if (problemPanelState && !inProblem && !onProblemAnchor) {
      closeProblemPanel();
    }
    if (!dirPopoverState) {
      return;
    }
    if (
      target &&
      (dirPopover.contains(target) || dirPopoverState.anchor.contains(target) || inProblem)
    ) {
      return;
    }
    closeDirPopover();
  });

  /**
   * Working card on press-release (capture). Header fold runs on the same
   * pointerup and re-renders before a click would fire, so click is too late.
   * Local data.focus is updated first so the fold re-paint already shows is-working.
   * Note text waits out the double-click window instead — see noteClickGesture.
   */
  document.addEventListener(
    'pointerup',
    (event) => {
      if (event.button !== 0 || document.body.classList.contains('is-dragging')) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (deferNoteTextFocus(event)) {
        return;
      }
      if (target.closest('.item') || target.closest('.dot')) {
        return;
      }
      const section = target.closest('section.group');
      if (!(section instanceof HTMLElement)) {
        return;
      }
      const noteId = section.dataset.noteId;
      const markerId = section.dataset.markerId;
      if (noteId) {
        if (data) {
          data.focus = { kind: 'note', id: noteId };
        }
        vscode.postMessage({ type: 'setFocus', kind: 'note', id: noteId });
      } else if (markerId) {
        if (data) {
          data.focus = { kind: 'marker', id: markerId };
        }
        vscode.postMessage({ type: 'setFocus', kind: 'marker', id: markerId });
      }
    },
    true,
  );

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    closeToolbarMenus();
    if (dirPopoverState) {
      closeDirPopover();
    }
    if (problemPanelState) {
      closeProblemPanel();
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
    if (problemPanelState) {
      positionProblemPanel();
    }
  });

  document.addEventListener(
    'scroll',
    (event) => {
      const target = /** @type {Node | null} */ (event.target);
      if (target && problemPanel.contains(target)) {
        return;
      }
      if (problemPanelState) {
        closeProblemPanel();
      }
      if (!dirPopoverState) {
        return;
      }
      if (target && dirPopover.contains(target)) {
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

  /** Body in `data` belongs to the page on screen. Other pages arrive with the next state. */
  function pageContentReady() {
    if (isAuxPageOpen()) {
      return true;
    }
    const page = activePage();
    // Scenarios paint their own empty/loading UI — do not park on is-page-loading.
    if (page?.kind === 'scenarios') {
      return true;
    }
    return !!page && data.contentPageId === page.id;
  }

  /** files / notes / links with no cached body. Review keeps the dimmed wait. */
  function pageSkeletonKind() {
    if (!data || isAuxPageOpen() || pageContentReady()) {
      return '';
    }
    const page = activePage();
    if (!page || page.kind === 'review' || page.kind === 'scenarios') {
      return '';
    }
    if (page.kind === 'notes') {
      return page.kind;
    }
    if (isLinkMapKind(page.kind)) {
      return 'links';
    }
    return 'files';
  }

  function clearPageSkeletonMark() {
    delete root.dataset.skeletonKind;
    delete root.dataset.skeletonPageId;
  }

  /** Content buttons wait. More-menu and profile stay. Leave only via another chip. */
  function syncPageLoadingChrome() {
    const locked = pageSkeletonKind() !== '';
    if (locked) {
      closeToolbarViewMenu();
      closeToolbarCreateMenu();
      closeFormatMenu();
      if (toolbarPanelsMenu) {
        toolbarPanelsMenu.hidden = true;
      }
      toolbarPanels?.setAttribute('aria-expanded', 'false');
    }
    const contentButtons = [
      toolbarCollapse,
      toolbarFormat,
      toolbarReviewTab,
      toolbarPanels,
      panelToggleBottom,
      panelToggleLeft,
      panelToggleRight,
    ];
    if (locked) {
      for (const button of contentButtons) {
        if (button) {
          button.disabled = true;
        }
      }
      if (toolbarView) {
        toolbarView.disabled = true;
      }
      if (toolbarCreate) {
        toolbarCreate.disabled = true;
      }
      if (historyBack) {
        historyBack.disabled = true;
      }
      if (historyForward) {
        historyForward.disabled = true;
      }
      if (historyAccept) {
        historyAccept.disabled = true;
      }
    } else {
      for (const button of contentButtons) {
        if (button && button !== toolbarCollapse) {
          button.disabled = false;
        }
      }
      syncCreateViewToolbar();
      setHistoryButtons(data && data.history);
      setCollapseButton();
    }
    if (!pager) {
      return;
    }
    for (const node of pager.querySelectorAll('.pager-chip')) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const current =
        node.classList.contains('active') &&
        !node.classList.contains('problems-tab') &&
        !node.classList.contains('debug-tab');
      if (node.dataset.pageId) {
        node.draggable = !locked;
      }
      node.classList.toggle('is-load-locked', locked && current);
    }
  }

  /**
   * @param {() => void} paint
   * @param {number} direction
   */
  function commitPagePaint(paint, direction) {
    /** @type {HTMLElement | null} */
    let leaving = null;
    let oldHeight = 0;
    const stage = root.parentElement;
    const restoredScroll = preservingPageScroll(() => {
      cancelSlide();
      if (canSlide(direction) && stage) {
        oldHeight = root.offsetHeight;
        stage.style.height = oldHeight + 'px';
        leaving = /** @type {HTMLElement} */ (root.cloneNode(true));
        leaving.removeAttribute('id');
        leaving.classList.add('page-leaving');
        leaving.setAttribute('aria-hidden', 'true');
        leaving.inert = true;
        stage.append(leaving);
      }
      paint();
      if (leaving && stage) {
        stage.classList.add('is-sliding');
        stage.style.height = Math.max(oldHeight, root.offsetHeight) + 'px';
      }
    });

    if (!leaving || !stage) {
      return;
    }

    const token = ++pageSlideToken;
    isSliding = true;
    const enterFrom = direction > 0 ? '100%' : '-100%';
    const leaveTo = direction > 0 ? '-100%' : '100%';
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
      if (reviewPinEnd) {
        reviewPinEnd = false;
        animateReviewListToEnd(++reviewScrollAnim);
      } else if (entityAlignPending() && !isFolding) {
        applyEntityFlash(true);
      } else if (!entityAlignPending()) {
        applyDocScroll(restoredScroll);
      }
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

  function render() {
    if (!data) {
      return;
    }
    if (!activePage() && !isAuxPageOpen()) {
      paintNoPage();
      syncPageLoadingChrome();
      return;
    }
    const skeletonKind = pageSkeletonKind();
    if (!pageContentReady() && !skeletonKind) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && root.contains(active)) {
        active.blur();
      }
      root.classList.add('is-page-loading');
      root.setAttribute('aria-busy', 'true');
      syncPageLoadingChrome();
      return;
    }
    if (skeletonKind) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && root.contains(active)) {
        active.blur();
      }
      const direction = consumeSlideDirection();
      const page = activePage();
      const sameSkeleton =
        root.classList.contains('is-page-skeleton') &&
        root.dataset.skeletonKind === skeletonKind &&
        root.dataset.skeletonPageId === page?.id;
      if (sameSkeleton && direction === 0) {
        syncPageLoadingChrome();
        return;
      }
      root.classList.remove('is-page-loading');
      commitPagePaint(() => paintPageSkeleton(skeletonKind), direction);
      syncPageLoadingChrome();
      return;
    }

    const arrivedOnSkeleton =
      root.classList.contains('is-page-skeleton') &&
      root.dataset.skeletonPageId === activePage()?.id;
    root.classList.remove('is-page-loading');
    root.removeAttribute('aria-busy');
    if (arrivedOnSkeleton) {
      pendingSlide = 0;
      preservingPageScroll(() => {
        cancelSlide();
        clearPageSkeletonMark();
        paintPage();
      });
      syncPageLoadingChrome();
      return;
    }

    clearPageSkeletonMark();
    const direction = consumeSlideDirection();
    if (isSliding && direction === 0) {
      renderDeferred = true;
      setCollapseButton();
      syncPageLoadingChrome();
      return;
    }
    if (isFolding && direction === 0 && !renderFromToggle) {
      renderDeferred = true;
      setCollapseButton();
      syncPageLoadingChrome();
      return;
    }
    renderDeferred = false;
    commitPagePaint(paintPage, direction);
    syncPageLoadingChrome();
  }

  /**
   * @param {string} width
   * @param {number} delayMs
   */
  function pageSkelBar(width, delayMs) {
    const bar = el('span', 'page-skel-bar');
    if (width) {
      bar.style.width = width;
    }
    bar.style.animationDelay = delayMs + 'ms';
    return bar;
  }

  /** Drop the previous project's map when this project has no pages. */
  function paintNoPage() {
    closeContextMenu();
    dismissLinkPreview();
    closeGroupPanel(true);
    openLinkPanelId = null;
    cancelSlide();
    isFolding = false;
    renderDeferred = false;
    clearPageSkeletonMark();
    root.classList.remove('is-page-loading', 'is-page-skeleton');
    root.removeAttribute('aria-busy');
    root.textContent = '';
    root.removeAttribute('data-syn3-context');
    root.className = 'map-page';
    clearDropHighlights();
  }

  /** @param {'files' | 'notes' | 'links' | 'scenarios'} kind */
  function paintPageSkeleton(kind) {
    closeContextMenu();
    dismissLinkPreview();
    closeGroupPanel(false);
    openLinkPanelId = null;
    const page = activePage();
    root.textContent = '';
    root.removeAttribute('data-syn3-context');
    root.className =
      'map-page is-page-skeleton' +
      (kind === 'links' || kind === 'scenarios' ? ' links-page scenarios-page' : '');
    root.dataset.skeletonKind = kind;
    root.dataset.skeletonPageId = page ? page.id : '';
    root.setAttribute('aria-busy', 'true');
    clearDropHighlights();
    if (kind === 'links' || kind === 'scenarios') {
      paintLinksSkeleton();
      return;
    }
    if (kind === 'notes') {
      paintNotesSkeleton();
      return;
    }
    paintFilesSkeleton();
  }

  function paintFilesSkeleton() {
    const widths = ['180px', '140px', '100px'];
    let delay = 0;
    for (let groupIndex = 0; groupIndex < 3; groupIndex += 1) {
      const group = el('section', 'page-skel-group');
      group.setAttribute('aria-hidden', 'true');
      group.append(pageSkelBar('120px', delay));
      delay += 40;
      const files = el('div', 'page-skel-files');
      for (const width of widths) {
        files.append(pageSkelBar(width, delay));
        delay += 40;
      }
      group.append(files);
      root.append(group);
    }
  }

  function paintNotesSkeleton() {
    for (let noteIndex = 0; noteIndex < 3; noteIndex += 1) {
      const note = el('section', 'page-skel-note');
      note.setAttribute('aria-hidden', 'true');
      const long = pageSkelBar('', noteIndex * 80);
      long.classList.add('is-long');
      const half = pageSkelBar('', noteIndex * 80 + 40);
      half.classList.add('is-half');
      note.append(long, half);
      root.append(note);
    }
  }

  /** Distinct root hues from the link palette, shuffled. */
  function pageSkelParentColors(count) {
    const columns = Array.isArray(data?.linkPalette) ? data.linkPalette : [];
    /** @type {string[]} */
    const hues = [];
    for (const column of columns) {
      const tone = Array.isArray(column.tones) ? column.tones[0] : '';
      if (tone) {
        hues.push(String(tone));
      }
    }
    if (hues.length < count) {
      hues.push('#d65156', '#f46d34', '#52be37', '#37beb0', '#5173d6', '#9760c7', '#d651b3');
    }
    for (let i = hues.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = hues[i];
      hues[i] = hues[j];
      hues[j] = swap;
    }
    return hues.slice(0, count);
  }

  /**
   * @param {{ depth: number, layout: boolean, leadingGap: boolean, width: string, delay: number, color: string, nextColor: string, children: number }} opts
   */
  function pageSkelLinkNode(opts) {
    const row = el(
      'div',
      'link-node depth-' +
        opts.depth +
        (opts.leadingGap ? ' has-gap' : '') +
        (opts.layout ? ' is-layout' : ' is-component'),
    );
    row.style.setProperty('--link-color', opts.color);
    const half = linkChipHalf(opts.depth);
    row.append(linkElbow((opts.leadingGap ? LINK_ROW_GAP : 0) + half, opts.nextColor));
    const body = el('div', 'link-body');
    const chipWrap = el('div', 'link-chip-wrap');
    const chip = el('span', 'link-chip');
    chip.append(pageSkelBar(opts.width, opts.delay));
    chipWrap.append(chip);
    body.append(chipWrap);
    if (opts.children > 0) {
      const kids = el('div', 'link-children');
      const clip = el('div', 'link-children-clip');
      const slide = el('div', 'link-children-slide');
      for (let child = 0; child < opts.children; child += 1) {
        slide.append(
          pageSkelLinkNode({
            depth: opts.depth + 1,
            layout: false,
            leadingGap: true,
            width: '100px',
            delay: opts.delay + 40 + child * 40,
            color: opts.color,
            nextColor: child < opts.children - 1 ? opts.color : '',
            children: 0,
          }),
        );
      }
      clip.append(slide);
      kids.append(clip);
      body.append(kids);
    }
    row.append(body);
    return row;
  }

  function paintLinksSkeleton() {
    const colors = pageSkelParentColors(3);
    const tree = el('div', 'links-tree page-skel');
    tree.setAttribute('aria-hidden', 'true');
    for (let parent = 0; parent < 3; parent += 1) {
      tree.append(
        pageSkelLinkNode({
          depth: 0,
          layout: true,
          leadingGap: parent > 0,
          width: '150px',
          delay: parent * 90,
          color: colors[parent] || '#6e6e6e',
          nextColor: parent < 2 ? colors[parent + 1] || '' : '',
          children: 3,
        }),
      );
    }
    root.append(tree);
  }

  /** @type {{ id: string, targetId: string, mode: 'place' | 'nest', position?: 'before' | 'after' } | null} */
  let pendingLinkDrop = null;
  /** @type {{ kind: 'row', row: HTMLElement, edge: 'before' | 'after' | 'into' } | { kind: 'tail', tail: HTMLElement } | null} */
  let linkCue = null;
  /** @type {HTMLElement | null} */
  let linkDropSlotEl = null;
  /** @type {string | null} */
  let openLinkPanelId = null;
  /** Focus the name field once, when the link chip panel is opened. */
  let focusLinkNameOnOpen = false;

  const MAX_GROUP_DESCRIPTION_LENGTH = 144;
  const MAX_GROUP_DESCRIPTION_LINES = 3;

  /**
   * Clip group description for live typing: newlines, three lines, 144 chars.
   * Does not trim — empty clear happens on save.
   * @param {string} value
   */
  function clipGroupDescriptionInput(value) {
    const normalized = String(value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const lines = normalized.split('\n').slice(0, MAX_GROUP_DESCRIPTION_LINES);
    return lines.join('\n').slice(0, MAX_GROUP_DESCRIPTION_LENGTH);
  }

  /**
   * In-map group settings / create draft.
   * `color`: undefined = untouched (random on create), null = no color, string = hex.
   * @type {{
   *   mode: 'create' | 'edit',
   *   markerId?: string,
   *   parentId?: string,
   *   pageId?: string,
   *   requestId?: string,
   *   label: string,
   *   alias: string,
   *   description: string,
   *   locked: boolean,
   *   color: string | null | undefined,
   *   colorTouched: boolean,
   *   columns: 'flow' | '1' | '2' | '3',
   * } | null}
   */
  let openGroupPanel = null;
  /** Focus the name field once when the group panel opens. */
  let focusGroupNameOnOpen = false;

  /**
   * Shared color picker panel.
   * @type {{
   *   kind: 'marker' | 'note' | 'link' | 'text' | 'group-draft' | 'review',
   *   id?: string,
   *   pageId?: string,
   *   currentHex: string,
   *   rgb: string,
   *   alpha: number,
   *   allowNone: boolean,
   *   noneDisabled?: boolean,
   *   locked?: boolean,
   * } | null}
   */
  let openColorPanel = null;
  /** Alpha percent (0–100) to bake into the system color picker result. */
  let pendingPickerAlpha = 100;

  function pageLinks() {
    const pageId = activePage()?.id;
    return (data?.links || []).filter((link) => link.page === pageId || pageOfLink(link) === pageId);
  }

  /** @param {*} link */
  function pageOfLink(link) {
    if (link.page) {
      return link.page;
    }
    let current = link;
    const byId = Object.fromEntries((data?.links || []).map((item) => [item.id, item]));
    const seen = new Set();
    while (current && current.parent && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId[current.parent];
    }
    return current?.page;
  }

  function removeLinkPanelBackdrop() {
    document.querySelectorAll('.link-panel-backdrop').forEach((node) => {
      if (node.classList.contains('group-panel-backdrop')) {
        return;
      }
      node.remove();
    });
  }

  /** Tree shape aside from folded flags. A collapse must not rebuild the chips. */
  let linksStructureKey = '';

  /** @param {Array<*>} links */
  function linkStructureKey(links) {
    return links
      .map((link) =>
        [
          link.id,
          link.parent || '',
          link.order ?? '',
          link.label || '',
          link.color || '',
          link.colorId || '',
          link.url || '',
          link.description || '',
          link.locked ? 1 : 0,
          link.depth || 0,
          link.canDelete ? 1 : 0,
          link.lastRoot ? 1 : 0,
          (link.children || []).join(','),
        ].join('\u001f'),
      )
      .join('\u001e');
  }

  /** Fold flags only: the chip under the pointer stays mounted, so its fill does not restart. */
  function syncLinkCollapsed() {
    root.querySelectorAll('.link-node').forEach((node) => {
      if (!(node instanceof HTMLElement) || !node.dataset.linkId) {
        return;
      }
      const collapsed = isCollapsed(node.dataset.linkId);
      node.classList.toggle('is-collapsed', collapsed);
      const tri = node.querySelector(
        ':scope > .link-body > .link-chip-wrap > .link-chip > .link-chip-tri',
      );
      if (tri) {
        tri.classList.toggle('is-collapsed', collapsed);
      }
    });
  }

  function closeLinkPanel() {
    const backdrop = document.querySelector('.link-panel-backdrop');
    const active = document.activeElement;
    if (
      backdrop instanceof HTMLElement &&
      active instanceof HTMLElement &&
      backdrop.contains(active)
    ) {
      active.blur();
    }
    if (!openLinkPanelId) {
      return;
    }
    openLinkPanelId = null;
    paintLinksPage();
  }

  document.addEventListener(
    'keydown',
    (event) => {
      if (reviewFileView && event.key === 'Escape' && !openColorPanel) {
        event.preventDefault();
        event.stopPropagation();
        closeReviewFileView();
        return;
      }
      if (explainFileView && event.key === 'Escape' && !openColorPanel) {
        event.preventDefault();
        event.stopPropagation();
        closeExplainFileView();
        return;
      }
      if (openColorPanel && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeColorPanel();
        return;
      }
      if (openGroupPanel) {
        const isEsc = event.key === 'Escape';
        const isEnter = event.key === 'Enter';
        if (!isEsc && !isEnter) {
          return;
        }
        const backdrop = document.querySelector('.group-panel-backdrop');
        const inside =
          backdrop instanceof HTMLElement &&
          event.target instanceof Node &&
          backdrop.contains(event.target);
        if (isEnter) {
          if (!inside || event.target instanceof HTMLTextAreaElement) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (openGroupPanel.mode === 'create') {
            const nameInput = backdrop?.querySelector(
              '.link-panel-name-row input.link-panel-input',
            );
            const aliasInput = backdrop?.querySelector(
              'input.link-panel-input[data-group-field="alias"]',
            );
            const descInput = backdrop?.querySelector(
              'textarea.link-panel-input[data-group-field="description"]',
            );
            if (nameInput instanceof HTMLInputElement) {
              openGroupPanel.label = nameInput.value;
            }
            if (aliasInput instanceof HTMLInputElement) {
              openGroupPanel.alias = aliasInput.value;
            }
            if (descInput instanceof HTMLTextAreaElement) {
              openGroupPanel.description = clipGroupDescriptionInput(descInput.value);
            }
            commitGroupDraft();
          } else {
            closeGroupPanel(false);
          }
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        closeGroupPanel(true);
        return;
      }
      if (!openLinkPanelId) {
        return;
      }
      const isEsc = event.key === 'Escape';
      const isEnter = event.key === 'Enter';
      if (!isEsc && !isEnter) {
        return;
      }
      const backdrop = document.querySelector('.link-panel-backdrop:not(.group-panel-backdrop)');
      const inside =
        backdrop instanceof HTMLElement &&
        event.target instanceof Node &&
        backdrop.contains(event.target);
      if (isEnter && (!inside || event.target instanceof HTMLTextAreaElement)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeLinkPanel();
    },
    true,
  );

  /** @param {Array<*>} links */
  function mountLinkPanel(links) {
    const byId = Object.fromEntries(links.map((link) => [link.id, link]));
    const existing = document.querySelector('.link-panel-backdrop');
    if (!openLinkPanelId || !byId[openLinkPanelId]) {
      if (openLinkPanelId && !byId[openLinkPanelId]) {
        openLinkPanelId = null;
      }
      focusLinkNameOnOpen = false;
      existing?.remove();
      return;
    }
    if (existing instanceof HTMLElement && existing.dataset.linkId === openLinkPanelId) {
      if (focusLinkNameOnOpen) {
        focusLinkNameOnOpen = false;
        focusLinkPanelName(existing);
      }
      return;
    }
    existing?.remove();
    const backdrop = el('div', 'link-panel-backdrop');
    backdrop.dataset.linkId = openLinkPanelId;
    let pressedBackdrop = false;
    backdrop.addEventListener('mousedown', (event) => {
      pressedBackdrop = event.target === backdrop;
    });
    backdrop.addEventListener('click', (event) => {
      if (pressedBackdrop && event.target === backdrop) {
        openLinkPanelId = null;
        paintLinksPage();
      }
    });
    backdrop.append(renderLinkPanel(byId[openLinkPanelId]));
    document.body.append(backdrop);
    if (focusLinkNameOnOpen) {
      focusLinkNameOnOpen = false;
      focusLinkPanelName(backdrop);
    }
  }

  /** Put the caret in the chip name («Ваш макет») and select it for immediate rename. */
  function focusLinkPanelName(rootEl) {
    const nameInput = rootEl.querySelector('.link-panel-name-row input.link-panel-input');
    if (!(nameInput instanceof HTMLInputElement) || nameInput.disabled) {
      return;
    }
    const apply = () => {
      if (!nameInput.isConnected || nameInput.disabled) {
        return;
      }
      nameInput.focus();
      nameInput.select();
    };
    apply();
    requestAnimationFrame(apply);
  }

  function removeColorPanelBackdrop() {
    document.querySelectorAll('.color-panel-backdrop').forEach((node) => node.remove());
  }

  function closeColorPanel() {
    if (!openColorPanel) {
      removeColorPanelBackdrop();
      return;
    }
    openColorPanel = null;
    removeColorPanelBackdrop();
  }

  /**
   * @param {{
   *   kind: 'marker' | 'note' | 'link' | 'text' | 'group-draft' | 'review',
   *   id?: string,
   *   pageId?: string,
   *   currentHex?: string,
   *   allowNone?: boolean,
   *   noneDisabled?: boolean,
   *   locked?: boolean,
   * }} opts
   */
  function openColorsPanel(opts) {
    const currentHex = (opts.currentHex || '').toLowerCase();
    const stored = currentHex.startsWith('#') ? currentHex : '';
    const parsed = splitHexAlpha(stored);
    openColorPanel = {
      kind: opts.kind,
      id: opts.id,
      pageId: opts.pageId,
      currentHex: parsed ? hexWithAlpha(parsed.rgb, parsed.alpha) : stored || (currentHex ? currentHex : ''),
      rgb: parsed?.rgb || '',
      alpha: parsed?.alpha ?? 100,
      allowNone: opts.allowNone !== false,
      noneDisabled: !!opts.noneDisabled,
      locked: !!opts.locked,
    };
    mountColorPanel();
  }

  /**
   * @param {string | null | undefined} value
   * @param {boolean} [closePanel]
   */
  function applyColorPanelChoice(value, closePanel = true) {
    const target = openColorPanel;
    if (!target || target.locked) {
      return;
    }
    const finish = () => {
      if (closePanel) {
        closeColorPanel();
      }
    };
    if (target.kind === 'group-draft' && openGroupPanel?.mode === 'create') {
      openGroupPanel.colorTouched = true;
      openGroupPanel.color = value;
      finish();
      mountGroupPanel();
      return;
    }
    if (target.kind === 'text') {
      if (value) {
        applyTextColor(value);
      }
      finish();
      return;
    }
    if (target.kind === 'link' && target.id) {
      if (!value) {
        finish();
        return;
      }
      vscode.postMessage({ type: 'updateLink', linkId: target.id, color: value });
      finish();
      return;
    }
    if (target.kind === 'marker' && target.id) {
      vscode.postMessage(
        value
          ? { type: 'setColor', markerId: target.id, color: value }
          : { type: 'setColor', markerId: target.id, clear: true },
      );
      finish();
      return;
    }
    if (target.kind === 'note' && target.id) {
      vscode.postMessage(
        value
          ? { type: 'setColor', noteId: target.id, color: value }
          : { type: 'setColor', noteId: target.id, clear: true },
      );
      finish();
      return;
    }
    if (target.kind === 'review' && target.id && target.pageId && value) {
      vscode.postMessage({
        type: 'reviewUpdateMr',
        pageId: target.pageId,
        messageId: target.id,
        color: value,
      });
      finish();
      return;
    }
    if (target.kind === 'scenario-group' && target.id && value) {
      const pageId = activePage()?.id;
      if (pageId) {
        vscode.postMessage({
          type: 'scenarioUpdateGroup',
          pageId,
          groupId: target.id,
          color: value,
        });
      }
      finish();
      return;
    }
    finish();
  }

  function openSystemColorPickerForPanel() {
    const target = openColorPanel;
    if (!target || target.locked) {
      return;
    }
    const rect = document.querySelector('.color-panel')?.getBoundingClientRect();
    if (rect) {
      colorInput.style.left = rect.left + 'px';
      colorInput.style.top = rect.bottom + 'px';
    }
    pendingPickerAlpha = target.alpha;
    colorInput.value = /^#[0-9a-f]{6}$/.test(target.rgb) ? target.rgb : '#8b8d98';
    if (target.kind === 'text') {
      colorTarget = { kind: 'text' };
    } else if (target.kind === 'group-draft') {
      colorTarget = { kind: 'group-draft' };
    } else if (target.kind === 'note' && target.id) {
      colorTarget = { kind: 'note', id: target.id };
    } else if (target.kind === 'link' && target.id) {
      colorTarget = { kind: 'link', id: target.id };
    } else if (target.kind === 'marker' && target.id) {
      colorTarget = { kind: 'marker', id: target.id };
    } else if (target.kind === 'review' && target.id && target.pageId) {
      colorTarget = { kind: 'review', id: target.id, pageId: target.pageId };
    } else {
      return;
    }
    closeColorPanel();
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
   * @param {string | null | undefined} value
   * @returns {{ rgb: string, alpha: number } | null}
   */
  function splitHexAlpha(value) {
    const raw = String(value || '').trim().toLowerCase();
    const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(raw);
    if (!match) {
      return null;
    }
    let digits = match[1];
    if (digits.length <= 4) {
      digits = [...digits].map((ch) => ch + ch).join('');
    }
    const rgb = '#' + digits.slice(0, 6);
    const alpha =
      digits.length === 8 ? Math.round((parseInt(digits.slice(6), 16) / 255) * 100) : 100;
    return { rgb, alpha };
  }

  /**
   * Opaque `#rrggbb`, or `#rrggbbaa` when alpha is below 100.
   * @param {string} rgb
   * @param {number} alphaPercent
   */
  function hexWithAlpha(rgb, alphaPercent) {
    const parsed = splitHexAlpha(rgb);
    const base = parsed ? parsed.rgb : '';
    if (!base) {
      return String(rgb || '');
    }
    const alpha = Math.max(0, Math.min(100, Math.round(Number(alphaPercent) || 0)));
    if (alpha >= 100) {
      return base;
    }
    const byte = Math.round((alpha / 100) * 255);
    return base + byte.toString(16).padStart(2, '0');
  }

  /**
   * @param {string} hex
   * @param {number} alphaPercent
   */
  function pickerHex(hex, alphaPercent) {
    const parsed = splitHexAlpha(hex);
    return hexWithAlpha(parsed ? parsed.rgb : hex, alphaPercent);
  }

  /** @param {any[]} columns */
  function paletteBands(columns) {
    /** @type {Map<number, any[]>} */
    const bands = new Map();
    for (const column of columns) {
      const row = column && Number.isInteger(column.row) ? column.row : 0;
      const list = bands.get(row);
      if (list) {
        list.push(column);
      } else {
        bands.set(row, [column]);
      }
    }
    return [...bands.keys()].sort((a, b) => a - b).map((row) => bands.get(row) || []);
  }

  /**
   * @param {HTMLElement} panel
   * @param {{ rgb: string, alpha: number }} target
   */
  function paintColorAlpha(panel, target) {
    const color = target.rgb || '#8b8d98';
    panel.querySelectorAll('.link-color-swatch').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const hex = node.dataset.hex || color;
      node.style.setProperty('--swatch', hexWithAlpha(hex, target.alpha));
    });
    const range = panel.querySelector('.color-panel-alpha-range');
    if (range instanceof HTMLElement) {
      range.style.setProperty('--alpha-color', color);
    }
  }

  function mountColorPanel() {
    removeColorPanelBackdrop();
    if (!openColorPanel) {
      return;
    }
    const target = openColorPanel;
    const backdrop = el('div', 'color-panel-backdrop');
    let pressedBackdrop = false;
    backdrop.addEventListener('mousedown', (event) => {
      pressedBackdrop = event.target === backdrop;
    });
    backdrop.addEventListener('click', (event) => {
      if (pressedBackdrop && event.target === backdrop) {
        closeColorPanel();
      }
    });
    const panel = el('aside', 'color-panel');
    const title = el('div', 'color-panel-title', t('colorsTitle'));
    panel.append(title);

    if (target.allowNone) {
      const noneBtn = el(
        'button',
        'color-panel-none' + (!target.currentHex ? ' is-active' : ''),
      );
      noneBtn.type = 'button';
      noneBtn.disabled = !!target.locked || !!target.noneDisabled;
      noneBtn.append(el('span', 'color-panel-none-swatch'), document.createTextNode(t('noColor')));
      noneBtn.addEventListener('click', () => {
        if (!noneBtn.disabled) {
          applyColorPanelChoice(null);
        }
      });
      panel.append(noneBtn);
    }

    const palettes = el('div', 'color-panel-palettes');
    const columns = Array.isArray(data?.linkPalette) ? data.linkPalette : [];
    for (const band of paletteBands(columns)) {
      const inline = band.some((column) => column && column.row === 1);
      const sets = el('div', 'link-color-sets' + (inline ? ' is-inline' : ''));
      for (const column of band) {
        const set = el('div', 'link-color-set' + (inline ? ' is-inline' : ''));
        const name = el('span', 'link-color-set-name');
        name.textContent = column.label || '';
        set.append(name);
        const tonesWrap = el('div', 'link-color-tones');
        const tones = Array.isArray(column.tones) ? column.tones : [];
        for (const tone of tones) {
          const hex = String(tone).toLowerCase();
          const swatch = el('button', 'link-color-swatch');
          swatch.type = 'button';
          swatch.disabled = !!target.locked;
          swatch.dataset.hex = hex;
          swatch.setAttribute('aria-label', (column.label || '') + ' ' + hex);
          swatch.setAttribute('aria-pressed', hex === target.rgb ? 'true' : 'false');
          swatch.addEventListener('click', () => {
            if (target.locked) {
              return;
            }
            target.rgb = hex;
            const next = hexWithAlpha(hex, target.alpha);
            target.currentHex = next;
            applyColorPanelChoice(next);
          });
          tonesWrap.append(swatch);
        }
        set.append(tonesWrap);
        sets.append(set);
      }
      palettes.append(sets);
    }
    panel.append(palettes);

    const alpha = el('label', 'color-panel-alpha');
    const alphaHead = el('span', 'color-panel-alpha-head');
    alphaHead.append(el('span', 'color-panel-alpha-label', t('colorOpacity')));
    const alphaValue = el('span', 'color-panel-alpha-value', target.alpha + '%');
    alphaHead.append(alphaValue);
    const alphaInput = /** @type {HTMLInputElement} */ (el('input', 'color-panel-alpha-range'));
    alphaInput.type = 'range';
    alphaInput.min = '0';
    alphaInput.max = '100';
    alphaInput.step = '1';
    alphaInput.value = String(target.alpha);
    alphaInput.disabled = !!target.locked;
    alphaInput.setAttribute('aria-label', t('colorOpacity'));
    alphaInput.addEventListener('input', () => {
      target.alpha = Number(alphaInput.value);
      alphaValue.textContent = target.alpha + '%';
      paintColorAlpha(panel, target);
    });
    alphaInput.addEventListener('change', () => {
      if (target.locked || !target.rgb) {
        return;
      }
      const next = hexWithAlpha(target.rgb, target.alpha);
      if (next === target.currentHex) {
        return;
      }
      target.currentHex = next;
      applyColorPanelChoice(next, false);
    });
    alpha.append(alphaHead, alphaInput);
    panel.append(alpha);
    paintColorAlpha(panel, target);

    const custom = el('button', 'color-panel-custom');
    custom.type = 'button';
    custom.textContent = t('customPalette');
    custom.disabled = !!target.locked;
    custom.addEventListener('click', () => {
      if (!custom.disabled) {
        openSystemColorPickerForPanel();
      }
    });
    panel.append(custom);
    backdrop.append(panel);
    document.body.append(backdrop);
  }

  /**
   * @param {{
   *   mode: 'create' | 'edit',
   *   markerId?: string,
   *   parentId?: string,
   *   pageId?: string,
   *   requestId?: string,
   *   label?: string,
   *   alias?: string,
   *   description?: string,
   *   locked?: boolean,
   *   color?: string | null,
   * }} opts
   */
  function openGroupSettingsPanel(opts) {
    if (openGroupPanel?.mode === 'create' && openGroupPanel.requestId) {
      vscode.postMessage({ type: 'cancelGroupDraft', requestId: openGroupPanel.requestId });
    }
    closeLinkPanel();
    closeColorPanel();
    document.querySelectorAll('.group-panel-backdrop').forEach((node) => node.remove());
    if (opts.mode === 'edit' && opts.markerId) {
      const group = (data?.groups || []).find((item) => item.id === opts.markerId);
      openGroupPanel = {
        mode: 'edit',
        markerId: opts.markerId,
        label: group?.label || opts.label || '',
        alias: group?.alias || opts.alias || '',
        description: clipGroupDescriptionInput(group?.description || opts.description || ''),
        locked: !!(group?.locked || opts.locked),
        color: group?.color || opts.color || null,
        colorTouched: true,
        columns: groupColumnMode(group?.columns),
      };
    } else {
      openGroupPanel = {
        mode: 'create',
        parentId: opts.parentId,
        pageId: opts.pageId || activePage()?.id,
        requestId: opts.requestId,
        label: '',
        alias: '',
        description: '',
        locked: false,
        color: undefined,
        colorTouched: false,
        columns: defaultDraftColumns(opts.parentId),
      };
    }
    focusGroupNameOnOpen = true;
    mountGroupPanel();
  }

  function closeGroupPanel(cancelDraft) {
    const draft = openGroupPanel;
    openGroupPanel = null;
    focusGroupNameOnOpen = false;
    closeColorPanel();
    const backdrop = document.querySelector('.group-panel-backdrop');
    const active = document.activeElement;
    if (
      backdrop instanceof HTMLElement &&
      active instanceof HTMLElement &&
      backdrop.contains(active)
    ) {
      active.blur();
    }
    backdrop?.remove();
    if (cancelDraft && draft?.mode === 'create' && draft.requestId) {
      vscode.postMessage({ type: 'cancelGroupDraft', requestId: draft.requestId });
    }
  }

  function commitGroupDraft() {
    const draft = openGroupPanel;
    if (!draft || draft.mode !== 'create') {
      return;
    }
    const label = draft.label.trim();
    if (!label) {
      return;
    }
    const description = clipGroupDescriptionInput(draft.description).trim();
    /** @type {Record<string, unknown>} */
    const payload = {
      type: 'createGroup',
      label,
      alias: draft.alias.trim() || undefined,
      description: description || undefined,
      locked: draft.locked || undefined,
      parentId: draft.parentId,
      pageId: draft.pageId,
      requestId: draft.requestId,
      columns: draft.columns,
    };
    if (draft.colorTouched) {
      if (draft.color) {
        payload.color = draft.color;
      } else {
        payload.clearColor = true;
        payload.randomColor = false;
      }
    } else {
      payload.randomColor = true;
    }
    vscode.postMessage(payload);
    openGroupPanel = null;
    focusGroupNameOnOpen = false;
    document.querySelector('.group-panel-backdrop')?.remove();
  }

  function focusGroupPanelName(rootEl) {
    const nameInput = rootEl.querySelector('.link-panel-name-row input.link-panel-input');
    if (!(nameInput instanceof HTMLInputElement) || nameInput.disabled) {
      return;
    }
    const apply = () => {
      if (!nameInput.isConnected || nameInput.disabled) {
        return;
      }
      nameInput.focus();
      nameInput.select();
    };
    apply();
    requestAnimationFrame(apply);
  }

  /** @param {unknown} value */
  function groupColumnMode(value) {
    return value === 'flow' || value === '1' || value === '2' || value === '3' ? value : 'flow';
  }

  /** New roots start in one column; a subgroup starts with the parent's layout. */
  function defaultDraftColumns(parentId) {
    if (parentId) {
      const parent = (data?.groups || []).find((item) => item.id === parentId);
      if (parent) {
        return groupColumnMode(parent.columns);
      }
    }
    return '1';
  }

  function mountGroupPanel() {
    if (!openGroupPanel) {
      document.querySelectorAll('.group-panel-backdrop').forEach((node) => node.remove());
      return;
    }
    const state = openGroupPanel;
    let locked = state.locked;
    let label = state.label;
    let alias = state.alias;
    let description = state.description || '';
    let color = state.color;
    if (state.mode === 'edit' && state.markerId) {
      const group = (data?.groups || []).find((item) => item.id === state.markerId);
      if (group) {
        locked = !!group.locked;
        label = group.label || label;
        alias = group.alias || '';
        description = clipGroupDescriptionInput(group.description || '');
        color = group.color || null;
        state.locked = locked;
        state.label = label;
        state.alias = alias;
        state.description = description;
        state.color = color;
        state.columns = groupColumnMode(group.columns);
      }
    }
    const columns = groupColumnMode(state.columns);
    const colorKey =
      state.mode === 'create'
        ? !state.colorTouched
          ? 'auto'
          : color
            ? String(color)
            : 'none'
        : color
          ? String(color)
          : 'none';
    const existing = document.querySelector('.group-panel-backdrop');
    if (existing instanceof HTMLElement) {
      const sameCreate =
        state.mode === 'create' &&
        existing.dataset.mode === 'create' &&
        (existing.dataset.requestId || '') === (state.requestId || '') &&
        (existing.dataset.parentId || '') === (state.parentId || '') &&
        (existing.dataset.colorKey || '') === colorKey &&
        existing.dataset.locked === (locked ? '1' : '0') &&
        (existing.dataset.columns || '') === columns;
      const sameEdit =
        state.mode === 'edit' &&
        existing.dataset.mode === 'edit' &&
        existing.dataset.markerId === state.markerId &&
        existing.dataset.locked === (locked ? '1' : '0') &&
        (existing.dataset.colorKey || '') === colorKey &&
        (existing.dataset.columns || '') === columns;
      if ((sameCreate || sameEdit) && !focusGroupNameOnOpen) {
        return;
      }
      if (sameEdit && focusGroupNameOnOpen) {
        focusGroupNameOnOpen = false;
        focusGroupPanelName(existing);
        return;
      }
      existing.remove();
    }
    const backdrop = el('div', 'link-panel-backdrop group-panel-backdrop');
    backdrop.dataset.mode = state.mode;
    if (state.markerId) {
      backdrop.dataset.markerId = state.markerId;
    }
    if (state.parentId) {
      backdrop.dataset.parentId = state.parentId;
    }
    if (state.requestId) {
      backdrop.dataset.requestId = state.requestId;
    }
    backdrop.dataset.locked = locked ? '1' : '0';
    backdrop.dataset.colorKey = colorKey;
    backdrop.dataset.columns = columns;
    let pressedBackdrop = false;
    backdrop.addEventListener('mousedown', (event) => {
      pressedBackdrop = event.target === backdrop;
    });
    backdrop.addEventListener('click', (event) => {
      if (pressedBackdrop && event.target === backdrop) {
        closeGroupPanel(true);
      }
    });
    const panel = el('aside', 'link-panel' + (locked ? ' is-locked' : ''));
    const nameRow = el('div', 'link-panel-name-row');
    const nameInput = el('input', 'link-panel-input');
    nameInput.type = 'text';
    nameInput.value = label;
    nameInput.disabled = locked && state.mode === 'edit';
    nameInput.setAttribute('aria-label', t('groupName'));
    nameInput.placeholder = t('groupName');
    const lockBtn = el('button', 'lock-btn' + (locked ? ' is-locked' : ''));
    lockBtn.type = 'button';
    lockBtn.title = locked ? t('unlockGroup') : t('lockGroup');
    lockBtn.setAttribute('aria-label', lockBtn.title);
    lockBtn.append(locked ? lockClosedIcon() : lockOpenIcon());
    lockBtn.addEventListener('click', () => {
      if (state.mode === 'create') {
        state.locked = !state.locked;
        mountGroupPanel();
        return;
      }
      if (state.markerId) {
        vscode.postMessage({ type: 'toggleLock', markerId: state.markerId });
      }
    });
    nameRow.append(nameInput, lockBtn);
    panel.append(nameRow);

    const aliasLabel = el('label', 'link-panel-field');
    aliasLabel.append(document.createTextNode(t('groupAlias')));
    const aliasInput = el('input', 'link-panel-input');
    aliasInput.type = 'text';
    aliasInput.dataset.groupField = 'alias';
    aliasInput.value = alias;
    aliasInput.disabled = locked && state.mode === 'edit';
    aliasLabel.append(aliasInput);
    panel.append(aliasLabel);

    const descField = el('div', 'link-panel-field');
    const descHead = el('div', 'group-panel-field-head');
    descHead.append(document.createTextNode(t('groupDescription')));
    const descCounter = el('span', 'group-panel-counter');
    descCounter.textContent = description.length + '/' + MAX_GROUP_DESCRIPTION_LENGTH;
    descHead.append(descCounter);
    const descLabel = el('label', '');
    const descInput = el('textarea', 'link-panel-input');
    descInput.dataset.groupField = 'description';
    descInput.rows = MAX_GROUP_DESCRIPTION_LINES;
    descInput.value = description;
    descInput.disabled = locked && state.mode === 'edit';
    descInput.setAttribute('aria-label', t('groupDescription'));
    descLabel.append(descInput);
    descField.append(descHead, descLabel);
    panel.append(descField);

    const colorField = el('div', 'link-panel-field link-panel-color');
    const colorRow = el('div', 'link-color-row');
    const colorCaption = el('span', 'link-color-caption');
    colorCaption.textContent = t('changeColor');
    const well = el('button', 'link-color-well' + (!color ? ' is-empty' : ''));
    well.type = 'button';
    well.disabled = locked && state.mode === 'edit';
    if (color) {
      well.style.setProperty('--swatch', color);
    }
    well.setAttribute('aria-label', t('changeColor'));
    well.addEventListener('click', () => {
      if (well.disabled) {
        return;
      }
      openColorsPanel({
        kind: state.mode === 'create' ? 'group-draft' : 'marker',
        id: state.markerId,
        currentHex: typeof color === 'string' ? color : '',
        allowNone: true,
        locked: false,
      });
    });
    colorRow.append(colorCaption, well);
    colorField.append(colorRow);
    panel.append(colorField);

    const layoutField = el('div', 'link-panel-field');
    layoutField.append(el('span', 'link-color-caption', t('viewGroupLayout')));
    const layoutChoices = el('div', 'group-layout-choices');
    const layoutLocked = locked && state.mode === 'edit';
    for (const [value, text] of [
      ['flow', t('viewFlow')],
      ['1', t('viewCol1')],
      ['2', t('viewCol2')],
      ['3', t('viewCol3')],
    ]) {
      const choice = el('button', 'group-layout-choice' + (value === columns ? ' is-active' : ''));
      choice.type = 'button';
      choice.textContent = text;
      choice.disabled = layoutLocked;
      choice.setAttribute('aria-pressed', value === columns ? 'true' : 'false');
      choice.addEventListener('click', () => {
        if (choice.disabled || value === state.columns) {
          return;
        }
        state.columns = /** @type {'flow' | '1' | '2' | '3'} */ (value);
        if (state.mode === 'create') {
          mountGroupPanel();
          return;
        }
        if (!state.markerId) {
          return;
        }
        const group = (data?.groups || []).find((item) => item.id === state.markerId);
        if (group) {
          group.columns = value;
        }
        vscode.postMessage({
          type: 'runCommand',
          command: 'syn3.setColumns.' + value,
          arg: { markerId: state.markerId },
        });
        mountGroupPanel();
      });
      layoutChoices.append(choice);
    }
    layoutField.append(layoutChoices);
    panel.append(layoutField);

    nameInput.addEventListener('input', () => {
      state.label = nameInput.value;
    });
    aliasInput.addEventListener('input', () => {
      state.alias = aliasInput.value;
    });
    descInput.addEventListener('input', () => {
      const clipped = clipGroupDescriptionInput(descInput.value);
      if (descInput.value !== clipped) {
        const start = descInput.selectionStart;
        descInput.value = clipped;
        if (typeof start === 'number') {
          const nextPos = Math.min(start, clipped.length);
          descInput.setSelectionRange(nextPos, nextPos);
        }
      }
      state.description = descInput.value;
      descCounter.textContent = descInput.value.length + '/' + MAX_GROUP_DESCRIPTION_LENGTH;
    });
    const commitCreateFromFields = () => {
      state.label = nameInput.value;
      state.alias = aliasInput.value;
      state.description = clipGroupDescriptionInput(descInput.value);
      commitGroupDraft();
    };
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (state.mode === 'create') {
          commitCreateFromFields();
        } else {
          nameInput.blur();
        }
      }
    });
    nameInput.addEventListener('change', () => {
      if (state.mode !== 'edit' || !state.markerId || locked) {
        return;
      }
      const next = nameInput.value.trim();
      if (next) {
        vscode.postMessage({ type: 'updateGroup', markerId: state.markerId, label: next });
      }
    });
    aliasInput.addEventListener('change', () => {
      if (state.mode !== 'edit' || !state.markerId || locked) {
        return;
      }
      const next = aliasInput.value.trim();
      vscode.postMessage({
        type: 'updateGroup',
        markerId: state.markerId,
        alias: next || null,
      });
    });
    descInput.addEventListener('change', () => {
      if (state.mode !== 'edit' || !state.markerId || locked) {
        return;
      }
      const next = clipGroupDescriptionInput(descInput.value).trim();
      descInput.value = next;
      state.description = next;
      descCounter.textContent = next.length + '/' + MAX_GROUP_DESCRIPTION_LENGTH;
      vscode.postMessage({
        type: 'updateGroup',
        markerId: state.markerId,
        description: next || null,
      });
    });

    if (state.mode === 'create') {
      const actions = el('div', 'link-panel-actions group-draft-actions');
      const cancel = el('button', 'link-panel-secondary');
      cancel.type = 'button';
      cancel.textContent = t('groupDraftCancel');
      cancel.addEventListener('click', () => closeGroupPanel(true));
      const save = el('button', 'link-panel-primary');
      save.type = 'button';
      save.textContent = t('groupDraftSave');
      const createDraftDirty = () =>
        !!(
          nameInput.value.trim() ||
          aliasInput.value.trim() ||
          clipGroupDescriptionInput(descInput.value).trim() ||
          state.locked ||
          state.colorTouched ||
          groupColumnMode(state.columns) !== defaultDraftColumns(state.parentId)
        );
      const syncSave = () => {
        actions.hidden = !createDraftDirty();
      };
      syncSave();
      nameInput.addEventListener('input', syncSave);
      aliasInput.addEventListener('input', syncSave);
      descInput.addEventListener('input', syncSave);
      save.addEventListener('click', () => {
        if (!nameInput.value.trim()) {
          nameInput.focus();
          return;
        }
        commitCreateFromFields();
      });
      actions.append(cancel, save);
      panel.append(actions);
    }

    if (state.mode === 'edit' && state.markerId) {
      const actions = el('div', 'link-panel-actions');
      const delLift = el('button', 'link-panel-danger');
      delLift.type = 'button';
      delLift.textContent = t('menuDeleteLift');
      delLift.disabled = locked;
      delLift.addEventListener('click', () => {
        if (delLift.disabled || !state.markerId) {
          return;
        }
        vscode.postMessage({
          type: 'runCommand',
          command: 'syn3.deleteMarker',
          arg: { webviewSection: 'marker', markerId: state.markerId },
        });
        closeGroupPanel(false);
      });
      const delAll = el('button', 'link-panel-danger');
      delAll.type = 'button';
      delAll.textContent = t('menuDeleteTree');
      delAll.disabled = locked;
      delAll.addEventListener('click', () => {
        if (delAll.disabled || !state.markerId) {
          return;
        }
        vscode.postMessage({ type: 'deleteMarkerTree', markerId: state.markerId });
        closeGroupPanel(false);
      });
      actions.append(delLift, delAll);
      panel.append(actions);
    }

    backdrop.append(panel);
    document.body.append(backdrop);
    if (focusGroupNameOnOpen) {
      focusGroupNameOnOpen = false;
      focusGroupPanelName(backdrop);
    }
  }

  function formatReviewStamp(iso) {
    if (!iso) {
      return '';
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return '';
    }
    const pad = (n) => String(n).padStart(2, '0');
    return (
      pad(d.getDate()) +
      '.' +
      pad(d.getMonth() + 1) +
      '.' +
      String(d.getFullYear()).slice(-2) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes())
    );
  }

  /** True when the chip branch is the branch checked out in this window. */
  function reviewBranchMatchesCheckout(branch) {
    const name = reviewBranchLabel(branch);
    const current = String(reviewState?.checkout || '').trim();
    if (!name || !current) {
      return false;
    }
    return name.toLocaleLowerCase() === current.toLocaleLowerCase();
  }

  /**
   * Branch this review was written for. A thread reply uses the parent chip
   * when the reply itself has no `Branch:` line.
   * @param {string} messageId
   */
  function reviewSubjectBranch(messageId) {
    const chip = (reviewState?.messages || []).find((item) => item.id === messageId);
    if (chip) {
      return reviewBranchLabel(chip.branch);
    }
    const reply = findReviewReply(messageId);
    const own = reviewBranchLabel(reply && reply.branch);
    if (own) {
      return own;
    }
    for (const msg of reviewState?.messages || []) {
      if ((msg.replies || []).some((item) => item.id === messageId)) {
        return reviewBranchLabel(msg.branch);
      }
    }
    return '';
  }

  /** Neurofix edits the checkout, so a review of another branch cannot run it. */
  function reviewNeurofixBlocked(messageId) {
    const branch = reviewSubjectBranch(messageId);
    if (!branch) {
      return false;
    }
    return !reviewBranchMatchesCheckout(branch);
  }

  /** @param {HTMLButtonElement} button */
  function muteNeurofixAction(button) {
    button.classList.add('is-muted');
    button.dataset.neurofixBlocked = '1';
    button.title = t('neurofixForeignBranch');
  }

  function denyForeignNeurofix() {
    closeContextMenu();
    closeNeuroFixListPanel();
    vscode.postMessage({ type: 'reviewNeurofixDenied' });
  }

  /** Branch label from a root review. A full markdown link keeps only its text. */
  function reviewBranchLabel(raw) {
    const value = String(raw || '').trim();
    const linked = /^\[([^\]]+)\]\([^)]+\)$/.exec(value);
    return (linked ? linked[1] : value).trim();
  }

  /** Checkout branch stays on screen this long after the pointer leaves. */
  const CHECKOUT_BRANCH_HIDE_MS = 2000;
  /** Nested branch appears only after the pointer has stayed this long. */
  const CHECKOUT_BRANCH_SHOW_MS = 500;

  /** @type {Set<string>} */
  const checkoutBranchShown = new Set();
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const checkoutBranchHideTimers = new Map();
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const checkoutBranchShowTimers = new Map();

  /**
   * Own `Branch:` line, or the parent chip when a thread pill has none.
   * @param {string | undefined} branch
   * @param {string | undefined} [fallback]
   */
  function stampBranchName(branch, fallback) {
    return reviewBranchLabel(branch) || reviewBranchLabel(fallback);
  }

  /**
   * @param {string} revealId
   */
  function checkoutBranchNodes(revealId) {
    return document.querySelectorAll(
      `[data-branch-reveal="${revealId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`,
    );
  }

  /**
   * @param {string} revealId
   * @param {boolean} shown
   */
  function applyCheckoutBranchShown(revealId, shown) {
    checkoutBranchNodes(revealId).forEach((node) => {
      if (node instanceof HTMLElement) {
        node.classList.toggle('is-shown', shown);
      }
    });
  }

  /** @param {string} revealId */
  function cancelCheckoutBranchShow(revealId) {
    const pending = checkoutBranchShowTimers.get(revealId);
    if (pending) {
      clearTimeout(pending);
      checkoutBranchShowTimers.delete(revealId);
    }
  }

  /** @param {string} revealId */
  function showCheckoutBranch(revealId) {
    if (!revealId) {
      return;
    }
    const pending = checkoutBranchHideTimers.get(revealId);
    if (pending) {
      clearTimeout(pending);
      checkoutBranchHideTimers.delete(revealId);
    }
    cancelCheckoutBranchShow(revealId);
    checkoutBranchShown.add(revealId);
    applyCheckoutBranchShown(revealId, true);
  }

  /**
   * Show after the pointer has stayed. A label that is already up stays up.
   * @param {string} revealId
   */
  function scheduleShowCheckoutBranch(revealId) {
    if (!revealId) {
      return;
    }
    const hiding = checkoutBranchHideTimers.get(revealId);
    if (hiding) {
      clearTimeout(hiding);
      checkoutBranchHideTimers.delete(revealId);
    }
    if (checkoutBranchShown.has(revealId) || checkoutBranchShowTimers.has(revealId)) {
      return;
    }
    const timer = setTimeout(() => {
      checkoutBranchShowTimers.delete(revealId);
      showCheckoutBranch(revealId);
    }, CHECKOUT_BRANCH_SHOW_MS);
    checkoutBranchShowTimers.set(revealId, timer);
  }

  /** @param {string} revealId */
  function scheduleHideCheckoutBranch(revealId) {
    if (!revealId) {
      return;
    }
    cancelCheckoutBranchShow(revealId);
    const pending = checkoutBranchHideTimers.get(revealId);
    if (pending) {
      clearTimeout(pending);
    }
    if (!checkoutBranchShown.has(revealId)) {
      return;
    }
    const timer = setTimeout(() => {
      checkoutBranchHideTimers.delete(revealId);
      checkoutBranchShown.delete(revealId);
      applyCheckoutBranchShown(revealId, false);
    }, CHECKOUT_BRANCH_HIDE_MS);
    checkoutBranchHideTimers.set(revealId, timer);
  }

  /** @param {string} revealId */
  function branchHoverSelector(revealId) {
    const safe = revealId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `[data-branch-hover="${safe}"]`;
  }

  /**
   * Pointer on the chip or on the branch name keeps a checkout label up.
   * Moving between those two does not start the hide timer.
   * @param {HTMLElement} target
   * @param {string} revealId
   */
  function bindCheckoutBranchHover(target, revealId) {
    if (!revealId) {
      return;
    }
    target.dataset.branchHover = revealId;
    target.addEventListener('pointerenter', () => scheduleShowCheckoutBranch(revealId));
    target.addEventListener('pointerleave', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Element && next.closest(branchHoverSelector(revealId))) {
        return;
      }
      scheduleHideCheckoutBranch(revealId);
    });
  }

  /**
   * Date, and the branch name to its right.
   * A revealed name stays hidden until the pointer is on the chip.
   * `own` is the checkout branch and is drawn in the brighter text color.
   * @param {string} dateText
   * @param {string} [branchText]
   * @param {{ own?: boolean, reveal?: boolean, revealId?: string }} [opts]
   */
  function renderReviewStamp(dateText, branchText, opts) {
    const stamp = el('div', 'review-stamp');
    if (dateText) {
      stamp.append(el('span', 'review-stamp-date', dateText));
    }
    if (branchText) {
      const own = !!opts?.own;
      const reveal = !!opts?.reveal;
      const revealId = reveal ? opts?.revealId || '' : '';
      const shown = !!revealId && checkoutBranchShown.has(revealId);
      const branch = el(
        'span',
        'review-stamp-branch' +
          (own ? ' is-own' : '') +
          (reveal ? ' is-reveal' : '') +
          (shown ? ' is-shown' : ''),
      );
      branch.append(reviewBranchIcon(), el('span', 'review-stamp-branch-name', branchText));
      branch.title = branchText;
      if (revealId) {
        branch.dataset.branchReveal = revealId;
        bindCheckoutBranchHover(branch, revealId);
      }
      branch.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (reveal && !branch.classList.contains('is-shown')) {
          return;
        }
        vscode.postMessage({
          type: 'clipboardWrite',
          text: branchText,
          notice: 'branchCopied',
        });
      });
      stamp.append(branch);
    }
    return stamp;
  }

  /**
   * @param {string} rawBranch
   * @param {string} revealId
   */
  function reviewStampOpts(rawBranch, revealId) {
    const name = reviewBranchLabel(rawBranch);
    const checkout = reviewBranchMatchesCheckout(name);
    return {
      name,
      checkout,
      revealId: checkout ? revealId : '',
    };
  }

  /** Path from assets/git-branch-fill.svg — sits before a stamp branch name. */
  function reviewBranchIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'review-stamp-branch-ico');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M7.10508 15.2101C8.21506 15.6501 9 16.7334 9 18C9 19.6569 7.65685 21 6 21C4.34315 21 3 19.6569 3 18C3 16.6938 3.83481 15.5825 5 15.1707V8.82929C3.83481 8.41746 3 7.30622 3 6C3 4.34315 4.34315 3 6 3C7.65685 3 9 4.34315 9 6C9 7.30622 8.16519 8.41746 7 8.82929V11.9996C7.83566 11.3719 8.87439 11 10 11H14C15.3835 11 16.5482 10.0635 16.8949 8.78991C15.7849 8.34988 15 7.26661 15 6C15 4.34315 16.3431 3 18 3C19.6569 3 21 4.34315 21 6C21 7.3332 20.1303 8.46329 18.9274 8.85392C18.5222 11.2085 16.4703 13 14 13H10C8.61653 13 7.45179 13.9365 7.10508 15.2101Z',
    );
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }

  /** Paths from assets/sparkling-2-fill.svg — Neurofix trigger next to review pill. */
  function reviewSparkleIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'review-ico review-ico-sparkle');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M17.0007 1.20825L18.3195 3.68108L20.7923 4.99992L18.3195 6.31876L17.0007 8.79159L15.6818 6.31876L13.209 4.99992L15.6818 3.68108L17.0007 1.20825ZM8.00065 4.33325L10.6673 9.33325L15.6673 11.9999L10.6673 14.6666L8.00065 19.6666L5.33398 14.6666L0.333984 11.9999L5.33398 9.33325L8.00065 4.33325ZM19.6673 16.3333L18.0007 13.2083L16.334 16.3333L13.209 17.9999L16.334 19.6666L18.0007 22.7916L19.6673 19.6666L22.7923 17.9999L19.6673 16.3333Z',
    );
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }

  /** Paths from assets/var-instance-fill.svg — open full review file from a list row. */
  function reviewVarInstanceIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'review-ico');
    const paths = [
      'M11.293 1.39348C11.6835 1.00295 12.3165 1.00295 12.707 1.39348L22.6064 11.2929C22.9969 11.6834 22.9969 12.3165 22.6064 12.707L12.707 22.6064C12.3165 22.9967 11.6834 22.9968 11.293 22.6064L3.68652 14.9999H9.35742C10.0598 15.6197 10.9837 15.9999 12 15.9999C14.209 15.9999 15.9999 14.2089 16 11.9999C16 9.79082 14.2091 7.99998 12 7.99993C10.9836 7.99997 10.0598 8.38012 9.35742 8.99993H3.68652L11.293 1.39348Z',
      'M12.2051 10.0097C12.9445 10.085 13.5646 10.5636 13.8428 11.2216C13.8933 11.3412 13.9333 11.4665 13.96 11.5966C13.9866 11.7268 14 11.8618 14 11.9999C14 12.5333 13.7895 13.0164 13.4492 13.3749C13.3932 13.4339 13.3353 13.4911 13.2725 13.5429C12.9267 13.8283 12.4834 13.9999 12 13.9999C11.3063 13.9999 10.6964 13.6458 10.3379 13.1093L10.2695 12.9999H1.09961L1.10059 10.9999H10.2695C10.6155 10.4026 11.2601 9.99993 12 9.99993L12.2051 10.0097Z',
    ];
    for (const d of paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'currentColor');
      svg.append(path);
    }
    return svg;
  }

  /** Paths from assets/blog-line.svg — plain message / comment glyph. */
  function reviewCommentIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'review-ico');
    const paths = [
      { d: 'M11 11.5H9V13.5H11V11.5Z' },
      { d: 'M15 11.5H13V13.5H15V11.5Z' },
      { d: 'M17 11.5H19V13.5H17V11.5Z' },
      {
        d: 'M11.2 19L14 22.5L16.8 19H22C22.5523 19 23 18.5523 23 18V7.10256C23 6.55028 22.5523 6.10256 22 6.10256H6C5.44772 6.10256 5 6.55028 5 7.10256V18C5 18.5523 5.44772 19 6 19H11.2ZM21 17H15.8387L14 19.2984L12.1613 17H7V8.10256H21V17Z',
        rule: 'evenodd',
      },
      { d: 'M19 2H2C1.44772 2 1 2.44772 1 3V15H3V4H19V2Z' },
    ];
    for (const item of paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', item.d);
      path.setAttribute('fill', 'currentColor');
      if (item.rule) {
        path.setAttribute('fill-rule', item.rule);
        path.setAttribute('clip-rule', item.rule);
      }
      svg.append(path);
    }
    return svg;
  }

  /** Path from assets/git-pull-request-fill.svg — MR chip leading glyph. */
  function reviewPrIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'review-ico review-ico-pr');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M15 5H17C18.1046 5 19 5.89543 19 7V15.1707C20.1652 15.5825 21 16.6938 21 18C21 19.6569 19.6569 21 18 21C16.3431 21 15 19.6569 15 18C15 16.6938 15.8348 15.5825 17 15.1707V7H15V10L10.5 6L15 2V5ZM5 8.82929C3.83481 8.41746 3 7.30622 3 6C3 4.34315 4.34315 3 6 3C7.65685 3 9 4.34315 9 6C9 7.30622 8.16519 8.41746 7 8.82929V15.1707C8.16519 15.5825 9 16.6938 9 18C9 19.6569 7.65685 21 6 21C4.34315 21 3 19.6569 3 18C3.83481 15.5825 5 15.1707V8.82929Z',
    );
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }

  /**
   * @param {string} className
   * @param {string} d
   */
  function reviewSvgIcon(className, d) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'review-ico ' + className);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }

  /**
   * @param {string} className
   * @param {string} d
   */
  function cloudSvgIcon(className, d) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'cloud-ico ' + className);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }

  /** assets/fragment.svg — closed MR chip. */
  function reviewClosedIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'review-ico review-ico-closed');
    const specs = [
      {
        d: 'M12 9C12.5521 9 12.9997 9.44796 13 10V11H11V10C11.0003 9.44796 11.4479 9 12 9Z',
      },
      {
        d: 'M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 7C10.3432 7 9.00023 8.34329 9 10V11H8V16H16V11H15V10C14.9998 8.34329 13.6568 7 12 7Z',
        rule: 'evenodd',
      },
    ];
    for (const spec of specs) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', spec.d);
      path.setAttribute('fill', 'currentColor');
      if (spec.rule) {
        path.setAttribute('fill-rule', spec.rule);
        path.setAttribute('clip-rule', spec.rule);
      }
      svg.append(path);
    }
    return svg;
  }

  /** assets/bolt.svg — review chip with empty status. */
  function reviewBoltIcon() {
    return reviewSvgIcon('review-ico-bolt', 'M13 10H20L11 23V14H4L13 1V10Z');
  }

  /** assets/loader-2-fill.svg — review status in progress. */
  function reviewProgressIcon() {
    return reviewSvgIcon(
      'review-ico-progress',
      'M12 2C12.5523 2 13 2.44772 13 3V6C13 6.55228 12.5523 7 12 7C11.4477 7 11 6.55228 11 6V3C11 2.44772 11.4477 2 12 2ZM12 17C12.5523 17 13 17.4477 13 18V21C13 21.5523 12.5523 22 12 22C11.4477 22 11 21.5523 11 21V18C11 17.4477 11.4477 17 12 17ZM22 12C22 12.5523 21.5523 13 21 13H18C17.4477 13 17 12.5523 17 12C17 11.4477 17.4477 11 18 11H21C21.5523 11 22 11.4477 22 12ZM7 12C7 12.5523 6.55228 13 6 13H3C2.44772 13 2 12.5523 2 12C2 11.4477 2.44772 11 3 11H6C6.55228 11 7 11.4477 7 12ZM19.0711 19.0711C18.6805 19.4616 18.0474 19.4616 17.6569 19.0711L15.5355 16.9497C15.145 16.5592 15.145 15.9261 15.5355 15.5355C15.9261 15.145 16.5592 15.145 16.9497 15.5355L19.0711 17.6569C19.4616 18.0474 19.4616 18.6805 19.0711 19.0711ZM8.46447 8.46447C8.07394 8.85499 7.44078 8.85499 7.05025 8.46447L4.92893 6.34315C4.53841 5.95262 4.53841 5.31946 4.92893 4.92893C5.31946 4.53841 5.95262 4.53841 6.34315 4.92893L8.46447 7.05025C8.85499 7.44078 8.85499 8.07394 8.46447 8.46447ZM4.92893 19.0711C4.53841 18.6805 4.53841 18.0474 4.92893 17.6569L7.05025 15.5355C7.44078 15.145 8.07394 15.145 8.46447 15.5355C8.85499 15.9261 8.85499 16.5592 8.46447 16.9497L6.34315 19.0711C5.95262 19.4616 5.31946 19.4616 4.92893 19.0711ZM15.5355 8.46447C15.145 8.07394 15.145 7.44078 15.5355 7.05025L17.6569 4.92893C18.0474 4.53841 18.6805 4.53841 19.0711 4.92893C19.4616 5.31946 19.4616 5.95262 19.0711 6.34315L16.9497 8.46447C16.5592 8.85499 15.9261 8.85499 15.5355 8.46447Z',
    );
  }

  /** assets/check-double-fill.svg — review status done. */
  function reviewDoneIcon() {
    return reviewSvgIcon(
      'review-ico-done',
      'M11.602 13.7599L13.014 15.1719L21.4795 6.7063L22.8938 8.12051L13.014 18.0003L6.65 11.6363L8.06421 10.2221L10.189 12.3469L11.602 13.7599ZM11.6037 10.9322L16.5563 5.97949L17.9666 7.38977L13.014 12.3424L11.6037 10.9322ZM8.77698 16.5873L7.36396 18.0003L1 11.6363L2.41421 10.2221L3.82723 11.6352L3.82604 11.6363L8.77698 16.5873Z',
    );
  }

  /**
   * @param {string | undefined} status
   */
  function reviewStatusIcon(status) {
    if (status === 'inProgress') {
      return reviewProgressIcon();
    }
    if (status === 'done') {
      return reviewDoneIcon();
    }
    return reviewBoltIcon();
  }

  function reviewPersonIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'review-ico');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8zm0 1.25c-2.4 0-4.5 1.2-4.5 2.75V13h9v-.999c0-1.55-2.1-2.751-4.5-2.751z',
    );
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }

  const REVIEW_SKELETON_PARENTS = 3;
  const REVIEW_SKELETON_CHILDREN = 3;
  const REVIEW_SKEL_COLOR = '#6e6e6e';
  /** Keep in sync with src/reviewThemes.ts. */
  const REVIEW_SCHEME_IDS = ['softSemantic', 'highContrast', 'mutedPastel', 'neonOutline', 'softFilled', 'warmEarthy', 'coolTech'];
  const REVIEW_SCHEME_DEFAULT = 'softSemantic';
  const REVIEW_SCHEME_LABELS = {
    softSemantic: 'Soft Semantic',
    highContrast: 'High-Contrast Flat',
    mutedPastel: 'Muted Pastel Dark',
    neonOutline: 'Neon Outline',
    softFilled: 'Soft Filled',
    warmEarthy: 'Warm Earthy',
    coolTech: 'Cool Tech',
  };
  /** Schemes whose H/M/L counts are separate pills. Zero counts are hidden. */
  const REVIEW_SCHEME_LEVEL_PILLS = { softSemantic: true, mutedPastel: true };
  /** Empty means the scheme has no role icons. */
  const REVIEW_SCHEME_ICONS = {
    softSemantic: 'fill',
    highContrast: '',
    mutedPastel: 'fill',
    neonOutline: 'line',
    softFilled: 'fill',
    warmEarthy: 'line',
    coolTech: 'fill',
  };
  const REVIEW_SCHEME_ICON_PATHS = {
    mr: {
      fill: 'M15 5H17C18.1046 5 19 5.89543 19 7V15.1707C20.1652 15.5825 21 16.6938 21 18C21 19.6569 19.6569 21 18 21C16.3431 21 15 19.6569 15 18C15 16.6938 15.8348 15.5825 17 15.1707V7H15V10L10.5 6L15 2V5ZM5 8.82929C3.83481 8.41746 3 7.30622 3 6C3 4.34315 4.34315 3 6 3C7.65685 3 9 4.34315 9 6C9 7.30622 8.16519 8.41746 7 8.82929V15.1707C8.16519 15.5825 9 16.6938 9 18C9 19.6569 7.65685 21 6 21C4.34315 21 3 19.6569 3 18C3 16.6938 3.83481 15.5825 5 15.1707V8.82929Z',
      line: 'M15 5H17C18.1046 5 19 5.89543 19 7V15.1707C20.1652 15.5825 21 16.6938 21 18C21 19.6569 19.6569 21 18 21C16.3431 21 15 19.6569 15 18C15 16.6938 15.8348 15.5825 17 15.1707V7H15V10L10.5 6L15 2V5ZM5 8.82929C3.83481 8.41746 3 7.30622 3 6C3 4.34315 4.34315 3 6 3C7.65685 3 9 4.34315 9 6C9 7.30622 8.16519 8.41746 7 8.82929V15.1707C8.16519 15.5825 9 16.6938 9 18C9 19.6569 7.65685 21 6 21C4.34315 21 3 19.6569 3 18C3 16.6938 3.83481 15.5825 5 15.1707V8.82929ZM6 7C6.55228 7 7 6.55228 7 6C7 5.44772 6.55228 5 6 5C5.44772 5 5 5.44772 5 6C5 6.55228 5.44772 7 6 7ZM6 19C6.55228 19 7 18.5523 7 18C7 17.4477 6.55228 17 6 17C5.44772 17 5 17.4477 5 18C5 18.5523 5.44772 19 6 19ZM18 19C18.5523 19 19 18.5523 19 18C19 17.4477 18.5523 17 18 17C17.4477 17 17 17.4477 17 18C17 18.5523 17.4477 19 18 19Z',
    },
    review: {
      fill: 'M24 12L18.3431 17.6569L16.9289 16.2426L21.1716 12L16.9289 7.75736L18.3431 6.34315L24 12ZM2.82843 12L7.07107 16.2426L5.65685 17.6569L0 12L5.65685 6.34315L7.07107 7.75736L2.82843 12ZM9.78828 21H7.66006L14.2118 3H16.34L9.78828 21Z',
      line: 'M24 12L18.3431 17.6569L16.9289 16.2426L21.1716 12L16.9289 7.75736L18.3431 6.34315L24 12ZM2.82843 12L7.07107 16.2426L5.65685 17.6569L0 12L5.65685 6.34315L7.07107 7.75736L2.82843 12ZM9.78828 21H7.66006L14.2118 3H16.34L9.78828 21Z',
    },
    rereview: {
      fill: 'M12 4C9.4095 4 7.10606 5.23053 5.64274 7.14274L8 9.5H2V3.5L4.21863 5.71863C6.05061 3.452 8.85558 2 12 2 17.5228 2 22 6.47715 22 12H20C20 7.58172 16.4183 4 12 4ZM4 12C4 16.4183 7.58172 20 12 20 14.5905 20 16.894 18.7695 18.3573 16.8573L16 14.5 22 14.5V20.5L19.7814 18.2814C17.9494 20.548 15.1444 22 12 22 6.47715 22 2 17.5228 2 12H4Z',
      line: 'M12 4C9.25144 4 6.82508 5.38626 5.38443 7.5H8V9.5H2V3.5H4V5.99936C5.82381 3.57166 8.72764 2 12 2C17.5228 2 22 6.47715 22 12H20C20 7.58172 16.4183 4 12 4ZM4 12C4 16.4183 7.58172 20 12 20C14.7486 20 17.1749 18.6137 18.6156 16.5H16V14.5H22V20.5H20V18.0006C18.1762 20.4283 15.2724 22 12 22C6.47715 22 2 17.5228 2 12H4Z',
    },
    neurofix: {
      fill: 'M17.0007 1.20825L18.3195 3.68108L20.7923 4.99992L18.3195 6.31876L17.0007 8.79159L15.6818 6.31876L13.209 4.99992L15.6818 3.68108L17.0007 1.20825ZM8.00065 4.33325L10.6673 9.33325L15.6673 11.9999L10.6673 14.6666L8.00065 19.6666L5.33398 14.6666L0.333984 11.9999L5.33398 9.33325L8.00065 4.33325ZM19.6673 16.3333L18.0007 13.2083L16.334 16.3333L13.209 17.9999L16.334 19.6666L18.0007 22.7916L19.6673 19.6666L22.7923 17.9999L19.6673 16.3333Z',
      line: 'M17.0007 1.20825 18.3195 3.68108 20.7923 4.99992 18.3195 6.31876 17.0007 8.79159 15.6818 6.31876 13.209 4.99992 15.6818 3.68108 17.0007 1.20825ZM10.6673 9.33325 15.6673 11.9999 10.6673 14.6666 8.00065 19.6666 5.33398 14.6666.333984 11.9999 5.33398 9.33325 8.00065 4.33325 10.6673 9.33325ZM11.4173 11.9999 9.18905 10.8115 8.00065 8.58325 6.81224 10.8115 4.58398 11.9999 6.81224 13.1883 8.00065 15.4166 9.18905 13.1883 11.4173 11.9999ZM19.6673 16.3333 18.0007 13.2083 16.334 16.3333 13.209 17.9999 16.334 19.6666 18.0007 22.7916 19.6673 19.6666 22.7923 17.9999 19.6673 16.3333Z',
    },
    explain: {
      fill: 'M9.24264 18.9967H21V20.9967H3V16.754L12.8995 6.85453L17.1421 11.0972L9.24264 18.9967ZM14.3137 5.44032L16.435 3.319C16.8256 2.92848 17.4587 2.92848 17.8492 3.319L20.6777 6.14743C21.0682 6.53795 21.0682 7.17112 20.6777 7.56164L18.5563 9.68296L14.3137 5.44032Z',
      line: 'M5 18.89H6.41421L15.7279 9.57627L14.3137 8.16206L5 17.4758V18.89ZM21 20.89H3V16.6473L16.435 3.21231C16.8256 2.82179 17.4587 2.82179 17.8492 3.21231L20.6777 6.04074C21.0682 6.43126 21.0682 7.06443 20.6777 7.45495L9.24264 18.89H21V20.89ZM15.7279 6.74785L17.1421 8.16206L18.5563 6.74785L17.1421 5.33363L15.7279 6.74785Z',
    },
    study: {
      fill: 'M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z',
      line: 'M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z',
    },
    note: {
      fill: 'M15 14L14.8834 14.0067C14.4243 14.0601 14.0601 14.4243 14.0067 14.8834L14 15V21H3.99826C3.44694 21 3 20.5551 3 20.0066V3.9934C3 3.44476 3.44495 3 3.9934 3H20.0066C20.5552 3 21 3.44749 21 3.9985V14H15ZM21 16L16 20.997V16H21Z',
      line: 'M21 15L15 20.996L4.00221 21C3.4487 21 3 20.5551 3 20.0066V3.9934C3 3.44476 3.44495 3 3.9934 3H20.0066C20.5552 3 21 3.45576 21 4.00247V15ZM19 5H5V19H13V14C13 13.4872 13.386 13.0645 13.8834 13.0067L14 13L19 12.999V5ZM18.171 14.999L15 15V18.169L18.171 14.999Z',
    },
    fix: {
      fill: 'M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z',
      line: 'M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z',
    },
  };
  const REVIEW_BRANCH_ICON =
    'M7.10508 15.2101C8.21506 15.6501 9 16.7334 9 18C9 19.6569 7.65685 21 6 21C4.34315 21 3 19.6569 3 18C3 16.6938 3.83481 15.5825 5 15.1707V8.82929C3.83481 8.41746 3 7.30622 3 6C3 4.34315 4.34315 3 6 3C7.65685 3 9 4.34315 9 6C9 7.30622 8.16519 8.41746 7 8.82929V11.9996C7.83566 11.3719 8.87439 11 10 11H14C15.3835 11 16.5482 10.0635 16.8949 8.78991C15.7849 8.34988 15 7.26661 15 6C15 4.34315 16.3431 3 18 3C19.6569 3 21 4.34315 21 6C21 7.3332 20.1303 8.46329 18.9274 8.85392C18.5222 11.2085 16.4703 13 14 13H10C8.61653 13 7.45179 13.9365 7.10508 15.2101Z';
  let reviewSchemeId = REVIEW_SCHEME_DEFAULT;

  /** @param {unknown} value */
  function normalizeReviewScheme(value) {
    return REVIEW_SCHEME_IDS.includes(/** @type {string} */ (value)) ? value : REVIEW_SCHEME_DEFAULT;
  }

  function reviewSchemeIconStyle() {
    return REVIEW_SCHEME_ICONS[reviewSchemeId] || '';
  }

  function reviewSchemeLevelPills() {
    return !!REVIEW_SCHEME_LEVEL_PILLS[reviewSchemeId];
  }

  /** Spine color. Chip paint comes from the scheme class. */
  function reviewRoleColor(role) {
    return 'var(--scheme-' + role + ')';
  }

  /**
   * @param {string} role
   */
  function reviewSchemeGlyph(role) {
    const style = reviewSchemeIconStyle();
    const paths = REVIEW_SCHEME_ICON_PATHS[role];
    if (!style || !paths) {
      return null;
    }
    const plate = el('span', 'review-scheme-plate is-' + style);
    plate.append(reviewSvgIcon('review-scheme-glyph', paths[style] || paths.fill));
    return plate;
  }

  /**
   * @param {HTMLElement} chip
   * @param {string} role
   */
  function dressReviewChip(chip, role) {
    chip.classList.add('is-role-' + role);
    const style = reviewSchemeIconStyle();
    if (!style) {
      return;
    }
    if (role === 'mr') {
      const existing = chip.querySelector(':scope > .review-ico');
      if (existing) {
        const plate = el('span', 'review-scheme-plate is-' + style);
        existing.classList.add('review-scheme-glyph');
        existing.replaceWith(plate);
        plate.append(existing);
        return;
      }
    }
    const glyph = reviewSchemeGlyph(role);
    if (glyph) {
      chip.prepend(glyph);
    }
  }

  /**
   * @param {{ isMr?: boolean, isReviewRoot?: boolean, isExplainRoot?: boolean, isExplain?: boolean, isRereview?: boolean, isStudy?: boolean } | null | undefined} msg
   */
  function reviewChipFallback(msg) {
    if (!msg) {
      return '';
    }
    if (msg.isMr) {
      return reviewRoleColor('mr');
    }
    if (msg.isExplainRoot || msg.isExplain) {
      return reviewRoleColor('explain');
    }
    if (msg.isRereview) {
      return reviewRoleColor('rereview');
    }
    if (msg.isStudy) {
      return reviewRoleColor('study');
    }
    if (msg.isReviewRoot) {
      return reviewRoleColor('review');
    }
    return REVIEW_SKEL_COLOR;
  }

  /**
   * @param {string} pageId
   * @returns {'initial' | 'older' | 'newer' | ''}
   */
  function reviewPaintEdge(pageId) {
    if (reviewLoadPending && reviewLoadPending.pageId === pageId) {
      return reviewLoadPending.edge;
    }
    if (!reviewState || reviewState.pageId !== pageId) {
      return 'initial';
    }
    const marked = reviewState.loadingEdge;
    if (marked === 'initial' || marked === 'older' || marked === 'newer') {
      return marked;
    }
    if (reviewState.loading && (!reviewState.messages || reviewState.messages.length === 0)) {
      return 'initial';
    }
    return '';
  }

  /** @param {string} pageId */
  function reviewLoadsBusy(pageId) {
    const painted = reviewPaintEdge(pageId);
    if (painted === 'older' || painted === 'newer' || painted === 'initial') {
      return true;
    }
    return !!(reviewThreadLoadPending && reviewThreadLoadPending.pageId === pageId);
  }

  /**
   * @param {string} pageId
   * @param {'initial' | 'older' | 'newer'} edge
   */
  function requestReviewChannelLoad(pageId, edge) {
    if (reviewPaintEdge(pageId)) {
      return;
    }
    if (reviewThreadLoadPending && reviewThreadLoadPending.pageId === pageId) {
      return;
    }
    reviewLoadPending = { pageId, edge };
    const type =
      edge === 'older' ? 'reviewLoadOlder' : edge === 'newer' ? 'reviewLoadNewer' : 'reviewLoad';
    vscode.postMessage(edge === 'initial' ? { type, pageId, force: true } : { type, pageId });
    paintReviewPage();
  }

  /**
   * @param {string} width
   * @param {number} delayMs
   */
  function reviewSkeletonBar(width, delayMs) {
    const bar = el('span', 'review-skel-bar');
    bar.style.width = width;
    bar.style.animationDelay = delayMs + 'ms';
    return bar;
  }

  /**
   * @param {string} width
   * @param {number} delayMs
   * @param {boolean} child
   */
  function reviewSkeletonPlain(width, delayMs, child) {
    const preview = el('div', 'review-plain is-skel' + (child ? ' is-child' : ''));
    const ico = el('span', 'review-plain-ico review-skel-ico');
    ico.style.animationDelay = delayMs + 'ms';
    preview.append(ico, reviewSkeletonBar(width, delayMs));
    return preview;
  }

  /**
   * @param {string} pageId
   * @returns {{ title: string, draft?: boolean } | null}
   */
  function activePendingMr(pageId) {
    if (reviewState && reviewState.pageId === pageId && reviewState.pendingMr && reviewState.pendingMr.title) {
      return reviewState.pendingMr;
    }
    if (localPendingMr && localPendingMr.pageId === pageId) {
      return localPendingMr;
    }
    return null;
  }

  /** @param {string} pageId */
  function activePendingReviewId(pageId) {
    if (reviewState && reviewState.pageId === pageId && reviewState.pendingReviewId) {
      return reviewState.pendingReviewId;
    }
    if (localPendingReview && localPendingReview.pageId === pageId) {
      return localPendingReview.messageId;
    }
    return '';
  }

  /** @param {string} pageId */
  function activePendingRoot(pageId) {
    if (reviewState && reviewState.pageId === pageId && reviewState.pendingRoot && reviewState.pendingRoot.branch) {
      return reviewState.pendingRoot;
    }
    if (localPendingRoot && localPendingRoot.pageId === pageId) {
      return localPendingRoot;
    }
    return null;
  }

  /** @param {string} pageId */
  function activePendingExplainId(pageId) {
    if (reviewState && reviewState.pageId === pageId && reviewState.pendingExplainId) {
      return reviewState.pendingExplainId;
    }
    if (localPendingExplain && localPendingExplain.pageId === pageId) {
      return localPendingExplain.messageId;
    }
    return '';
  }

  /** @param {string} pageId */
  function activePendingNeurofixId(pageId) {
    if (reviewState && reviewState.pageId === pageId && reviewState.pendingNeurofixId) {
      return reviewState.pendingNeurofixId;
    }
    if (localPendingNeurofix && localPendingNeurofix.pageId === pageId) {
      return localPendingNeurofix.messageId;
    }
    return '';
  }

  function activePendingExplainRoot(pageId) {
    if (
      reviewState &&
      reviewState.pageId === pageId &&
      reviewState.pendingExplainRoot &&
      reviewState.pendingExplainRoot.branch
    ) {
      return reviewState.pendingExplainRoot;
    }
    if (localPendingExplainRoot && localPendingExplainRoot.pageId === pageId) {
      return localPendingExplainRoot;
    }
    return null;
  }

  /**
   * @param {string} pageId
   * @param {string} title
   * @param {boolean} draft
   */
  function beginLocalMrSkeleton(pageId, title, draft) {
    localPendingMr = {
      pageId,
      title,
      draft: !!draft,
    };
    if (activePage()?.id === pageId) {
      paintReviewPage();
    }
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   */
  function beginLocalReviewSkeleton(pageId, messageId) {
    if (!pageId || !messageId) {
      return;
    }
    localPendingReview = {
      pageId,
      messageId,
    };
    reviewCollapsed.delete(messageId);
    if (activePage()?.id === pageId) {
      paintReviewPage();
    }
  }

  /**
   * @param {string} pageId
   * @param {string} branch
   */
  function beginLocalRootSkeleton(pageId, branch) {
    if (!pageId) {
      return;
    }
    localPendingRoot = {
      pageId,
      branch: branch || '…',
    };
    if (activePage()?.id === pageId) {
      paintReviewPage();
    }
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   */
  function beginLocalExplainSkeleton(pageId, messageId) {
    if (!pageId || !messageId) {
      return;
    }
    localPendingExplain = { pageId, messageId };
    reviewCollapsed.delete(messageId);
    if (activePage()?.id === pageId) {
      paintReviewPage();
    }
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   */
  function beginLocalNeurofixSkeleton(pageId, messageId) {
    if (!pageId || !messageId) {
      return;
    }
    localPendingNeurofix = { pageId, messageId };
    reviewCollapsed.delete(reviewFoldParentId(messageId));
    if (activePage()?.id === pageId) {
      paintReviewPage();
    }
  }

  function beginLocalExplainRootSkeleton(pageId, branch) {
    if (!pageId) {
      return;
    }
    localPendingExplainRoot = { pageId, branch: branch || '…' };
    if (activePage()?.id === pageId) {
      paintReviewPage();
    }
  }

  /** @param {'mr' | 'review' | 'root' | 'neurofix'} kind */
  function noteReviewSkeletonScroll(kind) {
    const pageId = activePage()?.id || '';
    const token =
      kind === 'review'
        ? 'review:' + activePendingReviewId(pageId)
        : kind === 'neurofix'
          ? 'neurofix:' + activePendingNeurofixId(pageId)
          : kind === 'root'
            ? 'root:' + (activePendingRoot(pageId)?.branch || '')
            : 'mr:' + (activePendingMr(pageId)?.title || '');
    if (!token || token === reviewSkelShown) {
      return;
    }
    reviewSkelShown = token;
    const node = root.querySelector('[data-review-skel="' + kind + '"]');
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * @param {{ title: string, draft?: boolean }} pending
   * @param {boolean} leadingGap
   */
  function renderReviewMrSkeleton(pending, leadingGap) {
    const row = el('div', 'review-node is-mr is-skel' + (leadingGap ? ' has-gap' : ''));
    row.dataset.reviewSkel = 'mr';
    row.style.setProperty('--link-color', reviewRoleColor('mr'));
    row.setAttribute('aria-busy', 'true');
    row.append(
      linkElbow(reviewElbowMid({ leadingGap, hasStamp: false, contentHalf: 20 }), ''),
    );
    const chip = el('div', 'review-chip is-mr-pill is-skel');
    chip.append(el('span', 'review-skel-ico'), reviewSkeletonBar(pending.draft ? '52px' : '36px', 0));
    const side = el('div', 'review-side is-skel');
    side.append(el('span', 'review-skel-ico'));
    const chipWrap = el('div', 'review-chip-wrap');
    chipWrap.append(chip, side);
    const title = reviewSkeletonBar('180px', 80);
    title.classList.add('review-skel-title');
    const head = el('div', 'review-mr-head');
    head.append(chipWrap, title);
    const body = el('div', 'review-body');
    body.append(head);
    row.append(body);
    return row;
  }

  /**
   * @param {{ branch: string }} pending
   * @param {boolean} leadingGap
   * @param {string} color
   */
  function renderReviewRootSkeleton(pending, leadingGap, color) {
    const row = el('div', 'review-node is-review-root is-skel' + (leadingGap ? ' has-gap' : ''));
    row.dataset.reviewSkel = 'root';
    row.style.setProperty('--link-color', color || reviewRoleColor('review'));
    row.setAttribute('aria-busy', 'true');
    row.append(
      linkElbow(reviewElbowMid({ leadingGap, hasStamp: true, contentHalf: 20 }), ''),
    );
    const branchOpts = reviewStampOpts(pending.branch, '');
    const stamp = renderReviewStamp('', branchOpts.name, { own: branchOpts.checkout });
    const dateBar = reviewSkeletonBar('72px', 0);
    dateBar.classList.add('review-stamp-date');
    stamp.prepend(dateBar);
    const chip = el('div', 'review-chip is-review-pill is-skel');
    chip.append(el('span', 'review-skel-ico'), reviewSkeletonBar('96px', 40));
    const chipWrap = el('div', 'review-chip-wrap');
    chipWrap.append(chip);
    const head = el('div', 'review-mr-head');
    head.append(chipWrap);
    const body = el('div', 'review-body');
    body.append(stamp, head);
    row.append(body);
    return row;
  }

  /**
   * @param {string} color
   * @param {{ withStamp?: boolean, branch?: string }} [opts]
   */
  function renderReviewReplySkeleton(color, opts) {
    const withStamp = !!opts?.withStamp;
    const row = el('div', 'review-reply-node has-gap is-skel');
    row.dataset.reviewSkel = 'review';
    row.style.setProperty('--link-color', color || reviewRoleColor('review'));
    row.setAttribute('aria-busy', 'true');
    row.append(
      linkElbow(
        reviewElbowMid({ leadingGap: true, hasStamp: withStamp, contentHalf: 17 }),
        '',
      ),
    );
    const body = el('div', 'review-body');
    if (withStamp) {
      const branchOpts = reviewStampOpts(opts?.branch, '');
      const stamp = renderReviewStamp('', branchOpts.name, {
        own: branchOpts.checkout,
        reveal: true,
      });
      const dateBar = reviewSkeletonBar('72px', 0);
      dateBar.classList.add('review-stamp-date');
      stamp.prepend(dateBar);
      body.append(stamp);
    }
    const chip = el('div', 'review-chip is-review-pill is-skel');
    chip.append(el('span', 'review-skel-ico'), reviewSkeletonBar('96px', 40));
    const chipWrap = el('div', 'review-chip-wrap');
    chipWrap.append(chip);
    body.append(chipWrap);
    row.append(body);
    return row;
  }

  /**
   * Green fix chip while neurofix is running.
   * @param {string} nextColor
   */
  function renderReviewFixSkeleton(nextColor) {
    const row = el('div', 'review-reply-node is-fix has-gap is-skel');
    row.dataset.reviewSkel = 'neurofix';
    row.style.setProperty('--link-color', reviewRoleColor('neurofix'));
    row.setAttribute('aria-busy', 'true');
    row.append(
      linkElbow(
        reviewElbowMid({ leadingGap: true, hasStamp: true, contentHalf: 17 }),
        nextColor,
      ),
    );
    const body = el('div', 'review-body');
    const stamp = el('div', 'review-stamp');
    const dateBar = reviewSkeletonBar('72px', 0);
    dateBar.classList.add('review-stamp-date');
    stamp.append(dateBar);
    body.append(stamp);
    const chip = el('div', 'review-chip is-review-pill is-fix is-skel');
    chip.append(el('span', 'review-skel-ico'), reviewSkeletonBar('96px', 40));
    body.append(chip);
    row.append(body);
    return row;
  }

  /**
   * @param {NonNullable<ReviewState['messages']>[number] | null | undefined} msg
   */
  function reviewMessageColor(msg) {
    if (!msg) {
      return '';
    }
    return msg.color || reviewChipFallback(msg);
  }

  const REVIEW_ARROW_UP =
    'M12 4.83582L5.79291 11.0429L7.20712 12.4571L12 7.66424L16.7929 12.4571L18.2071 11.0429L12 4.83582ZM12 10.4857L5.79291 16.6928L7.20712 18.107L12 13.3141L16.7929 18.107L18.2071 16.6928L12 10.4857Z';
  const REVIEW_ARROW_DOWN =
    'M12 19.1642L18.2071 12.9571L16.7929 11.5429L12 16.3358L7.20711 11.5429L5.79289 12.9571L12 19.1642ZM12 13.5143L18.2071 7.30722L16.7929 5.89301L12 10.6859L7.20711 5.89301L5.79289 7.30722L12 13.5143Z';

  /** @param {'older' | 'newer'} direction */
  function reviewArrowIcon(direction) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'review-load-chip-ico');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', direction === 'older' ? REVIEW_ARROW_UP : REVIEW_ARROW_DOWN);
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }

  /**
   * @param {'channel' | 'thread'} where
   * @param {'older' | 'newer'} direction
   * @param {{ leadingGap: boolean, nextColor: string, spineColor: string, label: string, disabled: boolean, onClick: () => void }} opts
   */
  function renderReviewLoadChip(where, direction, opts) {
    const row = el(
      'div',
      (where === 'channel' ? 'review-node' : 'review-reply-node') +
        (opts.leadingGap ? ' has-gap' : '') +
        ' review-load-node',
    );
    row.style.setProperty('--link-color', opts.spineColor || '#6e6e6e');
    row.append(
      linkElbow(
        reviewElbowMid({ leadingGap: opts.leadingGap, hasStamp: false, contentHalf: 11 }),
        opts.nextColor || '',
      ),
    );
    const button = el('button', 'review-load-chip');
    button.type = 'button';
    button.setAttribute('aria-label', opts.label);
    button.disabled = !!opts.disabled;
    button.append(reviewArrowIcon(direction));
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) {
        return;
      }
      opts.onClick();
    });
    const body = el('div', 'review-body');
    body.append(button);
    row.append(body);
    return row;
  }

  /**
   * Gray parent row from the channel pack, without its child thread.
   * @param {string} nextColor
   */
  function renderReviewThreadLoadSkeleton(nextColor) {
    const row = el('div', 'review-reply-node has-gap is-skel');
    row.style.setProperty('--link-color', REVIEW_SKEL_COLOR);
    row.setAttribute('aria-busy', 'true');
    row.setAttribute('aria-hidden', 'true');
    row.append(
      linkElbow(
        reviewElbowMid({ leadingGap: true, hasStamp: false, contentHalf: 12 }),
        nextColor || '',
      ),
    );
    const body = el('div', 'review-body');
    body.append(reviewSkeletonPlain('168px', 0, false));
    row.append(body);
    return row;
  }

  /**
   * Three plain parents, each with three plain replies, appended into an existing tree.
   * @param {HTMLElement} host
   * @param {boolean} leadingGapFirst
   * @param {string} continueColor stem under the last parent, when a real node follows
   */
  function appendReviewSkeletonPack(host, leadingGapFirst, continueColor) {
    const parentWidths = ['168px', '124px', '148px'];
    const childWidths = [
      ['96px', '72px', '88px'],
      ['80px', '112px', '64px'],
      ['104px', '76px', '92px'],
    ];
    for (let parent = 0; parent < REVIEW_SKELETON_PARENTS; parent += 1) {
      const leadingGap = parent === 0 ? leadingGapFirst : true;
      const isLast = parent === REVIEW_SKELETON_PARENTS - 1;
      const row = el(
        'div',
        'review-node is-plain is-skel' +
          (leadingGap ? ' has-gap' : '') +
          (parent === 0 ? ' review-skel' : ''),
      );
      row.style.setProperty('--link-color', REVIEW_SKEL_COLOR);
      row.setAttribute('aria-hidden', 'true');
      const nextColor = isLast ? continueColor || '' : REVIEW_SKEL_COLOR;
      row.append(
        linkElbow(
          reviewElbowMid({ leadingGap, hasStamp: false, contentHalf: 12 }),
          nextColor,
        ),
      );
      const body = el('div', 'review-body');
      body.append(reviewSkeletonPlain(parentWidths[parent], parent * 90, false));
      const children = el('div', 'review-children');
      const slide = el('div', 'review-children-slide');
      for (let child = 0; child < REVIEW_SKELETON_CHILDREN; child += 1) {
        const reply = el('div', 'review-reply-node has-gap is-skel');
        reply.style.setProperty('--link-color', REVIEW_SKEL_COLOR);
        const childNext = child < REVIEW_SKELETON_CHILDREN - 1 ? REVIEW_SKEL_COLOR : '';
        reply.append(
          linkElbow(
            reviewElbowMid({ leadingGap: true, hasStamp: false, contentHalf: 12 }),
            childNext,
          ),
        );
        const childBody = el('div', 'review-body');
        childBody.append(
          reviewSkeletonPlain(childWidths[parent][child], parent * 90 + (child + 1) * 70, true),
        );
        reply.append(childBody);
        slide.append(reply);
      }
      children.append(slide);
      body.append(children);
      row.append(body);
      host.append(row);
    }
  }

  /** Three plain parents, each with three plain replies. */
  function renderReviewSkeletonTree() {
    const tree = el('div', 'review-tree review-skel');
    tree.setAttribute('aria-hidden', 'true');
    appendReviewSkeletonPack(tree, false, '');
    return tree;
  }

  /** Fold a closed MR the first time it is seen, and again when it becomes closed. */
  function applyClosedMrFolds() {
    const pageId = activePage()?.id || '';
    if (!reviewState || reviewState.pageId !== pageId) {
      return;
    }
    for (const msg of reviewState.messages || []) {
      if (!msg.isMr) {
        continue;
      }
      const closed = msg.status === 'closed';
      const prev = reviewClosedSeen.get(msg.id);
      reviewClosedSeen.set(msg.id, closed);
      if (closed && prev !== true) {
        reviewCollapsed.add(msg.id);
      }
    }
  }

  function dismissMissingReviewFile() {
    if (!reviewFileView) {
      return;
    }
    const messageId = reviewFileView.messageId;
    if (findReviewReply(messageId)) {
      return;
    }
    const rootMsg = (reviewState?.messages || []).find((item) => item.id === messageId);
    if (rootMsg && (rootMsg.isReviewRoot || rootMsg.isExplainRoot || rootMsg.hasFile)) {
      return;
    }
    reviewFileView = null;
    mountReviewFile();
    if (explainFileView && explainFileView.messageId === messageId) {
      if (rootMsg && (rootMsg.isExplainRoot || rootMsg.hasFile)) {
        return;
      }
      if (findReviewReply(messageId)?.isExplain) {
        return;
      }
      explainFileView = null;
      mountExplainFile();
    }
  }

  /** CSS `ease`: cubic-bezier(0.25, 0.1, 0.25, 1). */
  function reviewScrollEase(t) {
    const x1 = 0.25;
    const y1 = 0.1;
    const x2 = 0.25;
    const y2 = 1;
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (u) => ((ax * u + bx) * u + cx) * u;
    const sampleY = (u) => ((ay * u + by) * u + cy) * u;
    const sampleDX = (u) => (3 * ax * u + 2 * bx) * u + cx;
    let u = t;
    for (let i = 0; i < 6; i += 1) {
      const dx = sampleDX(u);
      const delta = sampleX(u) - t;
      if (Math.abs(delta) < 1e-4 || Math.abs(dx) < 1e-6) {
        break;
      }
      u = Math.min(1, Math.max(0, u - delta / dx));
    }
    return sampleY(u);
  }

  /**
   * Glide from wherever the list just appeared to the newest rows.
   * @param {number} token
   */
  function animateReviewListToEnd(token) {
    const node = docScroller();
    const from = node.scrollTop || 0;
    const to = Math.max(0, node.scrollHeight - node.clientHeight);
    if (to - from < 1) {
      return;
    }
    const gen = ++scrollTrackGen;
    suppressScrollTrack = true;
    const start = performance.now();
    const duration = 200;
    const step = (now) => {
      if (token !== reviewScrollAnim || scrollTrackGen !== gen) {
        return;
      }
      const t = Math.min(1, (now - start) / duration);
      const eased = reviewScrollEase(t);
      const top = from + (to - from) * eased;
      node.scrollTop = top;
      heldScroll = top;
      if (t < 1) {
        requestAnimationFrame(step);
        return;
      }
      node.scrollTop = to;
      heldScroll = to;
      releaseScrollTrack(gen);
    };
    step(performance.now());
  }

  /** List stays where it painted. The glide starts on the next frame. */
  function scrollReviewListToEnd() {
    reviewPinEnd = true;
    const token = ++reviewScrollAnim;
    requestAnimationFrame(() => {
      if (token !== reviewScrollAnim) {
        return;
      }
      if (isSliding) {
        return;
      }
      reviewPinEnd = false;
      animateReviewListToEnd(token);
    });
  }

  function paintReviewPage() {
    const page = activePage();
    const pageId = page?.id || '';
    if (pageId && (!reviewState || reviewState.pageId !== pageId)) {
      const cached = reviewByPage.get(pageId);
      if (cached) {
        reviewState = cached;
      }
    }
    applyClosedMrFolds();
    const pendingReviewId = activePendingReviewId(pageId);
    if (pendingReviewId) {
      reviewCollapsed.delete(pendingReviewId);
    }
    const pendingExplainId = activePendingExplainId(pageId);
    if (pendingExplainId) {
      reviewCollapsed.delete(pendingExplainId);
    }
    const pendingNeurofixId = activePendingNeurofixId(pageId);
    if (pendingNeurofixId) {
      reviewCollapsed.delete(reviewFoldParentId(pendingNeurofixId));
    }
    const pendingMr = activePendingMr(pageId);
    const pendingRoot = activePendingRoot(pageId);
    const pendingExplainRoot = activePendingExplainRoot(pageId);
    if (
      !pendingMr &&
      !pendingRoot &&
      !pendingReviewId &&
      !pendingExplainRoot &&
      !pendingExplainId &&
      !pendingNeurofixId
    ) {
      reviewSkelShown = '';
    }
    setCollapseButton();
    dismissMissingReviewFile();
    const edge = reviewPaintEdge(pageId);
    const samePage = !!(reviewState && reviewState.pageId === pageId);
    const keepScroll = samePage && edge !== 'initial' ? currentDocScroll() : 0;
    const structureKey = reviewStructureKey(pageId, edge);
    if (
      structureKey &&
      structureKey === reviewStructureKeyValue &&
      root.classList.contains('review-page') &&
      root.querySelector('.review-tree')
    ) {
      syncReviewCollapsed();
      syncReviewFileMark();
      return;
    }
    reviewStructureKeyValue = structureKey;
    root.textContent = '';
    root.removeAttribute('data-syn3-context');
    root.className = 'map-page review-page review-scheme-' + reviewSchemeId;
    clearDropHighlights();
    if (
      edge ||
      pendingMr ||
      pendingRoot ||
      pendingReviewId ||
      pendingExplainRoot ||
      pendingExplainId ||
      pendingNeurofixId ||
      (reviewThreadLoadPending && reviewThreadLoadPending.pageId === pageId)
    ) {
      root.setAttribute('aria-busy', 'true');
    } else {
      root.removeAttribute('aria-busy');
    }
    if (edge === 'initial') {
      reviewScrollToEnd = true;
      root.append(renderReviewSkeletonTree());
      if (
        pageId &&
        (!reviewState || reviewState.pageId !== pageId) &&
        !reviewAutoLoad.has(pageId)
      ) {
        reviewAutoLoad.add(pageId);
        vscode.postMessage({ type: 'reviewLoad', pageId });
      }
      return;
    }
    if (
      reviewState &&
      reviewState.error &&
      !(isReviewFetchError(reviewState.error) && reviewStateMessages(reviewState).length > 0)
    ) {
      const box = el('div', 'review-error');
      box.append(el('div', 'review-error-text', reviewState.error || t('reviewSyncError')));
      const retry = el('button', 'review-btn', t('reviewRetry'));
      retry.type = 'button';
      retry.addEventListener('click', () => {
        requestReviewChannelLoad(pageId, 'initial');
      });
      box.append(retry);
      root.append(box);
      reviewScrollToEnd = false;
      if (keepScroll) {
        applyDocScroll(keepScroll);
      }
      return;
    }
    if (!reviewState || reviewState.empty || !reviewState.messages || reviewState.messages.length === 0) {
      reviewScrollToEnd = false;
      if (!pendingMr && !pendingRoot && !pendingExplainRoot) {
        root.append(el('div', 'empty', t('reviewEmpty')));
        return;
      }
      const tree = el('div', 'review-tree');
      if (pendingMr) {
        tree.append(renderReviewMrSkeleton(pendingMr, false));
        root.append(tree);
        noteReviewSkeletonScroll('mr');
      } else if (pendingRoot) {
        tree.append(renderReviewRootSkeleton(pendingRoot, false, reviewRoleColor('review')));
        root.append(tree);
        noteReviewSkeletonScroll('root');
      } else if (pendingExplainRoot) {
        tree.append(
          renderReviewRootSkeleton(pendingExplainRoot, false, reviewRoleColor('explain')),
        );
        root.append(tree);
        noteReviewSkeletonScroll('root');
      }
      return;
    }
    if (reviewState.contentBlocked) {
      const warn = el('div', 'review-content-blocked');
      warn.append(el('div', 'review-content-blocked-text', t('reviewContentBlocked')));
      const howto = el('button', 'review-howto-link', t('reviewHowToConnect'));
      howto.type = 'button';
      howto.addEventListener('click', () => {
        vscode.postMessage({ type: 'reviewOpenSetupDoc' });
      });
      const retry = el('button', 'review-btn', t('reviewRetry'));
      retry.type = 'button';
      retry.addEventListener('click', () => {
        requestReviewChannelLoad(pageId, 'initial');
      });
      const actions = el('div', 'review-content-blocked-actions');
      actions.append(howto, retry);
      warn.append(actions);
      root.append(warn);
    }
    const messages = reviewState.messages;
    const gapId = reviewState.gapBeforeMessageId || '';
    const showOlderSkel = edge === 'older';
    const showOlderChip = !!(reviewState.canLoadOlder && edge !== 'older');
    const tree = el('div', 'review-tree');
    const first = messages[0];
    const firstColor = reviewMessageColor(first) || '#6e6e6e';
    const firstIsNewerGap = !!(gapId && first && first.id === gapId && edge === 'newer');
    if (showOlderSkel) {
      appendReviewSkeletonPack(tree, false, firstIsNewerGap ? REVIEW_SKEL_COLOR : firstColor);
    } else if (showOlderChip) {
      tree.append(
        renderReviewLoadChip('channel', 'older', {
          leadingGap: false,
          nextColor: firstIsNewerGap ? REVIEW_SKEL_COLOR : firstColor,
          spineColor: firstColor,
          label: t('reviewLoadOlder'),
          disabled: reviewLoadsBusy(pageId),
          onClick: () => requestReviewChannelLoad(pageId, 'older'),
        }),
      );
    }
    let preceded = showOlderSkel || showOlderChip;
    messages.forEach((msg, index) => {
      if (gapId && msg.id === gapId) {
        const spine = reviewMessageColor(msg) || '#6e6e6e';
        if (edge === 'newer') {
          appendReviewSkeletonPack(tree, true, spine);
        } else if (reviewState.canLoadNewer) {
          tree.append(
            renderReviewLoadChip('channel', 'newer', {
              leadingGap: true,
              nextColor: spine,
              spineColor: spine,
              label: t('reviewLoadNewer'),
              disabled: reviewLoadsBusy(pageId),
              onClick: () => requestReviewChannelLoad(pageId, 'newer'),
            }),
          );
        }
        preceded = true;
      }
      const next = messages[index + 1];
      const nextColor = next
        ? reviewMessageColor(next)
        : pendingMr
          ? reviewRoleColor('mr')
          : pendingRoot
            ? reviewRoleColor('review')
            : pendingExplainRoot
              ? reviewRoleColor('explain')
              : '';
      tree.append(renderReviewNode(msg, pageId, index > 0 || preceded, nextColor));
      preceded = true;
    });
    if (pendingMr) {
      tree.append(renderReviewMrSkeleton(pendingMr, messages.length > 0));
    } else if (pendingRoot) {
      tree.append(
        renderReviewRootSkeleton(pendingRoot, messages.length > 0, reviewRoleColor('review')),
      );
    } else if (pendingExplainRoot) {
      tree.append(
        renderReviewRootSkeleton(
          pendingExplainRoot,
          messages.length > 0,
          reviewRoleColor('explain'),
        ),
      );
    }
    if (!gapId && (edge === 'newer' || reviewState.canLoadNewer)) {
      const last = messages[messages.length - 1];
      const spine =
        reviewMessageColor(last) ||
        (pendingMr
          ? reviewRoleColor('mr')
          : pendingRoot
            ? reviewRoleColor('review')
            : pendingExplainRoot
              ? reviewRoleColor('explain')
              : REVIEW_SKEL_COLOR);
      const leadingGap = tree.childElementCount > 0;
      if (edge === 'newer') {
        appendReviewSkeletonPack(tree, leadingGap, '');
      } else {
        tree.append(
          renderReviewLoadChip('channel', 'newer', {
            leadingGap,
            nextColor: '',
            spineColor: spine,
            label: t('reviewLoadNewer'),
            disabled: reviewLoadsBusy(pageId),
            onClick: () => requestReviewChannelLoad(pageId, 'newer'),
          }),
        );
      }
    }
    root.append(tree);
    const pinEnd = reviewScrollToEnd && !edge && !reviewState.focusMessageId;
    if (pinEnd) {
      reviewScrollToEnd = false;
      scrollReviewListToEnd();
    } else if (keepScroll) {
      applyDocScroll(keepScroll);
    }
    if (reviewState.focusMessageId) {
      reviewScrollToEnd = false;
      const focused = root.querySelector('[data-review-id="' + reviewState.focusMessageId + '"]');
      if (focused instanceof HTMLElement) {
        focused.classList.add('is-focus');
        focused.scrollIntoView({ block: 'nearest' });
        vscode.postMessage({ type: 'reviewClearFocus', pageId });
      }
    } else if (edge === 'older' || edge === 'newer') {
      reviewScrollToEnd = false;
      const skel = root.querySelector('.review-skel');
      if (skel instanceof HTMLElement) {
        skel.scrollIntoView({ block: 'nearest' });
      }
    } else if (
      pendingReviewId ||
      pendingExplainId ||
      pendingNeurofixId ||
      pendingMr ||
      pendingRoot ||
      pendingExplainRoot
    ) {
      noteReviewSkeletonScroll(
        pendingNeurofixId
          ? 'neurofix'
          : pendingReviewId || pendingExplainId
            ? 'review'
            : pendingMr
              ? 'mr'
              : 'root',
      );
    }
    syncReviewFileMark();
  }

  /**
   * Fold flags are omitted so toggling them can reuse the mounted tree.
   * @param {string} pageId
   * @param {'initial' | 'older' | 'newer' | ''} edge
   */
  function reviewStructureKey(pageId, edge) {
    const state = reviewState;
    if (!state || state.pageId !== pageId || edge === 'initial') {
      return '';
    }
    /** @type {string[]} */
    const chunks = [
      pageId,
      reviewSchemeId,
      edge || '',
      state.error || '',
      state.empty ? '1' : '0',
      state.contentBlocked ? '1' : '0',
      state.canLoadOlder ? '1' : '0',
      state.canLoadNewer ? '1' : '0',
      reviewThreadLoadPending && reviewThreadLoadPending.pageId === pageId
        ? reviewThreadLoadPending.messageId + ':' + reviewThreadLoadPending.direction
        : '',
      state.gapBeforeMessageId || '',
      state.focusMessageId || '',
      state.checkout || '',
      [...reviewTitleExpanded].sort().join(','),
      [...reviewPlainExpanded].sort().join(','),
      activePendingReviewId(pageId),
      activePendingExplainId(pageId),
      activePendingNeurofixId(pageId),
      (() => {
        const pending = activePendingMr(pageId);
        return pending ? (pending.draft ? 'd:' : 'm:') + (pending.title || '') : '';
      })(),
      (() => {
        const pending = activePendingRoot(pageId);
        return pending ? 'r:' + (pending.branch || '') : '';
      })(),
      (() => {
        const pending = activePendingExplainRoot(pageId);
        return pending ? 'e:' + (pending.branch || '') : '';
      })(),
    ];
    for (const msg of state.messages || []) {
      chunks.push(
        msg.id,
        msg.isReviewRoot ? 'R' : '',
        msg.isExplainRoot ? 'W' : '',
        msg.color || '',
        msg.title || '',
        msg.pillLabel || '',
        msg.draft ? 'd' : '',
        msg.status || '',
        msg.reviewStatus || '',
        msg.locked ? 'L' : '',
        msg.timestamp || '',
        msg.branch || '',
        msg.hasThread ? 't' : '',
        msg.repliesHasMore ? 'm' : '',
        msg.repliesHasNewer ? 'n' : '',
        msg.gapBeforeReplyId || '',
        msg.contentMissing ? 'x' : '',
        msg.content || '',
      );
      for (const reply of msg.replies || []) {
        chunks.push(
          reply.id,
          reply.pillLabel || '',
          reply.status || '-',
          reply.isPill ? 'p' : '',
          reply.timestamp || '',
          reply.hasFile ? 'f' : '',
          reply.filename || '',
          reply.contentMissing ? 'x' : '',
          reply.content || '',
        );
      }
    }
    return chunks.join('\u001f');
  }

  /** Fold or open every review thread that has a caret. */
  function setAllReviewCollapsed(collapsed) {
    const items = foldableReviewMessages();
    if (items.length === 0) {
      return;
    }
    for (const msg of items) {
      if (collapsed) {
        reviewCollapsed.add(msg.id);
      } else {
        reviewCollapsed.delete(msg.id);
      }
    }
    paintReviewPage();
  }

  /** Parent body without the `lock:` meta line. */
  function reviewDisplayText(content) {
    if (typeof content !== 'string') {
      return '';
    }
    return content
      .split(/\r?\n/)
      .filter((line) => !/^lock:\s*(true|false)\s*$/i.test(line.trim()))
      .filter((line) => !/^(?:Branch|Ветка)\s*:/i.test(line.trim()))
      .join('\n')
      .trim();
  }

  /** @param {string} messageId */
  function toggleReviewCollapsed(messageId) {
    const msg = (reviewState?.messages || []).find((item) => item.id === messageId);
    if (msg?.locked) {
      flashReviewLock(messageId);
      return;
    }
    if (reviewCollapsed.has(messageId)) {
      reviewCollapsed.delete(messageId);
    } else {
      reviewCollapsed.add(messageId);
    }
    paintReviewPage();
  }

  function syncReviewCollapsed() {
    root.querySelectorAll('.review-node[data-review-id]').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const collapsed = reviewCollapsed.has(node.dataset.reviewId || '');
      node.classList.toggle('is-collapsed', collapsed);
      const tri = node.querySelector(
        ':scope > .review-body > .review-mr-head .link-chip-tri, :scope > .review-body > .review-plain > .link-chip-tri, :scope > .review-body > .review-chip-wrap .review-talk-chip > .link-chip-tri',
      );
      if (tri) {
        tri.classList.toggle('is-collapsed', collapsed);
      }
    });
  }

  function syncReviewFileMark() {
    const reviewOpen =
      reviewFileView && activePage()?.kind === 'review' ? reviewFileView.messageId : '';
    const explainOpen =
      explainFileView && activePage()?.kind === 'review' ? explainFileView.messageId : '';
    const openId = reviewOpen || explainOpen;
    root.querySelectorAll('[data-review-reply-id]').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      node.classList.toggle('is-file-open', !!openId && node.dataset.reviewReplyId === openId);
    });
    root.querySelectorAll('.review-node.is-review-root[data-review-id]').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      node.classList.toggle('is-file-open', !!openId && node.dataset.reviewId === openId);
    });
    root.querySelectorAll('.review-node.is-explain-root[data-review-id]').forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      node.classList.toggle('is-file-open', !!openId && node.dataset.reviewId === openId);
    });
  }

  /** Stamp block above content (10px * 1.2) + body gap — must match .review-stamp / .review-body. */
  const REVIEW_STAMP_BLOCK = 12;
  const REVIEW_BODY_GAP = 4;

  /**
   * Elbow mid Y like links: padding gap + optional stamp + half of the target row.
   * @param {{ leadingGap?: boolean, hasStamp?: boolean, contentHalf: number }} opts
   */
  function reviewElbowMid(opts) {
    return (
      (opts.leadingGap ? LINK_ROW_GAP : 0) +
      (opts.hasStamp ? REVIEW_STAMP_BLOCK + REVIEW_BODY_GAP : 0) +
      opts.contentHalf
    );
  }

  /**
   * @param {NonNullable<ReviewState['messages']>[number]} msg
   * @param {string} pageId
   * @param {boolean} leadingGap
   * @param {string} nextColor
   */
  function renderReviewNode(msg, pageId, leadingGap, nextColor) {
    const color = msg.color || reviewChipFallback(msg);
    const showReviewSkeleton =
      !!(msg.isMr || msg.isReviewRoot) &&
      (activePendingReviewId(pageId) === msg.id || activePendingExplainId(pageId) === msg.id);
    const canFold = reviewMessageCanFold(msg);
    const mrCanFold = !!msg.isMr && canFold;
    const rootCanFold = !!msg.isReviewRoot && canFold;
    const explainCanFold = !!msg.isExplainRoot && canFold;
    const plainCanFold = !msg.isMr && !msg.isReviewRoot && !msg.isExplainRoot && canFold;
    const collapsed = canFold && reviewCollapsed.has(msg.id);
    const plainOpen =
      !msg.isMr && !msg.isReviewRoot && !msg.isExplainRoot && reviewPlainExpanded.has(msg.id);
    const stampDate = formatReviewStamp(msg.timestamp);
    const isChipRow = !!(msg.isMr || msg.isReviewRoot || msg.isExplainRoot);
    const alwaysBranch = !!(msg.isMr || msg.isReviewRoot);
    const branchOpts = reviewStampOpts(msg.branch, isChipRow ? 'msg:' + msg.id : '');
    const revealBranch = isChipRow && !alwaysBranch && !!branchOpts.name;
    const stampBranch =
      branchOpts.name && (alwaysBranch || revealBranch || !branchOpts.checkout)
        ? branchOpts.name
        : '';
    const branchRevealId = revealBranch ? 'msg:' + msg.id : '';
    const hasStamp = !!(stampDate || stampBranch);
    const row = el(
      'div',
      'review-node' +
        (msg.isMr
          ? ' is-mr'
          : msg.isReviewRoot
            ? ' is-review-root'
            : msg.isExplainRoot
              ? ' is-explain-root'
              : msg.isTalk
                ? ' is-talk'
                : ' is-plain') +
        (leadingGap ? ' has-gap' : '') +
        (collapsed ? ' is-collapsed' : '') +
        (plainOpen ? ' is-plain-open' : ''),
    );
    row.dataset.reviewId = msg.id;
    row.style.setProperty('--link-color', color);
    row.append(
      linkElbow(
        reviewElbowMid({
          leadingGap,
          hasStamp,
          contentHalf: msg.isMr || msg.isReviewRoot || msg.isExplainRoot ? 20 : msg.isTalk ? 16 : 12,
        }),
        nextColor,
      ),
    );

    const body = el('div', 'review-body');
    if (hasStamp) {
      const stamp = stampBranch
        ? renderReviewStamp(stampDate, stampBranch, {
            own: branchOpts.checkout,
            reveal: revealBranch,
            revealId: branchRevealId,
          })
        : el('div', 'review-stamp', stampDate);
      if (msg.isReviewRoot) {
        stamp.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openReviewRootContextMenu(event.clientX, event.clientY, pageId, msg.id);
        });
      } else if (msg.isExplainRoot) {
        stamp.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openExplainContextMenu(event.clientX, event.clientY, pageId, msg.id);
        });
      }
      body.append(stamp);
    }

    if (msg.isMr) {
      const chipWrap = el('div', 'review-chip-wrap');
      const chip = el('button', 'review-chip is-mr-pill');
      chip.type = 'button';
      bindCheckoutBranchHover(chip, branchRevealId);
      chip.append(msg.status === 'closed' ? reviewClosedIcon() : reviewPrIcon());
      chip.append(el('span', 'review-chip-badge', msg.draft ? 'D: MR' : 'MR'));
      dressReviewChip(chip, 'mr');
      if (canFold) {
        const tri = el('span', 'link-chip-tri' + (collapsed ? ' is-collapsed' : ''));
        tri.append(linkCaretIcon());
        tri.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleReviewCollapsed(msg.id);
        });
        chip.append(tri);
      }
      chip.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('.link-chip-tri')) {
          return;
        }
        if (!mrCanFold) {
          return;
        }
        toggleReviewCollapsed(msg.id);
      });
      chip.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openReviewContextMenu(event.clientX, event.clientY, pageId, msg.id);
      });
      chipWrap.append(chip);
      const side = el('div', 'review-side');
      side.append(reviewPersonIcon());
      chipWrap.append(side);

      const titleText =
        msg.title ||
        (() => {
          const head =
            typeof msg.content === 'string' ? msg.content.trimStart().split('\n')[0] || '' : '';
          const match = /^\(?(?:MR_SYN3|DMR_SYN3)\)?:\s*(.*)$/.exec(head);
          return match ? match[1].trim() : '';
        })() ||
        t('reviewEmptyMessage');
      chipWrap.append(
        reviewTalkButton(
          pageId,
          msg.id,
          reviewTalkLabel(titleText),
          !!(msg.locked || msg.status === 'closed'),
        ),
      );
      const title = el(
        'button',
        'review-mr-title-text' + (reviewTitleExpanded.has(msg.id) ? ' is-expanded' : ''),
        titleText,
      );
      title.type = 'button';
      title.addEventListener('click', (event) => {
        event.stopPropagation();
        if (msg.locked) {
          flashReviewLock(msg.id);
          return;
        }
        if (reviewTitleExpanded.has(msg.id)) {
          reviewTitleExpanded.delete(msg.id);
        } else {
          reviewTitleExpanded.add(msg.id);
        }
        paintReviewPage();
      });
      title.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openReviewContextMenu(event.clientX, event.clientY, pageId, msg.id);
      });
      if (msg.webUrl) {
        title.title = msg.webUrl;
        title.addEventListener('dblclick', (event) => {
          event.preventDefault();
          vscode.postMessage({ type: 'openExternal', url: msg.webUrl });
        });
      }
      const head = el('div', 'review-mr-head');
      head.append(chipWrap);
      if (msg.locked) {
        head.append(reviewLockMark(msg.id, pageId));
      }
      head.append(title);
      body.append(head);

      if (canFold) {
        body.append(renderReviewThread(msg, pageId, true, showReviewSkeleton));
      }
    } else if (msg.isReviewRoot) {
      const chipWrap = el('div', 'review-chip-wrap');
      const chip = el('button', 'review-chip is-review-pill');
      chip.type = 'button';
      bindCheckoutBranchHover(chip, branchRevealId);
      if (!reviewSchemeIconStyle()) {
        chip.append(reviewStatusIcon(msg.reviewStatus));
      }
      const rootLabel = el('span', 'review-chip-label');
      setReviewPillText(rootLabel, msg.pillLabel || t('reviewFileTitle'));
      chip.append(rootLabel);
      dressReviewChip(chip, 'review');
      if (rootCanFold) {
        const tri = el('span', 'link-chip-tri' + (collapsed ? ' is-collapsed' : ''));
        tri.append(linkCaretIcon());
        tri.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleReviewCollapsed(msg.id);
        });
        chip.append(tri);
      }
      chip.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('.link-chip-tri')) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openReviewFileView(pageId, msg);
      });
      chip.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openReviewRootContextMenu(event.clientX, event.clientY, pageId, msg.id);
      });
      chipWrap.append(chip);
      const reviewHead = String(msg.pillLabel || '').split(/\s*\|\s*/)[0].trim();
      chipWrap.append(
        reviewTalkButton(
          pageId,
          msg.id,
          reviewTalkLabel(reviewHead || t('reviewFileTitle')),
          !!msg.locked,
        ),
      );
      chipWrap.append(reviewNeurofixButton(pageId, msg.id));

      const head = el('div', 'review-mr-head');
      head.append(chipWrap);
      if (msg.locked) {
        head.append(reviewLockMark(msg.id, pageId));
      }
      body.append(head);

      if (canFold) {
        body.append(renderReviewThread(msg, pageId, true, showReviewSkeleton));
      }
    } else if (msg.isExplainRoot) {
      const chipWrap = el('div', 'review-chip-wrap');
      const chip = el('button', 'review-chip is-review-pill is-explain-pill');
      chip.type = 'button';
      bindCheckoutBranchHover(chip, branchRevealId);
      const explainLabel = el('span', 'review-chip-label');
      setReviewPillText(explainLabel, msg.pillLabel || t('explainFileTitle'));
      chip.append(explainLabel);
      dressReviewChip(chip, 'explain');
      if (explainCanFold) {
        const tri = el('span', 'link-chip-tri' + (collapsed ? ' is-collapsed' : ''));
        tri.append(linkCaretIcon());
        tri.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleReviewCollapsed(msg.id);
        });
        chip.append(tri);
      }
      chip.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('.link-chip-tri')) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openExplainFileView(pageId, msg);
      });
      chip.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openExplainContextMenu(event.clientX, event.clientY, pageId, msg.id);
      });
      chipWrap.append(chip);
      const head = el('div', 'review-mr-head');
      head.append(chipWrap);
      body.append(head);
      if (canFold) {
        body.append(renderReviewThread(msg, pageId, true, false));
      }
    } else if (msg.isTalk) {
      const chipWrap = el('div', 'review-chip-wrap');
      let talkTri = null;
      if (plainCanFold) {
        talkTri = el('span', 'link-chip-tri' + (collapsed ? ' is-collapsed' : ''));
        talkTri.append(linkCaretIcon());
        talkTri.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleReviewCollapsed(msg.id);
        });
      }
      chipWrap.append(
        reviewTalkChip(
          msg.profileName,
          msg.avatar,
          talkTri,
          false,
          reviewTalkReplyPhrase(msg.talkSourceType, msg.talkSourceTitle),
        ),
      );
      chipWrap.append(
        reviewTalkButton(pageId, msg.id, reviewTalkMsLabel(msg.profileName), !!msg.locked),
      );
      const talkText = reviewTalkText(msg, plainOpen);
      const openTalkMenu = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openReviewMessageContextMenu(event.clientX, event.clientY, pageId, msg.id);
      };
      chipWrap.addEventListener('contextmenu', openTalkMenu);
      talkText.addEventListener('contextmenu', openTalkMenu);
      body.append(chipWrap);
      if (canFold) {
        const follow = el('div', 'review-talk-follow');
        const copy = el('div', 'review-talk-copy');
        copy.append(talkText);
        follow.append(copy);
        follow.append(renderReviewThread(msg, pageId, false, false));
        body.append(follow);
      } else {
        body.append(talkText);
      }
    } else {
      const raw = reviewDisplayText(msg.content);
      const missing = msg.contentMissing === true || !raw;
      const preview = el('button', 'review-plain' + (plainOpen ? ' is-open' : ''));
      preview.type = 'button';
      const ico = el('span', 'review-plain-ico');
      ico.append(reviewCommentIcon());
      if (plainCanFold) {
        ico.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleReviewCollapsed(msg.id);
        });
      }
      preview.append(ico);
      if (plainCanFold) {
        const tri = el('span', 'link-chip-tri' + (collapsed ? ' is-collapsed' : ''));
        tri.append(linkCaretIcon());
        tri.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleReviewCollapsed(msg.id);
        });
        preview.append(tri);
      }
      if (msg.locked) {
        preview.append(reviewLockMark(msg.id, pageId));
      }
      const text = el(
        'span',
        'review-plain-text' + (missing ? ' is-missing' : ''),
        missing ? t('reviewEmptyMessage') : raw,
      );
      preview.append(text);
      preview.addEventListener('click', () => {
        if (msg.locked) {
          flashReviewLock(msg.id);
          return;
        }
        if (reviewPlainExpanded.has(msg.id)) {
          reviewPlainExpanded.delete(msg.id);
        } else {
          reviewPlainExpanded.add(msg.id);
        }
        paintReviewPage();
      });
      preview.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openReviewMessageContextMenu(event.clientX, event.clientY, pageId, msg.id);
      });
      body.append(preview);
      if ((msg.replies && msg.replies.length) || msg.repliesHasMore || msg.repliesHasNewer) {
        body.append(renderReviewThread(msg, pageId, false));
      }
    }
    row.append(body);
    return row;
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   * @param {'older' | 'newer'} direction
   */
  function requestReviewThreadLoad(pageId, messageId, direction) {
    if (reviewPaintEdge(pageId)) {
      return;
    }
    if (reviewThreadLoadPending && reviewThreadLoadPending.pageId === pageId) {
      return;
    }
    const pending = { pageId, messageId, direction, armed: false };
    reviewThreadLoadPending = pending;
    vscode.postMessage({
      type: 'reviewLoadThread',
      pageId,
      messageId,
      direction,
    });
    paintReviewPage();
    setTimeout(() => {
      if (reviewThreadLoadPending === pending) {
        reviewThreadLoadPending.armed = true;
      }
    }, 0);
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   * @param {'older' | 'newer'} direction
   */
  function reviewThreadLoadActive(pageId, messageId, direction) {
    return !!(
      reviewThreadLoadPending &&
      reviewThreadLoadPending.pageId === pageId &&
      reviewThreadLoadPending.messageId === messageId &&
      reviewThreadLoadPending.direction === direction
    );
  }

  /**
   * @param {NonNullable<ReviewState['messages']>[number]} msg
   * @param {string} pageId
   * @param {'older' | 'newer'} direction
   * @param {string} color
   */
  function renderReviewThreadLoadRow(msg, pageId, direction, color) {
    if (reviewThreadLoadActive(pageId, msg.id, direction)) {
      return renderReviewThreadLoadSkeleton(color);
    }
    return renderReviewLoadChip('thread', direction, {
      leadingGap: true,
      nextColor: color,
      spineColor: color,
      label: direction === 'older' ? t('reviewLoadMoreThread') : t('reviewLoadNewer'),
      disabled: reviewLoadsBusy(pageId),
      onClick: () => requestReviewThreadLoad(pageId, msg.id, direction),
    });
  }

  function renderReviewThread(msg, pageId, allowPills, withReviewSkeleton) {
    const children = el('div', 'review-children');
    const clip = el('div', 'review-children-clip');
    const slide = el('div', 'review-children-slide');
    const color = msg.color || reviewChipFallback(msg);
    const pendingExplain = activePendingExplainId(pageId) === msg.id;
    const showSkeleton = !!withReviewSkeleton || pendingExplain;
    const pendingFix = activePendingNeurofixId(pageId) === msg.id;
    if (reviewHasFixes(msg) || pendingFix) {
      const replies = msg.replies || [];
      const hasNotes =
        levelNoteFiles(msg.rereviewNote).length + levelNoteFiles(msg.studyNote).length > 0;
      const hasNext =
        hasNotes ||
        replies.length > 0 ||
        showSkeleton ||
        !!msg.repliesHasMore ||
        !!msg.repliesHasNewer;
      if (reviewHasFixes(msg)) {
        slide.append(
          renderReviewFixNode(pageId, msg.id, msg, hasNext ? color : '', pendingFix, msg.branch),
        );
      } else if (pendingFix) {
        slide.append(renderReviewFixSkeleton(hasNext ? color : ''));
      }
    }
    appendLevelNoteNodes(slide, pageId, msg.id, msg, color);
    if (msg.repliesHasMore) {
      slide.append(renderReviewThreadLoadRow(msg, pageId, 'older', color));
    }
    const replies = msg.replies || [];
    const gapReplyId = msg.gapBeforeReplyId || '';
    const tailNewer = !!msg.repliesHasNewer && !gapReplyId;
    const talkBlocked = !!(msg.locked || (msg.isMr && msg.status === 'closed'));
    for (let index = 0; index < replies.length; index += 1) {
      if (gapReplyId && replies[index].id === gapReplyId && msg.repliesHasNewer) {
        slide.append(renderReviewThreadLoadRow(msg, pageId, 'newer', color));
      }
      const next = replies[index + 1];
      const hasNext = !!next || showSkeleton || tailNewer;
      slide.append(
        renderReviewReply(
          replies[index],
          color,
          allowPills,
          true,
          hasNext ? color : '',
          pageId,
          msg.branch,
          msg.isMr || msg.isReviewRoot ? reviewProfileId(msg) : '',
          talkBlocked,
        ),
      );
    }
    if (msg.repliesHasNewer && !gapReplyId) {
      slide.append(renderReviewThreadLoadRow(msg, pageId, 'newer', color));
    }
    if (showSkeleton) {
      slide.append(
        renderReviewReplySkeleton(color, {
          withStamp: pendingExplain,
          branch: msg.branch || reviewState?.checkout || '',
        }),
      );
    }
    clip.append(slide);
    children.append(clip);
    return children;
  }

  /**
   * @param {NonNullable<ReviewState['messages']>[number]['replies'][number]} reply
   * @param {string} color
   * @param {boolean} allowPills
   * @param {boolean} leadingGap
   * @param {string} nextColor stem below this turn (hidden on :last-child via CSS)
   * @param {string} [pageId]
   * @param {string} [parentBranch]
   * @param {string} [authorProfileId] profile of the MR or review author; empty outside those threads
   * @param {boolean} [talkBlocked] thread owner is locked or the MR is closed
   */
  function renderReviewReply(reply, color, allowPills, leadingGap, nextColor, pageId, parentBranch, authorProfileId, talkBlocked) {
    const isExplain = !!reply.isExplain;
    const stampDate = formatReviewStamp(reply.timestamp);
    const isPill = !!(allowPills && reply.isPill && reply.pillLabel);
    const branchOpts = isPill
      ? reviewStampOpts(stampBranchName(reply.branch, parentBranch), 'reply:' + reply.id)
      : { name: '', checkout: false, revealId: '' };
    const stampBranch = branchOpts.name;
    const hasStamp = !!(stampDate || stampBranch);
    const replyColor =
      reply.color ||
      (reply.isExplain
        ? reviewRoleColor('explain')
        : reply.isRereview
          ? reviewRoleColor('rereview')
          : reply.isStudy
            ? reviewRoleColor('study')
            : color || reviewRoleColor('review'));
    const row = el(
      'div',
      'review-reply-node' + (isExplain ? ' is-explain' : '') + (leadingGap ? ' has-gap' : ''),
    );
    row.dataset.reviewReplyId = reply.id;
    row.style.setProperty('--link-color', replyColor);
    row.append(
      linkElbow(
        reviewElbowMid({
          leadingGap,
          hasStamp,
          contentHalf: reply.isTalk ? 16 : isPill || isExplain ? 17 : 12,
        }),
        nextColor,
      ),
    );
    const body = el('div', 'review-body');
    if (hasStamp) {
      body.append(
        stampBranch
          ? renderReviewStamp(stampDate, stampBranch, {
              own: branchOpts.checkout,
              reveal: true,
              revealId: 'reply:' + reply.id,
            })
          : el('div', 'review-stamp', stampDate),
      );
    }
    const replyText = typeof reply.content === 'string' ? reply.content.trim() : '';
    const replyMissing = reply.contentMissing === true || !replyText;
    if (isExplain && isPill) {
      const wrap = el('div', 'review-chip-wrap');
      const chip = el('div', 'review-chip is-review-pill is-explain-pill');
      const revealId = 'reply:' + reply.id;
      bindCheckoutBranchHover(chip, revealId);
      const explainLabel = el('span', 'review-chip-label');
      setReviewPillText(explainLabel, reply.pillLabel || t('explainFileTitle'));
      chip.append(explainLabel);
      dressReviewChip(chip, 'explain');
      chip.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openExplainContextMenu(event.clientX, event.clientY, pageId || '', reply.id);
      });
      chip.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openExplainFileView(pageId || '', reply);
      });
      wrap.append(chip);
      wrap.append(reviewReplyTalkButton(reply, pageId, talkBlocked));
      body.append(wrap);
    } else if (isPill) {
      const wrap = el('div', 'review-chip-wrap');
      const chip = el('div', 'review-chip is-review-pill');
      const revealId = 'reply:' + reply.id;
      bindCheckoutBranchHover(chip, revealId);
      if (!reviewSchemeIconStyle()) {
        chip.append(reviewStatusIcon(reply.status));
      }
      const replyLabel = el('span', 'review-chip-label');
      const replyPill = reply.isRereview
        ? normalizeRereviewPill(reply.pillLabel || '')
        : reply.pillLabel || '';
      const parentJump =
        reply.isRereview || reply.isStudy ? rereviewParentJump(reply.id, replyPill) : 0;
      setReviewPillText(
        replyLabel,
        replyPill,
        parentJump
          ? {
              jumpNumber: parentJump,
              onReviewJump: () => revealParentReview(reply.id, parentJump),
            }
          : undefined,
      );
      chip.append(replyLabel);
      dressReviewChip(
        chip,
        reply.isRereview ? 'rereview' : reply.isStudy ? 'study' : 'review',
      );
      chip.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openReviewPillContextMenu(event.clientX, event.clientY, pageId || '', reply.id);
      });
      chip.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openReviewFileView(pageId || '', reply);
      });
      wrap.append(chip);
      wrap.append(reviewReplyTalkButton(reply, pageId, talkBlocked));
      if (
        !reply.isStudy &&
        (!reply.isRereview ||
          rereviewRemainingCounts(reply).H +
            rereviewRemainingCounts(reply).M +
            rereviewRemainingCounts(reply).L >
            0)
      ) {
        wrap.append(reviewNeurofixButton(pageId || '', reply.id));
      }
      body.append(wrap);
    } else if (reply.isTalk) {
      const author = !!authorProfileId && reviewProfileId(reply) === authorProfileId;
      const block = el('div', 'review-talk-block');
      const revealId = 'reply:' + reply.id;
      const head = reviewTalkChip(
        reply.profileName,
        reply.avatar,
        null,
        author,
        reviewTalkReplyPhrase(reply.talkSourceType, reply.talkSourceTitle),
      );
      bindCheckoutBranchHover(head, revealId);
      head.append(reviewReplyTalkButton(reply, pageId, talkBlocked));
      block.append(head);
      const talkText = reviewTalkText(reply, reviewPlainExpanded.has(reply.id));
      const openTalkMenu = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openReviewMessageContextMenu(event.clientX, event.clientY, pageId || '', reply.id);
      };
      block.addEventListener('contextmenu', openTalkMenu);
      talkText.addEventListener('contextmenu', openTalkMenu);
      block.append(talkText);
      body.append(block);
    } else {
      const plain = el('div', 'review-plain is-child');
      const ico = el('span', 'review-plain-ico');
      ico.append(reviewCommentIcon());
      plain.append(ico);
      let shown = replyMissing
        ? t('reviewEmptyMessage')
        : reply.isReview
          ? replyText.split('\n').slice(0, 2).join('\n') || 'R_SYN3'
          : replyText;
      plain.append(
        el('span', 'review-plain-text' + (replyMissing ? ' is-missing' : ''), shown),
      );
      plain.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openReviewMessageContextMenu(event.clientX, event.clientY, pageId || '', reply.id);
      });
      body.append(plain);
    }
    const pendingFix = !!(pageId && activePendingNeurofixId(pageId) === reply.id);
    const replyNotes =
      levelNoteFiles(reply.rereviewNote).length + levelNoteFiles(reply.studyNote).length > 0;
    if ((reviewHasFixes(reply) || pendingFix || replyNotes) && pageId) {
      const children = el('div', 'review-children');
      const clip = el('div', 'review-children-clip');
      const slide = el('div', 'review-children-slide');
      if (reviewHasFixes(reply)) {
        slide.append(
          renderReviewFixNode(
            pageId,
            reply.id,
            reply,
            replyNotes ? color : '',
            pendingFix,
            stampBranchName(reply.branch, parentBranch),
          ),
        );
      } else if (pendingFix) {
        slide.append(renderReviewFixSkeleton(replyNotes ? color : ''));
      }
      appendLevelNoteNodes(slide, pageId, reply.id, reply, color);
      clip.append(slide);
      children.append(clip);
      body.append(children);
    }
    row.append(body);
    return row;
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   * @param {{ fixes?: { at?: string } }} source
   * @param {string} nextColor
   * @param {boolean} [busy] neurofix is running against this chip
   * @param {string} [branchRaw]
   */
  function levelNoteFiles(note) {
    const files = note && Array.isArray(note.files) ? note.files : [];
    return files.filter((file) => file && file.filename && Array.isArray(file.indexes) && file.indexes.length);
  }

  function levelNoteLabel(kind, note) {
    const title = kind === 'study' ? t('studyChip') : t('rereviewChip');
    const n = Number(note && note.n) || 0;
    const parts = [n > 0 ? `${title} ${n}` : title];
    for (const letter of ['H', 'M', 'L']) {
      const file = levelNoteFiles(note).find((item) => item.level === letter);
      if (file) {
        parts.push(`${letter}:${file.indexes.join(', ')}`);
      }
    }
    return parts.join(' | ');
  }

  function levelNoteFileList(note, level) {
    const files = levelNoteFiles(note);
    if (!level) {
      return ['H', 'M', 'L']
        .map((letter) => files.find((file) => file.level === letter))
        .filter(Boolean)
        .map((file) => file.filename);
    }
    const match = /^([HML])/i.exec(level.trim());
    const letter = match ? match[1].toUpperCase() : '';
    const file = files.find((item) => item.level === letter);
    return file ? [file.filename] : [];
  }

  function openLevelNoteView(pageId, messageId, title, filenames) {
    if (!pageId || !filenames.length) {
      return;
    }
    const fileKey = filenames.join('|');
    closeExplainFileView();
    closeReviewFixesView();
    if (
      reviewFileView &&
      reviewFileView.pageId === pageId &&
      reviewFileView.messageId === messageId &&
      reviewFileView.fileKey === fileKey
    ) {
      closeReviewFileView();
      return;
    }
    reviewFileView = {
      pageId,
      messageId,
      title,
      filename: filenames.join(', '),
      filenames,
      fileKey,
      levelNote: true,
      status: 'loading',
      text: '',
      html: '',
      error: '',
    };
    mountReviewFile();
    vscode.postMessage({ type: 'reviewOpenFile', pageId, messageId, filenames });
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   * @param {'rereview' | 'study'} kind
   * @param {{ n?: number, files?: Array<{ level: string, indexes: number[], filename: string }> }} note
   * @param {string} nextColor
   */
  function renderLevelNoteNode(pageId, messageId, kind, note, nextColor) {
    const row = el('div', 'review-reply-node is-note has-gap');
    row.dataset.reviewNoteFor = messageId;
    row.dataset.reviewNoteKind = kind;
    row.style.setProperty('--link-color', reviewRoleColor('note'));
    row.append(
      linkElbow(reviewElbowMid({ leadingGap: true, hasStamp: false, contentHalf: 17 }), nextColor),
    );
    const body = el('div', 'review-body');
    const chip = el('div', 'review-chip is-review-pill is-note');
    const label = el('span', 'review-chip-label');
    const title = levelNoteLabel(kind, note);
    setReviewPillText(label, title, {
      onTitle: () => openLevelNoteView(pageId, messageId, title, levelNoteFileList(note)),
      onLevel: (bit) => openLevelNoteView(pageId, messageId, bit, levelNoteFileList(note, bit)),
    });
    chip.append(label);
    dressReviewChip(chip, 'note');
    chip.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('button')) {
        return;
      }
      openLevelNoteView(pageId, messageId, title, levelNoteFileList(note));
    });
    body.append(chip);
    row.append(body);
    return row;
  }

  function appendLevelNoteNodes(parent, pageId, messageId, source, nextColor) {
    for (const kind of ['rereview', 'study']) {
      const note = source && source[kind === 'rereview' ? 'rereviewNote' : 'studyNote'];
      if (!levelNoteFiles(note).length) {
        continue;
      }
      parent.append(renderLevelNoteNode(pageId, messageId, kind, note, nextColor));
    }
  }

  function renderReviewFixNode(pageId, messageId, source, nextColor, busy, branchRaw) {
    const stampDate = (source.fixes && source.fixes.at) || '';
    const branchOpts = reviewStampOpts(branchRaw, 'fix:' + messageId);
    const hasStamp = !!(stampDate || branchOpts.name);
    const row = el('div', 'review-reply-node is-fix has-gap');
    row.dataset.reviewFixFor = messageId;
    row.style.setProperty('--link-color', reviewRoleColor('fix'));
    row.append(
      linkElbow(
        reviewElbowMid({ leadingGap: true, hasStamp, contentHalf: 17 }),
        nextColor,
      ),
    );
    const body = el('div', 'review-body');
    if (hasStamp) {
      body.append(
        branchOpts.name
          ? renderReviewStamp(stampDate, branchOpts.name, {
              own: branchOpts.checkout,
              reveal: true,
              revealId: 'fix:' + messageId,
            })
          : el('div', 'review-stamp', stampDate),
      );
    }
    const chip = el('button', 'review-chip is-review-pill is-fix');
    chip.type = 'button';
    bindCheckoutBranchHover(chip, branchOpts.name ? 'fix:' + messageId : '');
    const label = el('span', 'review-chip-label');
    setReviewPillText(label, reviewFixLabel(source));
    chip.append(label);
    dressReviewChip(chip, 'fix');
    chip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openReviewFixesView(pageId, messageId);
    });
    if (busy) {
      row.dataset.reviewSkel = 'neurofix';
      row.setAttribute('aria-busy', 'true');
      const line = el('div', 'review-fix-line is-busy');
      const loader = el('span', 'review-fix-loader');
      loader.setAttribute('role', 'status');
      loader.setAttribute('aria-label', t('neurofix'));
      loader.append(reviewProgressIcon());
      line.append(chip, loader);
      body.append(line);
    } else {
      body.append(chip);
    }
    row.append(body);
    return row;
  }

  /** @param {string} pageId @param {NonNullable<ReviewState['messages']>[number]['replies'][number]} reply */
  function openReviewFileView(pageId, reply) {
    if (!pageId) {
      return;
    }
    closeExplainFileView();
    closeReviewFixesView();
    if (reviewFileView && reviewFileView.pageId === pageId && reviewFileView.messageId === reply.id) {
      closeReviewFileView();
      return;
    }
    const cached = reviewFileCache.get(reply.id);
    const replyPill = reply.isRereview
      ? normalizeRereviewPill(reply.pillLabel || '')
      : reply.pillLabel || '';
    reviewFileView = {
      pageId,
      messageId: reply.id,
      title: replyPill || reply.filename || t('reviewFileTitle'),
      filename: (cached && cached.filename) || reply.filename || '',
      status: cached ? 'ready' : reply.hasFile === false ? 'error' : 'loading',
      text: cached ? cached.text : '',
      html: cached && cached.html ? cached.html : '',
      error: reply.hasFile === false ? t('reviewFileMissing') : '',
    };
    mountReviewFile();
    if (!cached && reply.hasFile !== false) {
      vscode.postMessage({ type: 'reviewOpenFile', pageId, messageId: reply.id });
    }
  }

  function closeReviewFileView() {
    if (!reviewFileView) {
      mountReviewFile();
      return;
    }
    reviewFileView = null;
    mountReviewFile();
    if (neuroFixListPanel && !neuroFixListPanel.pointerInside) {
      closeNeuroFixListPanel();
    }
  }

  /**
   * @type {{
   *   pageId: string,
   *   messageId: string,
   *   title: string,
   *   filename: string,
   *   status: 'loading' | 'ready' | 'error',
   *   text: string,
   *   html: string,
   *   error: string
   * } | null}
   */
  let explainFileView = null;

  /**
   * @param {string} pageId
   * @param {{ id: string, pillLabel?: string, filename?: string, hasFile?: boolean }} chip
   */
  function openExplainFileView(pageId, chip) {
    if (!pageId) {
      return;
    }
    closeReviewFileView();
    closeReviewFixesView();
    if (explainFileView && explainFileView.pageId === pageId && explainFileView.messageId === chip.id) {
      closeExplainFileView();
      return;
    }
    const cached = reviewFileCache.get(chip.id);
    explainFileView = {
      pageId,
      messageId: chip.id,
      title: chip.pillLabel || t('explainFileTitle'),
      filename: (cached && cached.filename) || chip.filename || '',
      status: cached ? 'ready' : chip.hasFile === false ? 'error' : 'loading',
      text: cached ? cached.text : '',
      html: cached && cached.html ? cached.html : '',
      error: chip.hasFile === false ? t('reviewFileMissing') : '',
    };
    mountExplainFile();
    if (!cached && chip.hasFile !== false) {
      vscode.postMessage({ type: 'reviewOpenFile', pageId, messageId: chip.id });
    }
  }

  function closeExplainFileView() {
    if (!explainFileView) {
      mountExplainFile();
      return;
    }
    explainFileView = null;
    mountExplainFile();
  }

  /**
   * @type {{
   *   pageId: string,
   *   messageId: string,
   *   status: 'loading' | 'ready' | 'error',
   *   html: string,
   *   error: string
   * } | null}
   */
  let reviewFixesView = null;

  /** @param {string} pageId @param {string} messageId */
  function openReviewFixesView(pageId, messageId) {
    if (!pageId || !messageId) {
      return;
    }
    if (reviewFixesView && reviewFixesView.pageId === pageId && reviewFixesView.messageId === messageId) {
      closeReviewFixesView();
      return;
    }
    closeReviewFileView();
    closeExplainFileView();
    reviewFixesView = {
      pageId,
      messageId,
      status: 'loading',
      html: '',
      error: '',
    };
    mountReviewFixes();
    vscode.postMessage({ type: 'reviewOpenFixes', pageId, messageId });
  }

  function closeReviewFixesView() {
    if (!reviewFixesView) {
      mountReviewFixes();
      return;
    }
    reviewFixesView = null;
    mountReviewFixes();
  }

  function mountReviewFixes() {
    if (!reviewFixesPane || !reviewFixesBody) {
      return;
    }
    const view = reviewFixesView;
    const onReview = activePage()?.kind === 'review';
    if (!view || !onReview) {
      reviewFixesPane.hidden = true;
      return;
    }
    reviewFixesPane.hidden = false;
    const chrome = document.querySelector('.map-chrome');
    if (chrome instanceof HTMLElement) {
      reviewFixesPane.style.top = chrome.getBoundingClientRect().bottom + 'px';
    }
    if (reviewFixesClose) {
      reviewFixesClose.title = t('reviewFileClose');
      reviewFixesClose.setAttribute('aria-label', t('reviewFileClose'));
    }
    reviewFixesBody.replaceChildren();
    if (view.status === 'loading') {
      reviewFixesBody.append(reviewFileSkeleton());
    } else if (view.status === 'error') {
      reviewFixesBody.append(el('div', 'review-file-error', view.error || t('reviewFileDownloadFail')));
    } else {
      const table = el('div', 'explain-md');
      table.innerHTML = view.html || '';
      reviewFixesBody.append(table);
    }
  }

  /** @param {{ messageId?: string, ok?: boolean, html?: string, message?: string }} message */
  function onReviewFixesResult(message) {
    if (!reviewFixesView || reviewFixesView.messageId !== message.messageId) {
      return;
    }
    if (message.ok && typeof message.html === 'string') {
      reviewFixesView.status = 'ready';
      reviewFixesView.html = message.html;
      reviewFixesView.error = '';
    } else {
      reviewFixesView.status = 'error';
      reviewFixesView.error = message.message || t('reviewFileDownloadFail');
    }
    mountReviewFixes();
  }

  function mountExplainFile() {
    if (!explainFilePane || !explainFileBody || !explainFileTitle) {
      return;
    }
    const view = explainFileView;
    const onReview = activePage()?.kind === 'review';
    if (!view || !onReview) {
      explainFilePane.hidden = true;
      syncReviewFileMark();
      return;
    }
    explainFilePane.hidden = false;
    const chrome = document.querySelector('.map-chrome');
    if (chrome instanceof HTMLElement) {
      explainFilePane.style.top = chrome.getBoundingClientRect().bottom + 'px';
    }
    explainFileTitle.textContent = view.title || t('explainFileTitle');
    explainFileTitle.title = view.filename || '';
    if (explainFileClose) {
      explainFileClose.title = t('reviewFileClose');
      explainFileClose.setAttribute('aria-label', t('reviewFileClose'));
    }
    if (explainFileSave) {
      explainFileSave.disabled = view.status !== 'ready';
    }
    explainFileBody.replaceChildren();
    if (view.status === 'loading') {
      explainFileBody.append(reviewFileSkeleton());
    } else if (view.status === 'error') {
      explainFileBody.append(
        el('div', 'review-file-error', view.error || t('reviewFileDownloadFail')),
      );
    } else {
      const md = el('div', 'explain-md');
      md.innerHTML = view.html || '';
      explainFileBody.append(md);
    }
    syncReviewFileMark();
  }

  /** @param {{ messageId?: string, ok?: boolean, text?: string, html?: string, filename?: string, message?: string }} message */
  function onReviewFileResult(message) {
    if (message.levelNote) {
      if (
        reviewFileView &&
        reviewFileView.messageId === message.messageId &&
        (!message.fileKey || reviewFileView.fileKey === message.fileKey)
      ) {
        if (message.ok && typeof message.text === 'string') {
          reviewFileView.status = 'ready';
          reviewFileView.text = message.text;
          reviewFileView.html = typeof message.html === 'string' ? message.html : '';
          reviewFileView.filename = message.filename || reviewFileView.filename;
          reviewFileView.error = '';
        } else {
          reviewFileView.status = 'error';
          reviewFileView.error = message.message || t('reviewFileDownloadFail');
        }
        mountReviewFile();
      }
      return;
    }
    if (message.ok && typeof message.text === 'string' && message.messageId) {
      const filename =
        message.filename ||
        (reviewFileView && reviewFileView.messageId === message.messageId
          ? reviewFileView.filename
          : '') ||
        (explainFileView && explainFileView.messageId === message.messageId
          ? explainFileView.filename
          : '') ||
        '';
      reviewFileCache.set(message.messageId, {
        text: message.text,
        filename,
        html: typeof message.html === 'string' ? message.html : '',
      });
    }
    if (explainFileView && explainFileView.messageId === message.messageId) {
      if (message.ok && typeof message.text === 'string') {
        explainFileView.status = 'ready';
        explainFileView.text = message.text;
        explainFileView.html =
          typeof message.html === 'string' ? message.html : explainFileView.html;
        explainFileView.filename = message.filename || explainFileView.filename;
        explainFileView.error = '';
      } else {
        explainFileView.status = 'error';
        explainFileView.error = message.message || t('reviewFileDownloadFail');
      }
      mountExplainFile();
    }
    if (neuroFixListPanel && neuroFixListPanel.messageId === message.messageId) {
      if (message.ok && typeof message.text === 'string') {
        fillNeuroFixListFromText(message.text);
      } else {
        neuroFixListPanel.status = 'error';
        neuroFixListPanel.error = message.message || t('reviewFileDownloadFail');
        mountNeuroFixListPanel();
      }
    }
    if (!reviewFileView || reviewFileView.messageId !== message.messageId) {
      return;
    }
    if (message.ok && typeof message.text === 'string') {
      const filename = message.filename || reviewFileView.filename;
      reviewFileView.status = 'ready';
      reviewFileView.text = message.text;
      reviewFileView.html = typeof message.html === 'string' ? message.html : '';
      reviewFileView.filename = filename;
      reviewFileView.error = '';
    } else {
      reviewFileView.status = 'error';
      reviewFileView.error = message.message || t('reviewFileDownloadFail');
    }
    mountReviewFile();
  }

  function reviewFileSkeleton() {
    const wrap = el('div', 'review-file-skel');
    for (const width of ['78%', '100%', '92%', '64%', '100%', '84%', '70%']) {
      const bar = el('div', 'review-file-skel-bar');
      bar.style.width = width;
      wrap.append(bar);
    }
    return wrap;
  }

  /**
   * @param {MouseEvent} event
   */
  function openReviewFileLink(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const link = target.closest('a.review-file-link');
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const relPath = link.getAttribute('data-syn3-file') || '';
    const line = Number(link.getAttribute('data-syn3-line') || '');
    if (!relPath) {
      return;
    }
    if (Number.isInteger(line) && line > 0) {
      const zero = line - 1;
      vscode.postMessage({
        type: 'openAt',
        relPath,
        line: zero,
        character: 0,
        endLine: zero,
        endCharacter: 0,
      });
      return;
    }
    vscode.postMessage({ type: 'open', relPath });
  }

  function stepReviewFont(delta) {
    const current = typeof data?.appearance?.fontReview === 'number' ? data.appearance.fontReview : 1;
    const next = Math.round((current + delta) * 20) / 20;
    const snapped = Math.min(2, Math.max(0.6, next));
    if (Math.abs(snapped - current) < 0.001) {
      return;
    }
    if (data?.appearance) {
      data.appearance.fontReview = snapped;
      applyAppearance(data.appearance);
    }
    vscode.postMessage({ type: 'setAppearance', appearance: { fontReview: snapped } });
  }

  /** Webview CSP drops inline styles, so segment widths are applied here. */
  function layoutReviewUsage(root) {
    root.querySelectorAll('.review-usage-bar').forEach((bar) => {
      const segs = Array.from(bar.querySelectorAll('.review-usage-seg'));
      const total = segs.reduce((sum, seg) => sum + Number(seg.getAttribute('data-count') || 0), 0);
      if (!total) {
        return;
      }
      segs.forEach((seg) => {
        const count = Number(seg.getAttribute('data-count') || 0);
        const pct = (count / total) * 100;
        seg.style.flex = `0 0 ${pct}%`;
      });
    });
  }

  function mountReviewFile() {
    if (!reviewFilePane || !reviewFileBody || !reviewFileTitle) {
      return;
    }
    const view = reviewFileView;
    const onReview = activePage()?.kind === 'review';
    if (!view || !onReview) {
      reviewFilePane.hidden = true;
      if (toolbarReviewTab) {
        toolbarReviewTab.hidden = true;
      }
      syncReviewFileMark();
      return;
    }
    reviewFilePane.hidden = false;
    const chrome = document.querySelector('.map-chrome');
    if (chrome instanceof HTMLElement) {
      reviewFilePane.style.top = chrome.getBoundingClientRect().bottom + 'px';
    }
    setReviewPillText(reviewFileTitle, view.title || t('reviewFileTitle'));
    reviewFileTitle.title = view.filename || view.title || '';
    if (reviewFileClose) {
      reviewFileClose.title = t('reviewFileClose');
      reviewFileClose.setAttribute('aria-label', t('reviewFileClose'));
    }
    if (reviewFileSave) {
      reviewFileSave.hidden = !!view.levelNote;
      reviewFileSave.disabled = view.status !== 'ready';
    }
    reviewFileBody.replaceChildren();
    if (view.status === 'loading') {
      reviewFileBody.append(reviewFileSkeleton());
      if (toolbarReviewTab) {
        toolbarReviewTab.hidden = true;
      }
    } else if (view.status === 'error') {
      reviewFileBody.append(el('div', 'review-file-error', view.error || t('reviewFileDownloadFail')));
      if (toolbarReviewTab) {
        toolbarReviewTab.hidden = true;
      }
    } else {
      const md = el('div', 'explain-md');
      md.innerHTML = view.html || '';
      layoutReviewUsage(md);
      reviewFileBody.append(md);
      if (toolbarReviewTab) {
        toolbarReviewTab.hidden = false;
        const label = t('reviewOpenTab');
        toolbarReviewTab.title = label;
        toolbarReviewTab.setAttribute('aria-label', label);
      }
    }
    syncReviewFileMark();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} pageId
   * @param {string} messageId
   */
  function openReviewContextMenu(x, y, pageId, messageId) {
    openContextMenu(
      { webviewSection: 'reviewMr', reviewPageId: pageId, reviewMessageId: messageId },
      x,
      y,
    );
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} pageId
   * @param {string} messageId
   */
  function openReviewRootContextMenu(x, y, pageId, messageId) {
    openContextMenu(
      { webviewSection: 'reviewRoot', reviewPageId: pageId, reviewMessageId: messageId },
      x,
      y,
    );
  }

  function openExplainContextMenu(x, y, pageId, messageId) {
    openContextMenu(
      { webviewSection: 'reviewExplain', reviewPageId: pageId, reviewMessageId: messageId },
      x,
      y,
    );
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} pageId
   * @param {string} messageId
   */
  function openReviewPillContextMenu(x, y, pageId, messageId) {
    openContextMenu(
      { webviewSection: 'reviewPill', reviewPageId: pageId, reviewMessageId: messageId },
      x,
      y,
    );
  }

  function reviewTalkLineIcon() {
    return reviewSvgIcon(
      'review-talk-line',
      'M5.76282 17H20V5H4V18.3851L5.76282 17ZM6.45455 19L2 22.5V4C2 3.44772 2.44772 3 3 3H21C21.5523 3 22 3.44772 22 4V18C22 18.5523 21.5523 19 21 19H6.45455Z',
    );
  }

  /** assets/send.svg */
  function reviewTalkFillIcon() {
    return reviewSvgIcon(
      'review-talk-fill',
      'M1.94607 9.31531C1.42353 9.14113 1.4194 8.8601 1.95682 8.68096L21.043 2.31889C21.5715 2.14273 21.8746 2.43854 21.7265 2.95682L16.2733 22.0431C16.1223 22.5715 15.8177 22.5899 15.5944 22.0875L11.9999 13.9999L17.9999 5.99993L9.99992 11.9999L1.94607 9.31531Z',
    );
  }

  function reviewTalkCloseIcon() {
    return reviewSvgIcon(
      'review-talk-close',
      'M10.5859 12.0001L2.79297 4.20718L4.20718 2.79297L12.0001 10.5858L19.793 2.79297L21.2072 4.20718L13.4143 12.0001L21.2072 19.7929L19.793 21.2072L12.0001 13.4143L4.20718 21.2072L2.79297 19.7929L10.5859 12.0001Z',
    );
  }

  /** @param {string | undefined} detail */
  function reviewTalkLabel(detail) {
    const tail = String(detail || '').trim();
    return tail ? t('reviewTalkThread') + ' ' + tail : t('reviewTalkThread');
  }

  /** @param {string | undefined} detail */
  function reviewTalkReplyLabel(detail) {
    const tail = String(detail || '').trim();
    return tail
      ? t('reviewTalkThread') + ' ' + t('reviewTalkReplyOn') + ' ' + tail
      : t('reviewTalkThread') + ' ' + t('reviewTalkReplyOn');
  }

  /** Short chip title shown after «ответ на» in the composer. */
  function reviewTalkSourceTitle(reply) {
    if (reply.isTalk) {
      return String(reply.profileName || '').trim() || '—';
    }
    if (reply.isExplain) {
      return 'Что сделано';
    }
    if (reply.isStudy) {
      return 'Изучено';
    }
    const pill = String(reply.pillLabel || '').trim();
    const head = pill.split(/\s*\|\s*/)[0].trim();
    if (reply.isRereview) {
      const match = /(?:Реревью|Rereview)\s+\d+/i.exec(head || pill);
      return match ? match[0] : head;
    }
    const review = /(?:Ревью|Review)\s+\d+/i.exec(head || pill);
    return review ? review[0] : head;
  }

  const TALK_SOURCE_COLUMN = new Set(['R_SYN3', 'RR_SYN3', 'W_SYN3', 'Z_SYN3']);

  /** Third column beside the profile name. Message replies keep the name only. */
  function reviewTalkReplyPhrase(type, title) {
    const kind = String(type || '').trim();
    const label = String(title || '').trim();
    if (!label || !TALK_SOURCE_COLUMN.has(kind)) {
      return '';
    }
    return t('reviewTalkReplyOn') + ' ' + label;
  }

  /**
   * @param {{ isTalk?: boolean, isExplain?: boolean, isStudy?: boolean, isRereview?: boolean, pillLabel?: string, profileName?: string, locked?: boolean, id: string }} reply
   * @param {string | undefined} pageId
   * @param {boolean | undefined} blocked
   */
  function reviewReplyTalkButton(reply, pageId, blocked) {
    return reviewTalkButton(
      pageId || '',
      reply.id,
      reviewTalkReplyLabel(reviewTalkSourceTitle(reply)),
      !!(blocked || reply.locked),
      'reply:' + reply.id,
    );
  }

  /** @param {string | undefined} name */
  function reviewTalkMsLabel(name) {
    const who = String(name || '').trim() || '—';
    return t('reviewTalkThread') + ' ' + t('reviewTalkReplyTo') + ' · ' + who;
  }

  /** @param {{ profileId?: string } | null | undefined} node */
  function reviewProfileId(node) {
    const id = node && typeof node.profileId === 'string' ? node.profileId.trim() : '';
    return id || '1';
  }

  /**
   * @param {string} pageId
   * @param {string} messageId
   * @param {string} label
   * @param {boolean} disabled
   * @param {string} [revealId] show with the branch hover timers
   */
  function reviewTalkButton(pageId, messageId, label, disabled, revealId) {
    const shown = !!revealId && checkoutBranchShown.has(revealId);
    const button = el(
      'button',
      'review-side review-talk-btn' +
        (revealId ? ' is-reveal' : '') +
        (shown ? ' is-shown' : ''),
    );
    button.type = 'button';
    button.disabled = !!disabled;
    button.title = t('reviewTalkReplyTo');
    button.setAttribute('aria-label', button.title);
    button.append(reviewTalkLineIcon());
    if (revealId) {
      button.dataset.branchReveal = revealId;
      bindCheckoutBranchHover(button, revealId);
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) {
        return;
      }
      reviewTalkSource.set(pageId, { messageId, label });
      syncReviewTalk();
      resizeReviewTalk();
      reviewTalkInput?.focus();
    });
    return button;
  }

  /** @param {string | undefined} value */
  function reviewTalkAvatarSrc(value) {
    const raw = String(value || '').trim();
    if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) {
      return raw;
    }
    return '';
  }

  /** Person glyph centered in the 22×22 avatar circle. */
  function reviewTalkUserGlyph() {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', 'translate(4 4) scale(0.58333)');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute(
      'd',
      'M20 22H4V20C4 17.2386 6.23858 15 9 15H15C17.7614 15 20 17.2386 20 20V22ZM12 13C8.68629 13 6 10.3137 6 7C6 3.68629 8.68629 1 12 1C15.3137 1 18 3.68629 18 7C18 10.3137 15.3137 13 12 13Z',
    );
    path.setAttribute('fill', '#fff');
    g.append(path);
    return g;
  }

  let reviewTalkAvatarSeq = 0;

  /**
   * Square SVG so the disc stays a circle even when the flex row squeezes the box.
   * @param {string | undefined} avatar
   */
  function reviewTalkAvatarNode(avatar) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'review-talk-avatar');
    svg.setAttribute('viewBox', '0 0 22 22');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-hidden', 'true');
    const disc = document.createElementNS(SVG_NS, 'circle');
    disc.setAttribute('cx', '11');
    disc.setAttribute('cy', '11');
    disc.setAttribute('r', '11');
    disc.setAttribute('fill', '#5b6b80');
    svg.append(disc);
    const src = reviewTalkAvatarSrc(avatar);
    if (!src) {
      svg.append(reviewTalkUserGlyph());
      return svg;
    }
    const clipId = 'review-talk-avatar-' + ++reviewTalkAvatarSeq;
    const defs = document.createElementNS(SVG_NS, 'defs');
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', clipId);
    const clipDisc = document.createElementNS(SVG_NS, 'circle');
    clipDisc.setAttribute('cx', '11');
    clipDisc.setAttribute('cy', '11');
    clipDisc.setAttribute('r', '11');
    clip.append(clipDisc);
    defs.append(clip);
    svg.append(defs);
    const img = document.createElementNS(SVG_NS, 'image');
    img.setAttribute('href', src);
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);
    img.setAttribute('x', '0');
    img.setAttribute('y', '0');
    img.setAttribute('width', '22');
    img.setAttribute('height', '22');
    img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    img.setAttribute('clip-path', 'url(#' + clipId + ')');
    img.addEventListener('error', () => {
      img.remove();
      svg.append(reviewTalkUserGlyph());
    });
    svg.append(img);
    return svg;
  }

  /**
   * Pill with a circle inside. The fold caret sits in the pill. The name stays outside it.
   * Without a caret the pill is a square ring, so the disc stays centered.
   * @param {string | undefined} name
   * @param {string | undefined} avatar
   * @param {HTMLElement | null} [tri]
   * @param {boolean} [author] MR or review author: orange ring
   * @param {string} [replyPhrase] «ответ на Ревью N» and the other chip replies
   */
  function reviewTalkChip(name, avatar, tri, author, replyPhrase) {
    const head = el('div', 'review-talk-head');
    const chip = el(
      'div',
      'review-talk-chip' + (tri ? '' : ' is-solo') + (author ? ' is-author' : ''),
    );
    chip.append(reviewTalkAvatarNode(avatar));
    if (tri) {
      chip.append(tri);
    }
    head.append(chip);
    head.append(el('span', 'review-talk-name', String(name || '').trim() || '—'));
    const phrase = String(replyPhrase || '').trim();
    if (phrase) {
      head.append(el('span', 'review-talk-reply', phrase));
    }
    return head;
  }

  /**
   * @param {{ id: string, talkText?: string, contentMissing?: boolean, locked?: boolean }} msg
   * @param {boolean} open
   */
  function reviewTalkText(msg, open) {
    const raw = typeof msg.talkText === 'string' ? msg.talkText : '';
    const missing = msg.contentMissing === true || !raw.trim();
    const text = el(
      'button',
      'review-talk-text' + (open ? ' is-open' : '') + (missing ? ' is-missing' : ''),
      missing ? t('reviewEmptyMessage') : raw,
    );
    text.type = 'button';
    text.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (msg.locked) {
        flashReviewLock(msg.id);
        return;
      }
      if (reviewPlainExpanded.has(msg.id)) {
        reviewPlainExpanded.delete(msg.id);
      } else {
        reviewPlainExpanded.add(msg.id);
      }
      paintReviewPage();
    });
    return text;
  }

  function resizeReviewTalk() {
    const input = reviewTalkInput;
    if (!input) {
      return;
    }
    const line = 18;
    const pad = 12;
    const max = line * 6 + pad;
    input.style.overflowY = 'hidden';
    input.style.height = 'auto';
    const full = input.scrollHeight;
    const over = full > max + 1;
    input.style.height = (over ? max : full) + 'px';
    input.style.overflowY = over ? 'auto' : 'hidden';
    if (over) {
      bindThinScroll(input);
    } else {
      releaseThinScroll(input);
    }
    scheduleThinScroll(true);
    const bar = reviewTalk;
    const space = bar && !bar.hidden ? bar.offsetHeight + 16 : 0;
    document.documentElement.style.setProperty('--review-talk-space', space + 'px');
  }

  function syncReviewTalk() {
    const onReview = activePage()?.kind === 'review';
    if (reviewTalk) {
      reviewTalk.hidden = !onReview;
    }
    if (!onReview) {
      document.documentElement.style.setProperty('--review-talk-space', '0px');
      return;
    }
    const pageId = activePage()?.id || '';
    const source = pageId ? reviewTalkSource.get(pageId) : undefined;
    if (reviewTalkSourceRow) {
      reviewTalkSourceRow.hidden = !source;
    }
    if (reviewTalkSourceLabel) {
      reviewTalkSourceLabel.textContent = source ? source.label : '';
    }
    const empty = !reviewTalkInput || !reviewTalkInput.value.trim();
    if (reviewTalkSend) {
      reviewTalkSend.disabled = reviewTalkBusy || empty;
      reviewTalkSend.title = t('reviewTalkSend');
      reviewTalkSend.setAttribute('aria-label', reviewTalkSend.title);
      paintReviewTalkSend();
    }
    if (reviewTalkSourceClear) {
      reviewTalkSourceClear.title = t('reviewTalkClear');
      reviewTalkSourceClear.setAttribute('aria-label', reviewTalkSourceClear.title);
    }
    resizeReviewTalk();
  }

  /** Send glyph while idle, spinning loader while the post is in flight. */
  function paintReviewTalkSend() {
    if (!reviewTalkSend) {
      return;
    }
    const mode = reviewTalkBusy ? 'loader' : 'send';
    reviewTalkSend.classList.toggle('is-sending', reviewTalkBusy);
    reviewTalkSend.setAttribute('aria-busy', reviewTalkBusy ? 'true' : 'false');
    if (reviewTalkSend.dataset.icon === mode && reviewTalkSend.firstChild) {
      return;
    }
    reviewTalkSend.replaceChildren(reviewTalkBusy ? reviewProgressIcon() : reviewTalkFillIcon());
    reviewTalkSend.dataset.icon = mode;
  }

  function sendReviewTalk() {
    const page = activePage();
    if (!page || page.kind !== 'review' || !reviewTalkInput || reviewTalkBusy) {
      return;
    }
    const text = reviewTalkInput.value;
    if (!text.trim()) {
      return;
    }
    reviewTalkBusy = true;
    syncReviewTalk();
    const source = reviewTalkSource.get(page.id);
    vscode.postMessage({
      type: 'reviewTalk',
      pageId: page.id,
      text,
      parentMessageId: source ? source.messageId : '',
    });
  }

  function clearReviewTalkSource() {
    const page = activePage();
    if (!page) {
      return;
    }
    reviewTalkSource.delete(page.id);
    syncReviewTalk();
  }

  function reviewTalkEscapeBlocked() {
    if (openMenuState) {
      return true;
    }
    if (!contextMenu.hidden) {
      return true;
    }
    if (toolbarMenu && !toolbarMenu.hidden) {
      return true;
    }
    if (reviewFileView || explainFileView || reviewFixesView) {
      return true;
    }
    if (openColorPanel || openGroupPanel || openLinkPanelId) {
      return true;
    }
    if (dirPopoverState || problemPanelState) {
      return true;
    }
    if (!dropDialog.hidden) {
      return true;
    }
    return false;
  }

  function bindReviewTalk() {
    reviewTalk?.addEventListener('submit', (event) => {
      event.preventDefault();
      sendReviewTalk();
    });
    paintReviewTalkSend();
    if (reviewTalkSourceClear && !reviewTalkSourceClear.firstChild) {
      reviewTalkSourceClear.append(reviewTalkCloseIcon());
    }
    reviewTalkInput?.addEventListener('input', () => {
      syncReviewTalk();
    });
    reviewTalkInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendReviewTalk();
      }
    });
    reviewTalkSend?.addEventListener('click', (event) => {
      event.preventDefault();
      sendReviewTalk();
    });
    reviewTalkSourceClear?.addEventListener('click', (event) => {
      event.preventDefault();
      clearReviewTalkSource();
    });
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) {
          return;
        }
        if (reviewTalkEscapeBlocked()) {
          return;
        }
        const page = activePage();
        if (!page || page.kind !== 'review' || !reviewTalkSource.has(page.id)) {
          return;
        }
        event.preventDefault();
        clearReviewTalkSource();
      },
      true,
    );
  }

  /**
   * Sparkle beside a review chip. On a foreign branch it stays visible and muted.
   * @param {string} pageId
   * @param {string} messageId
   */
  function reviewNeurofixButton(pageId, messageId) {
    const side = el('button', 'review-side review-neurofix-btn');
    side.type = 'button';
    side.title = t('neurofix');
    side.setAttribute('aria-label', side.title);
    side.append(reviewSparkleIcon());
    side.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openNeuroFixMenu(event.clientX, event.clientY, pageId, messageId);
    });
    return side;
  }

  function openNeuroFixMenu(x, y, pageId, messageId) {
    openContextMenu(
      { webviewSection: 'reviewNeurofix', reviewPageId: pageId, reviewMessageId: messageId },
      x,
      y,
    );
  }

  /**
   * Counts from a pill label. The label may be
   * `Ревью N | H:n | M:n | S:n` or `Ревью N | branch | rd | H:n | M:n | S:n`.
   * @param {string | undefined} pillLabel
   * @returns {{ H: number, M: number, S: number } | undefined}
   */
  /**
   * Chip label. Review: `Ревью N | branch|changes | rl|rm|rd | H:n | M:n | L:n`.
   * Re-review: `Реревью N | Ревью K | branch|changes | rl|rm|rd | L:1, 2`.
   * Explain: `Что сделано | branch|changes | rl|rm|rd`. Older explain chips are the title alone.
   * Severity, scope and depth each get their own color. `rs` and `rl` share the shallow color.
   * @param {HTMLElement} node
   * @param {string} label
   * @param {{ jumpNumber?: number, onReviewJump?: (number: number) => void, onTitle?: () => void, onLevel?: (label: string) => void }} [opts]
   */
  function setReviewPillText(node, label, opts) {
    const text = String(label || '');
    node.replaceChildren();
    const chunks = text.split(/\s*\|\s*/);
    const anyTone = chunks.some((chunk) => reviewPillTone(chunk.trim()));
    const jumpNumber = opts && opts.jumpNumber;
    const interactive = !!(opts && (opts.onTitle || opts.onLevel));
    if (!anyTone && !jumpNumber && !interactive) {
      node.textContent = text.replace(/\s*\|\s*/g, ' | ');
      return;
    }
    let wrote = false;
    let lastLevel = false;
    chunks.forEach((chunk, index) => {
      const shown = chunk.trim();
      if (reviewSchemeLevelPills() && /^[HMLS]:\s*0\s*$/i.test(shown)) {
        return;
      }
      const tone = reviewPillTone(shown);
      const isLevel =
        reviewSchemeLevelPills() && (tone === 'high' || tone === 'medium' || tone === 'low');
      const levelClass = isLevel ? ' review-level-pill' : '';
      if (wrote && !(lastLevel && isLevel)) {
        const sep = el('span', 'review-pill-sep');
        sep.textContent = ' | ';
        node.append(sep);
      }
      wrote = true;
      lastLevel = isLevel;
      if (opts && opts.onLevel && /^[HMLS]:\s*\d/i.test(shown)) {
        const levelBtn = el(
          'button',
          'review-pill-jump' + (tone ? ' review-pill-bit review-pill-' + tone : '') + levelClass,
        );
        levelBtn.type = 'button';
        levelBtn.append(document.createTextNode(shown));
        levelBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          opts.onLevel(shown);
        });
        node.append(levelBtn);
        return;
      }
      if (index === 0 && opts && opts.onTitle) {
        const titleBtn = el('button', 'review-pill-jump', shown);
        titleBtn.type = 'button';
        titleBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          opts.onTitle();
        });
        node.append(titleBtn);
        return;
      }
      const parentJump = /^(?:Ревью|Review)\s+(\d+)$/i.exec(shown);
      if (
        parentJump &&
        jumpNumber &&
        Number(parentJump[1]) === jumpNumber &&
        opts.onReviewJump
      ) {
        const jump = el('button', 'review-pill-jump', shown);
        jump.type = 'button';
        jump.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          opts.onReviewJump(jumpNumber);
        });
        node.append(jump);
        return;
      }
      const toneSeen = reviewPillTone(shown);
      if (!toneSeen) {
        node.append(document.createTextNode(shown));
        return;
      }
      const bit = el('span', 'review-pill-bit review-pill-' + toneSeen + levelClass);
      if (toneSeen === 'branch' && reviewSchemeIconStyle() && reviewSchemeId !== 'softSemantic') {
        bit.append(reviewSvgIcon('review-branch-ico', REVIEW_BRANCH_ICON));
      }
      bit.append(document.createTextNode(shown));
      node.append(bit);
    });
  }

  /**
   * Chip text. Stored messages still say `Реревью N на Ревью K`.
   * @param {string} label
   */
  function normalizeRereviewPill(label) {
    return String(label || '').replace(
      /^((?:Реревью|Rereview)\s+\d+)\s+на\s+((?:Ревью|Review)\s+\d+)\b/i,
      '$1 | $2',
    );
  }

  /** @param {string | undefined} label */
  function reviewChipNumber(label) {
    const head = String(label || '').split(/\s*\|\s*/)[0].trim();
    const match = /^(?:Ревью|Review)\s+(\d+)$/i.exec(head);
    return match ? Number(match[1]) : 0;
  }

  /**
   * Review already painted in the same thread: a sibling reply, or the channel root
   * when that root is the numbered review.
   * @param {string} fromReplyId
   * @param {number} number
   * @returns {{ parentId: string, kind: 'root' | 'reply', id: string } | null}
   */
  function loadedReviewTarget(fromReplyId, number) {
    if (!number) {
      return null;
    }
    const parent = (reviewState?.messages || []).find((msg) =>
      (msg.replies || []).some((item) => item.id === fromReplyId),
    );
    if (!parent) {
      return null;
    }
    if (parent.isReviewRoot && reviewChipNumber(parent.pillLabel) === number) {
      return { parentId: parent.id, kind: 'root', id: parent.id };
    }
    const found = (parent.replies || []).find((item) => {
      if (!item.isPill || item.isRereview || item.isExplain) {
        return false;
      }
      return reviewChipNumber(item.pillLabel) === number;
    });
    if (!found) {
      return null;
    }
    return { parentId: parent.id, kind: 'reply', id: found.id };
  }

  /**
   * Parent number from `Реревью N | Ревью K | …` when that review is already in the thread.
   * @param {string} replyId
   * @param {string} label
   */
  function rereviewParentJump(replyId, label) {
    const chunks = String(label || '').split(/\s*\|\s*/);
    for (const chunk of chunks) {
      const match = /^(?:Ревью|Review)\s+(\d+)$/i.exec(chunk.trim());
      if (!match) {
        continue;
      }
      const number = Number(match[1]);
      if (loadedReviewTarget(replyId, number)) {
        return number;
      }
    }
    return 0;
  }

  /** @type {number} */
  let reviewChipFlashTimer = 0;

  /**
   * @param {string} fromReplyId
   * @param {number} number
   */
  function revealParentReview(fromReplyId, number) {
    const target = loadedReviewTarget(fromReplyId, number);
    if (!target) {
      return;
    }
    const collapsed = target.kind === 'reply' && reviewCollapsed.has(target.parentId);
    if (collapsed) {
      reviewCollapsed.delete(target.parentId);
      syncReviewCollapsed();
    }
    const run = () => {
      const selector =
        target.kind === 'root'
          ? '.review-node[data-review-id="' + CSS.escape(target.id) + '"]'
          : '[data-review-reply-id="' + CSS.escape(target.id) + '"]';
      const node = root.querySelector(selector);
      if (!(node instanceof HTMLElement)) {
        return;
      }
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      flashReviewChipBorder(
        node.querySelector(':scope > .review-body > .review-chip-wrap > .review-chip'),
      );
    };
    if (collapsed) {
      window.setTimeout(run, 340);
    } else {
      run();
    }
  }

  /** @param {Element | null} chip */
  function flashReviewChipBorder(chip) {
    if (!(chip instanceof HTMLElement)) {
      return;
    }
    root.querySelectorAll('.review-chip.is-rereview-flash').forEach((node) => {
      if (node !== chip) {
        node.classList.remove('is-rereview-flash');
      }
    });
    chip.classList.remove('is-rereview-flash');
    void chip.offsetWidth;
    chip.classList.add('is-rereview-flash');
    window.clearTimeout(reviewChipFlashTimer);
    reviewChipFlashTimer = window.setTimeout(() => {
      chip.classList.remove('is-rereview-flash');
    }, 2000);
  }

  /** @param {string} token */
  function reviewPillTone(token) {
    const value = token.trim().toLowerCase();
    if (value === 'changes' || value === 'change') {
      return 'changes';
    }
    if (value === 'branch') {
      return 'branch';
    }
    if (value === 'rd') {
      return 'rd';
    }
    if (value === 'rm') {
      return 'rm';
    }
    if (value === 'rs' || value === 'rl') {
      return 'rs';
    }
    if (/^h:\s*(?:all|\d+(?:\s*,\s*\d+)*)$/.test(value)) {
      return 'high';
    }
    if (/^m:\s*(?:all|\d+(?:\s*,\s*\d+)*)$/.test(value)) {
      return 'medium';
    }
    if (/^[ls]:\s*(?:all|\d+(?:\s*,\s*\d+)*)$/.test(value)) {
      return 'low';
    }
    return '';
  }

  /**
   * Client-side mirror of parseReviewFixGroups for the Neurofix list panel.
   * @param {string} text
   * @returns {{
   *   ok: true,
   *   counts: { H: number, M: number, S: number },
   *   groups: { H: string[], M: string[], L: string[] },
   * } | { ok: false, message: string }}
   */
  function parseReviewFixGroupsClient(text) {
    const lines = String(text || '').split(/\r?\n/);
    const severityRaw = (lines[2] || '')
      .trim()
      .replace(/^(?:branch|changes?)\s*\|\s*(?:rs|rl|rm|rd)\s*\|\s*/i, '');
    const rereviewFile = /^(?:Реревью|Rereview)\b/i.test((lines[0] || '').trim());
    const selectionShape = /^([HML]:(?:all|\d+(?:\s*,\s*\d+)*)(?:\s*\|\s*[HML]:(?:all|\d+(?:\s*,\s*\d+)*))*)$/i.test(
      severityRaw,
    );
    const sevMatch = rereviewFile
      ? null
      : severityRaw.match(/^H:\s*(\d+)\s*\|\s*M:\s*(\d+)\s*\|\s*([LS]):\s*(\d+)\s*$/i);
    const selectionLine = rereviewFile ? selectionShape : !sevMatch && selectionShape;
    if (!sevMatch && !selectionLine) {
      return { ok: false, message: t('neurofixListParseFail') };
    }
    const counts = sevMatch
      ? {
          H: Number(sevMatch[1]),
          M: Number(sevMatch[2]),
          L: Number(sevMatch[4]),
        }
      : null;
    /** @type {{ H: string[], M: string[], L: string[] }} */
    const groups = { H: [], M: [], L: [] };
    /** @type {Set<'H' | 'M' | 'L'>} */
    const seen = new Set();
    /** @type {'H' | 'M' | 'L' | undefined} */
    let current;
    for (const raw of lines.slice(3)) {
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }
      const header = /^([HMLS])\s*$/i.exec(trimmed);
      if (header) {
        const upper = header[1].toUpperCase();
        const letter = upper === 'S' || upper === 'L' ? 'L' : upper === 'H' || upper === 'M' ? upper : '';
        if (letter !== 'H' && letter !== 'M' && letter !== 'L') {
          continue;
        }
        if (seen.has(letter)) {
          return { ok: false, message: t('neurofixListParseFail') };
        }
        seen.add(letter);
        current = letter;
        continue;
      }
      if (/^-\s+/.test(trimmed)) {
        if (!current) {
          return { ok: false, message: t('neurofixListParseFail') };
        }
        groups[current].push(trimmed.replace(/^-\s+/, '').trim());
        continue;
      }
    }
    const resolved = counts || {
      H: groups.H.length,
      M: groups.M.length,
      L: groups.L.length,
    };
    if (counts) {
      for (const letter of /** @type {Array<'H' | 'M' | 'L'>} */ (['H', 'M', 'L'])) {
        const expected = counts[letter];
        const actual = groups[letter].length;
        if (expected === 0 && actual === 0) {
          continue;
        }
        if (expected !== actual) {
          return { ok: false, message: t('neurofixListParseFail') };
        }
      }
    }
    return { ok: true, counts: resolved, groups };
  }

  /**
   * @param {{ pageId: string, messageId: string, left: number, top: number, width: number, mode?: 'neurofix' | 'rereview' | 'study' }} opts
   */
  function openNeuroFixListPanel(opts) {
    closeNeuroFixListPanel();
    const cached = reviewFileCache.get(opts.messageId);
    neuroFixListPanel = {
      pageId: opts.pageId,
      messageId: opts.messageId,
      left: opts.left,
      top: opts.top,
      width: Math.max(opts.width || 240, 240),
      mode: opts.mode === 'rereview' ? 'rereview' : opts.mode === 'study' ? 'study' : 'neurofix',
      selected: { H: [], M: [], L: [] },
      status: cached ? 'ready' : 'loading',
      error: '',
      entered: false,
      pointerInside: false,
      el: null,
    };
    if (cached && typeof cached.text === 'string') {
      fillNeuroFixListFromText(cached.text);
      return;
    }
    mountNeuroFixListPanel();
    vscode.postMessage({
      type: 'reviewOpenFile',
      pageId: opts.pageId,
      messageId: opts.messageId,
    });
  }

  function closeNeuroFixListPanel() {
    if (!neuroFixListPanel) {
      return;
    }
    neuroFixListPanel.el?.remove();
    neuroFixListPanel = null;
  }

  /** @param {string} text */
  function fillNeuroFixListFromText(text) {
    if (!neuroFixListPanel) {
      return;
    }
    const parsed = parseReviewFixGroupsClient(text);
    if (!parsed.ok) {
      neuroFixListPanel.status = 'error';
      neuroFixListPanel.error = parsed.message;
      mountNeuroFixListPanel();
      return;
    }
    neuroFixListPanel.status = 'ready';
    neuroFixListPanel.error = '';
    mountNeuroFixListPanel(parsed);
  }

  /**
   * @param {{
   *   counts: { H: number, M: number, S: number },
   *   groups: { H: string[], M: string[], S: string[] },
   * } | undefined} [parsed]
   */
  function mountNeuroFixListPanel(parsed) {
    if (!neuroFixListPanel) {
      return;
    }
    const prev = neuroFixListPanel.el;
    const entered = neuroFixListPanel.entered;
    const pointerInside = neuroFixListPanel.pointerInside;
    prev?.remove();
    const panel = document.createElement('div');
    panel.className = 'syn3-menu syn3-neurofix-list';
    panel.setAttribute('role', 'menu');
    panel.style.left = neuroFixListPanel.left + 'px';
    panel.style.top = neuroFixListPanel.top + 'px';
    panel.style.minWidth = neuroFixListPanel.width + 'px';
    panel.addEventListener('mouseenter', () => {
      if (!neuroFixListPanel) {
        return;
      }
      neuroFixListPanel.entered = true;
      neuroFixListPanel.pointerInside = true;
    });
    panel.addEventListener('mouseleave', () => {
      if (!neuroFixListPanel) {
        return;
      }
      neuroFixListPanel.pointerInside = false;
      if (!neuroFixListPanel.entered) {
        return;
      }
      const fileOpen =
        !!reviewFileView && reviewFileView.messageId === neuroFixListPanel.messageId;
      if (fileOpen) {
        return;
      }
      closeNeuroFixListPanel();
    });

    if (neuroFixListPanel.status === 'loading') {
      panel.append(reviewFileSkeleton());
    } else if (neuroFixListPanel.status === 'error') {
      panel.append(
        el('div', 'syn3-neurofix-list-error', neuroFixListPanel.error || t('neurofixListParseFail')),
      );
    } else if (parsed) {
      const counts = parsed.counts;
      const pageId = neuroFixListPanel.pageId;
      const messageId = neuroFixListPanel.messageId;
      const source =
        findReviewReply(messageId) ||
        (reviewState?.messages || []).find((item) => item.id === messageId);
      const rereviewMode = neuroFixListPanel.mode === 'rereview' || neuroFixListPanel.mode === 'study';
      const studyMode = neuroFixListPanel.mode === 'study';
      const bullets = reviewFixBullets(source);
      const open = reviewOpenBullets(source);
      const fixedBy = {
        H: new Set(rereviewMode ? [] : bullets.H),
        M: new Set(rereviewMode ? [] : bullets.M),
        L: new Set(rereviewMode ? [] : bullets.L),
      };
      const limitToOpen = !rereviewMode && !!source?.isRereview;
      const remaining = {
        H: Math.max(0, counts.H - fixedBy.H.size),
        M: Math.max(0, counts.M - fixedBy.M.size),
        L: Math.max(0, counts.L - fixedBy.L.size),
      };
      panel.append(
        el(
          'div',
          'syn3-neurofix-list-counts',
          `H:${remaining.H} | M:${remaining.M} | L:${remaining.L}`,
        ),
      );
      panel.append(el('div', 'syn3-neurofix-list-hint', t('rereviewShiftHint')));
      const selected = neuroFixListPanel.selected || { H: [], M: [], L: [] };
      /** @type {Array<{ letter: 'H' | 'M' | 'L', label: string }>} */
      const groupMeta = [
        { letter: 'H', label: 'High' },
        { letter: 'M', label: 'Medium' },
        { letter: 'L', label: 'Low' },
      ];
      for (const group of groupMeta) {
        const items = parsed.groups[group.letter];
        if (!items.length) {
          continue;
        }
        const visible = items.some((_, index) => {
          const number = index + 1;
          if (fixedBy[group.letter].has(number)) {
            return false;
          }
          if (limitToOpen && !open[group.letter].includes(number)) {
            return false;
          }
          return true;
        });
        if (!visible) {
          continue;
        }
        panel.append(el('div', 'syn3-neurofix-list-group', group.label));
        for (let index = 0; index < items.length; index += 1) {
          const number = index + 1;
          if (fixedBy[group.letter].has(number)) {
            continue;
          }
          if (limitToOpen && !open[group.letter].includes(number)) {
            continue;
          }
          const full = items[index];
          const short =
            full.length > 80 ? full.slice(0, 80).replace(/\s+\S*$/, '').trimEnd() + '…' : full;
          const row = document.createElement('div');
          row.className =
            'syn3-neurofix-list-item' +
            (selected[group.letter].includes(number) ? ' is-selected' : '');
          row.setAttribute('role', 'menuitem');
          const main = document.createElement('button');
          main.type = 'button';
          main.className = 'syn3-neurofix-list-item-main';
          main.textContent = `${index + 1}. ${short}`;
          main.title = full;
          if (!rereviewMode && reviewNeurofixBlocked(messageId)) {
            muteNeurofixAction(main);
          }
          main.addEventListener('click', (event) => {
            event.preventDefault();
            if (!rereviewMode && reviewNeurofixBlocked(messageId)) {
              denyForeignNeurofix();
              return;
            }
            if (event.shiftKey) {
              const bucket = selected[group.letter];
              const at = bucket.indexOf(number);
              if (at >= 0) {
                bucket.splice(at, 1);
              } else {
                bucket.push(number);
              }
              neuroFixListPanel.selected = selected;
              mountNeuroFixListPanel(parsed);
              return;
            }
            closeNeuroFixListPanel();
            if (rereviewMode) {
              const selection = { [group.letter]: [number] };
              if (studyMode) {
                postStudy(pageId, messageId, selection);
              } else {
                postRereview(pageId, messageId, selection);
              }
              return;
            }
            beginLocalNeurofixSkeleton(pageId, messageId);
            vscode.postMessage({
              type: 'reviewNeurofix',
              pageId,
              messageId,
              scope: group.letter,
              itemIndex: index,
            });
          });
          const openBtn = document.createElement('button');
          openBtn.type = 'button';
          openBtn.className = 'syn3-neurofix-list-open';
          openBtn.title = t('reviewFileTitle');
          openBtn.setAttribute('aria-label', t('reviewFileTitle'));
          openBtn.append(reviewVarInstanceIcon());
          openBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const chip =
              (reviewState?.messages || []).find((item) => item.id === messageId) ||
              findReviewReply(messageId) ||
              { id: messageId };
            openReviewFileView(pageId, chip);
          });
          row.append(main, openBtn);
          panel.append(row);
        }
      }
      const pickedCount = selected.H.length + selected.M.length + selected.L.length;
      if (pickedCount > 0) {
        const launch = document.createElement('button');
        launch.type = 'button';
        launch.className = 'syn3-neurofix-list-launch';
        launch.textContent = t(studyMode ? 'studyLaunch' : 'rereviewLaunch');
        launch.addEventListener('click', (event) => {
          event.preventDefault();
          if (!rereviewMode && reviewNeurofixBlocked(messageId)) {
            denyForeignNeurofix();
            return;
          }
          const picks = {
            H: selected.H.slice(),
            M: selected.M.slice(),
            L: selected.L.slice(),
          };
          closeNeuroFixListPanel();
          if (rereviewMode) {
            if (studyMode) {
              postStudy(pageId, messageId, picks);
            } else {
              postRereview(pageId, messageId, picks);
            }
            return;
          }
          beginLocalNeurofixSkeleton(pageId, messageId);
          vscode.postMessage({
            type: 'reviewNeurofix',
            pageId,
            messageId,
            scope: 'all',
            picks,
          });
        });
        panel.append(launch);
      }
    }

    document.body.append(panel);
    const maxH = Math.max(120, window.innerHeight - neuroFixListPanel.top - 8);
    panel.style.maxHeight = maxH + 'px';
    let top = neuroFixListPanel.top;
    if (top + panel.offsetHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 8 - panel.offsetHeight);
      panel.style.top = top + 'px';
      neuroFixListPanel.top = top;
    }
    neuroFixListPanel.el = panel;
    neuroFixListPanel.entered = entered;
    neuroFixListPanel.pointerInside = pointerInside;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} pageId
   * @param {string} messageId
   */
  function openReviewMessageContextMenu(x, y, pageId, messageId) {
    openContextMenu(
      { webviewSection: 'reviewMsg', reviewPageId: pageId, reviewMessageId: messageId },
      x,
      y,
    );
  }

  function dismissReviewMrPanel() {
    removeOverlay('review-mr-panel');
  }

  function closeReviewMrPanel() {
    dismissReviewMrPanel();
    reviewMrPanel = null;
  }

  function clearBranchDepthMenu() {
    branchDepthMenu?.remove();
    branchDepthMenu = null;
  }

  function clearBranchSearchTimer() {
    if (branchSearchTimer != null) {
      clearTimeout(branchSearchTimer);
      branchSearchTimer = null;
    }
  }

  function closeHostBranchPanel() {
    clearBranchDepthMenu();
    clearBranchSearchTimer();
    removeOverlay('host-branch-panel');
    branchPicker = null;
  }

  function newBranchRequestId() {
    return 'br-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * @param {'pull' | 'review' | 'explain'} mode
   * @param {{ parentMessageId?: string }} [opts]
   */
  function openHostBranchPanel(mode, opts) {
    const pageId = String(activePage()?.id || '');
    if (!pageId) {
      return;
    }
    closeHostBranchPanel();
    dismissReviewMrPanel();
    branchPicker = {
      mode,
      pageId,
      parentMessageId: opts?.parentMessageId || '',
      source: 'mrs',
      currentBranch: '',
      branches: [],
      branchesLoaded: false,
      branchNextPage: undefined,
      loadingBranches: false,
      inflightBranches: '',
      requests: [],
      requestsLoaded: false,
      requestNextPage: undefined,
      loadingMrs: false,
      inflightRequests: '',
      resolvingParent: false,
      step: 'branches',
      query: '',
      activeQuery: '',
      pendingSearchFocus: true,
    };
    requestHostOpenRequests(1);
  }

  /** @param {number} page */
  function requestHostBranches(page) {
    if (!branchPicker) {
      return;
    }
    const requestId = newBranchRequestId();
    branchPicker.inflightBranches = requestId;
    branchPicker.loadingBranches = true;
    branchPicker.branchNextPage = undefined;
    renderHostBranchPanel();
    vscode.postMessage({
      type: 'reviewListBranches',
      pageId: branchPicker.pageId,
      page,
      requestId,
    });
  }

  /** @param {number} page */
  function requestHostOpenRequests(page) {
    if (!branchPicker) {
      return;
    }
    const requestId = newBranchRequestId();
    branchPicker.inflightRequests = requestId;
    branchPicker.loadingMrs = true;
    branchPicker.requestNextPage = undefined;
    renderHostBranchPanel();
    vscode.postMessage({
      type: 'reviewListOpenRequests',
      pageId: branchPicker.pageId,
      page,
      requestId,
    });
  }

  /** @param {'mrs' | 'branches'} next */
  function selectBranchPickerSource(next) {
    if (!branchPicker || branchPicker.step !== 'branches' || branchPicker.source === next) {
      return;
    }
    clearBranchDepthMenu();
    clearBranchSearchTimer();
    branchPicker.source = next;
    branchPicker.query = '';
    branchPicker.activeQuery = '';
    branchPicker.pendingSearchFocus = true;
    if (next === 'mrs') {
      if (!branchPicker.requestsLoaded && !branchPicker.loadingMrs) {
        requestHostOpenRequests(1);
        return;
      }
    } else if (!branchPicker.branchesLoaded && !branchPicker.loadingBranches) {
      requestHostBranches(1);
      return;
    }
    renderHostBranchPanel();
  }

  function requestHostParent(branch) {
    if (!branchPicker) {
      return;
    }
    const requestId = newBranchRequestId();
    branchPicker.requestId = requestId;
    branchPicker.resolvingParent = true;
    branchPicker.step = 'bases';
    branchPicker.selectedBranch = branch;
    branchPicker.query = '';
    branchPicker.activeQuery = '';
    clearBranchSearchTimer();
    renderHostBranchPanel();
    vscode.postMessage({
      type: 'reviewResolveParent',
      pageId: branchPicker.pageId,
      branch,
      requestId,
    });
  }

  /** @param {typeof branchPicker} picker */
  function pickerShowsRequests(picker) {
    return !!picker && picker.step !== 'bases' && picker.source === 'mrs';
  }

  /** @param {NonNullable<typeof branchPicker>} picker */
  function pickerListLoading(picker) {
    if (pickerShowsRequests(picker)) {
      return !!picker.loadingMrs;
    }
    return !!picker.loadingBranches || (!!picker.resolvingParent && !picker.branchesLoaded);
  }

  /** @param {NonNullable<typeof branchPicker>} picker */
  function pickerListNext(picker) {
    return pickerShowsRequests(picker) ? picker.requestNextPage : picker.branchNextPage;
  }

  /**
   * @param {string[]} names
   * @param {string} [hide]
   */
  /**
   * Commit the typed name: Enter, or 3s after the last character.
   * Shorter than 3 characters does not search.
   */
  function commitBranchSearch() {
    if (!branchPicker) {
      return;
    }
    clearBranchSearchTimer();
    const query = (branchPicker.query || '').trim();
    if (query.length < 3) {
      return;
    }
    branchPicker.activeQuery = query;
    if (pickerListNext(branchPicker) != null && !pickerListLoading(branchPicker)) {
      pumpBranchSearch();
      return;
    }
    renderHostBranchPanel();
  }

  /** Keep loading later pages while a search is active so matches below the input can appear. */
  function pumpBranchSearch() {
    if (!branchPicker?.activeQuery || pickerListLoading(branchPicker) || pickerListNext(branchPicker) == null) {
      return;
    }
    const page = pickerListNext(branchPicker);
    if (pickerShowsRequests(branchPicker)) {
      requestHostOpenRequests(page);
      return;
    }
    requestHostBranches(page);
  }

  /**
   * @param {string} name
   * @param {string} query
   */
  function branchNameMatches(name, query) {
    return name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  }

  function filterPickerBranches(names, hide) {
    const seen = new Set();
    const out = [];
    for (const name of names) {
      if (!name || name === hide || seen.has(name)) {
        continue;
      }
      seen.add(name);
      out.push(name);
    }
    return out;
  }

  /**
   * @param {unknown} raw
   */
  function readOpenRequests(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    const out = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const sourceBranch = typeof item.sourceBranch === 'string' ? item.sourceBranch : '';
      if (!sourceBranch) {
        continue;
      }
      out.push({
        title: typeof item.title === 'string' ? item.title : '',
        sourceBranch,
        author: typeof item.author === 'string' ? item.author : '',
        draft: item.draft === true,
      });
    }
    return out;
  }

  /**
   * @param {{ sourceBranch: string, title: string, author: string, draft: boolean }} item
   */
  function openRequestKey(item) {
    return [item.sourceBranch, item.title, item.author, item.draft ? '1' : '0'].join('\0');
  }

  /**
   * @param {Array<{ sourceBranch: string, title: string, author: string, draft: boolean }>} items
   * @param {string} hide
   */
  function filterPickerRequests(items, hide) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      if (!item?.sourceBranch || item.sourceBranch === hide || seen.has(openRequestKey(item))) {
        continue;
      }
      seen.add(openRequestKey(item));
      out.push(item);
    }
    return out;
  }

  /**
   * @param {{ title?: string }} item
   * @param {string} query
   */
  function requestTitleMatches(item, query) {
    return (item.title || '').toLocaleLowerCase().includes(query.toLocaleLowerCase());
  }

  /**
   * @param {{ sourceBranch: string, author?: string }} item
   */
  function requestMeta(item) {
    const author = item.author || '';
    return author ? `${item.sourceBranch} · ${author}` : item.sourceBranch;
  }

  /**
   * @param {string} name
   */
  function activatePickerBranch(name) {
    if (!branchPicker || !name) {
      return;
    }
    if (branchPicker.mode === 'pull') {
      const pageId = branchPicker.pageId;
      closeHostBranchPanel();
      beginLocalMrSkeleton(pageId, '…', false);
      vscode.postMessage({ type: 'reviewPullOther', pageId, branch: name });
      return;
    }
    branchPicker.selectedBranch = name;
    renderHostBranchPanel();
    const panelNode = document.getElementById('host-branch-panel');
    let anchor = null;
    for (const node of panelNode?.querySelectorAll('[data-branch]') || []) {
      if (node instanceof HTMLElement && node.dataset.branch === name) {
        anchor = node;
        break;
      }
    }
    if (anchor instanceof HTMLElement) {
      mountBranchPanelDepthMenu(anchor, name);
    }
  }

  function renderHostBranchPanel() {
    if (!branchPicker) {
      return;
    }
    clearBranchDepthMenu();
    const previousList = document.querySelector('#host-branch-panel .host-branch-list');
    const previousScroll = previousList instanceof HTMLElement ? previousList.scrollTop : 0;
    const previousSearch = document.querySelector('#host-branch-panel .host-branch-search');
    const searchFocused = previousSearch instanceof HTMLInputElement && document.activeElement === previousSearch;
    const searchCaret = searchFocused ? previousSearch.selectionStart : null;
    removeOverlay('host-branch-panel');
    const picker = branchPicker;
    const panel = el('div', 'review-mr-panel host-branch-panel');
    panel.id = 'host-branch-panel';

    const titleKey =
      picker.step === 'bases'
        ? 'branchPanelBaseTitle'
        : picker.mode === 'pull'
          ? 'branchPanelPullTitle'
          : picker.mode === 'explain'
            ? 'branchPanelExplainTitle'
            : 'branchPanelReviewTitle';
    const head = el('div', 'host-branch-head');
    head.append(el('div', 'host-branch-title', t(titleKey)));
    const closeBtn = el('button', 'review-btn host-branch-close', '×');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => closeHostBranchPanel());
    head.append(closeBtn);
    panel.append(head);

    const showingRequests = pickerShowsRequests(picker);
    if (picker.step !== 'bases') {
      const tabs = el('div', 'host-branch-tabs');
      tabs.setAttribute('role', 'tablist');
      const mrKey = data?.reviewProvider === 'github' ? 'branchPanelTabPr' : 'branchPanelTabMr';
      const mrTab = el('button', 'host-branch-tab', t(mrKey));
      mrTab.type = 'button';
      mrTab.setAttribute('role', 'tab');
      const mrsSelected = picker.source === 'mrs';
      mrTab.setAttribute('aria-selected', mrsSelected ? 'true' : 'false');
      if (mrsSelected) {
        mrTab.classList.add('is-selected');
      }
      mrTab.addEventListener('click', () => selectBranchPickerSource('mrs'));
      const branchTab = el('button', 'host-branch-tab', t('branchPanelTabBranches'));
      branchTab.type = 'button';
      branchTab.setAttribute('role', 'tab');
      const branchesSelected = picker.source === 'branches';
      branchTab.setAttribute('aria-selected', branchesSelected ? 'true' : 'false');
      if (branchesSelected) {
        branchTab.classList.add('is-selected');
      }
      branchTab.addEventListener('click', () => selectBranchPickerSource('branches'));
      tabs.append(mrTab, branchTab);
      panel.append(tabs);
    }

    const searchKey = showingRequests ? 'branchPanelSearchMrs' : 'branchPanelSearch';
    const search = document.createElement('input');
    search.className = 'review-mr-title host-branch-search';
    search.type = 'text';
    search.spellcheck = false;
    search.autocomplete = 'off';
    search.placeholder = t(searchKey);
    search.setAttribute('aria-label', t(searchKey));
    search.value = picker.query || '';
    search.addEventListener('input', () => {
      if (!branchPicker) {
        return;
      }
      branchPicker.query = search.value;
      clearBranchSearchTimer();
      const typed = search.value.trim();
      if (typed.length < 3) {
        if (branchPicker.activeQuery) {
          branchPicker.activeQuery = '';
          renderHostBranchPanel();
        }
        return;
      }
      branchSearchTimer = setTimeout(() => commitBranchSearch(), BRANCH_SEARCH_MS);
    });
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      commitBranchSearch();
    });
    panel.append(search);

    if (picker.step === 'bases' && picker.selectedBranch) {
      panel.append(el('div', 'host-branch-sub', picker.selectedBranch));
    }

    const list = el('div', 'host-branch-list');
    list.setAttribute('role', 'listbox');

    const hide =
      picker.step === 'bases' ? picker.selectedBranch || '' : picker.currentBranch || '';
    const activeQuery = (picker.activeQuery || '').trim();
    const loading = pickerListLoading(picker);

    if (showingRequests) {
      let items = filterPickerRequests(picker.requests, picker.currentBranch || '');
      if (activeQuery.length >= 3) {
        items = items.filter((item) => requestTitleMatches(item, activeQuery));
      }
      if (loading && items.length === 0) {
        for (let i = 0; i < 4; i += 1) {
          list.append(el('div', 'host-branch-skeleton'));
        }
      } else if (!loading && items.length === 0) {
        list.append(
          el(
            'div',
            'host-branch-empty',
            t(activeQuery ? 'branchPanelMrsNoMatch' : 'branchPanelMrsEmpty'),
          ),
        );
      } else {
        for (const item of items) {
          const row = el('button', 'host-branch-row');
          row.type = 'button';
          row.setAttribute('role', 'option');
          const main = el('span', 'host-branch-row-main');
          main.append(el('span', 'host-branch-row-label', item.title || item.sourceBranch));
          main.append(el('span', 'host-branch-row-meta', requestMeta(item)));
          row.append(main);
          if (item.draft) {
            row.append(el('span', 'host-branch-row-mark', t('branchPanelDraft')));
          }
          if (item.sourceBranch === picker.selectedBranch) {
            row.classList.add('is-selected');
          }
          row.dataset.branch = item.sourceBranch;
          row.addEventListener('click', () => activatePickerBranch(item.sourceBranch));
          list.append(row);
        }
        if (loading) {
          for (let i = 0; i < 2; i += 1) {
            list.append(el('div', 'host-branch-skeleton'));
          }
        }
      }
    } else {
      let names = filterPickerBranches(picker.branches, hide);
      if (activeQuery.length >= 3) {
        names = names.filter((name) => branchNameMatches(name, activeQuery));
      }
      if (picker.step === 'bases' && picker.parentBranch && !names.includes(picker.parentBranch)) {
        names = [picker.parentBranch, ...names];
      }

      if (loading && names.length === 0) {
        for (let i = 0; i < 4; i += 1) {
          list.append(el('div', 'host-branch-skeleton'));
        }
      } else if (!loading && names.length === 0) {
        list.append(
          el('div', 'host-branch-empty', t(activeQuery ? 'branchPanelNoMatch' : 'branchPanelEmpty')),
        );
      } else {
        for (const name of names) {
          const row = el('button', 'host-branch-row');
          row.type = 'button';
          row.setAttribute('role', 'option');
          const label = el('span', 'host-branch-row-label', name);
          row.append(label);
          if (picker.step === 'bases' && name === picker.parentBranch) {
            row.append(el('span', 'host-branch-row-mark', t('branchPanelParentMark')));
          }
          if (picker.step === 'bases' && name === picker.selectedBase) {
            row.classList.add('is-selected');
            row.setAttribute('aria-selected', 'true');
          } else if (picker.step === 'branches' && name === picker.selectedBranch) {
            row.classList.add('is-selected');
          }
          row.dataset.branch = name;
          if (picker.step === 'branches') {
            row.addEventListener('click', () => activatePickerBranch(name));
          } else {
            row.addEventListener('click', () => {
              picker.selectedBase = name;
              renderHostBranchPanel();
            });
          }
          list.append(row);
        }
        if (loading) {
          for (let i = 0; i < 2; i += 1) {
            list.append(el('div', 'host-branch-skeleton'));
          }
        }
      }
    }

    list.addEventListener('scroll', () => {
      if (!branchPicker || pickerListLoading(branchPicker) || pickerListNext(branchPicker) == null) {
        return;
      }
      if (list.scrollTop + list.clientHeight < list.scrollHeight - 40) {
        return;
      }
      const page = pickerListNext(branchPicker);
      if (pickerShowsRequests(branchPicker)) {
        requestHostOpenRequests(page);
        return;
      }
      requestHostBranches(page);
    });
    panel.append(list);

    if (picker.step === 'bases') {
      const actions = el('div', 'host-branch-actions');
      const explainMode = picker.mode === 'explain';
      const start = el(
        'button',
        'review-btn is-primary',
        t(explainMode ? 'branchPanelStartExplain' : 'branchPanelStart'),
      );
      start.type = 'button';
      start.disabled = !picker.selectedBase || !picker.selectedDepth || !!picker.resolvingParent || !!picker.loadingBranches;
      start.addEventListener('click', () => {
        if (!branchPicker?.selectedBranch || !branchPicker.selectedBase || !branchPicker.selectedDepth) {
          return;
        }
        const pageId = branchPicker.pageId;
        const branch = branchPicker.selectedBranch;
        const baseBranch = branchPicker.selectedBase;
        const depth = branchPicker.selectedDepth;
        const parentMessageId = branchPicker.parentMessageId || '';
        closeHostBranchPanel();
        if (explainMode) {
          if (parentMessageId) {
            beginLocalExplainSkeleton(pageId, parentMessageId);
          } else {
            beginLocalExplainRootSkeleton(pageId, branch);
          }
          vscode.postMessage({
            type: 'explainStartOther',
            pageId,
            branch,
            baseBranch,
            depth,
            parentMessageId: parentMessageId || undefined,
          });
          return;
        }
        beginLocalRootSkeleton(pageId, branch);
        vscode.postMessage({
          type: 'reviewStartOther',
          pageId,
          branch,
          baseBranch,
          depth,
        });
      });
      actions.append(start);
      panel.append(actions);
    }

    document.body.append(panel);
    if (previousScroll > 0) {
      list.scrollTop = previousScroll;
    }
    if (picker.pendingSearchFocus || searchFocused) {
      picker.pendingSearchFocus = false;
      search.focus();
      if (searchFocused && typeof searchCaret === 'number') {
        search.setSelectionRange(searchCaret, searchCaret);
      }
    }
  }

  /**
   * @param {HTMLElement} anchor
   * @param {string} branch
   */
  function mountBranchPanelDepthMenu(anchor, branch) {
    clearBranchDepthMenu();
    const fly = document.createElement('div');
    fly.className = 'syn3-menu syn3-menu-sub';
    fly.setAttribute('role', 'menu');
    const depths = [
      ['shallow', 'reviewDepthShallow'],
      ['medium', 'reviewDepthMedium'],
      ['deep', 'reviewDepthDeep'],
    ];
    for (const [depth, key] of depths) {
      const btn = menuAction(t(key));
      btn.dataset.branchDepth = depth;
      btn.dataset.branch = branch;
      fly.append(btn);
    }
    fly.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const button = target?.closest('button');
      if (!(button instanceof HTMLButtonElement) || !button.dataset.branchDepth) {
        return;
      }
      event.stopPropagation();
      if (!branchPicker) {
        return;
      }
      branchPicker.selectedDepth = button.dataset.branchDepth;
      branchPicker.selectedBranch = button.dataset.branch || branch;
      clearBranchDepthMenu();
      requestHostParent(branchPicker.selectedBranch);
    });
    document.body.append(fly);
    branchDepthMenu = fly;
    const rect = anchor.getBoundingClientRect();
    const flyWidth = fly.offsetWidth || 196;
    const flyHeight = fly.offsetHeight || 96;
    let top = rect.top;
    if (top + flyHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 8 - flyHeight);
    }
    const roomRight = window.innerWidth - rect.right;
    const left = roomRight >= flyWidth + 8 ? rect.right - 6 : Math.max(8, rect.left - flyWidth + 6);
    fly.style.top = top + 'px';
    fly.style.left = left + 'px';
  }

  /**
   * @param {{
   *   requestId: string,
   *   ok: boolean,
   *   branches?: string[],
   *   nextPage?: number,
   *   currentBranch?: string,
   *   message?: string,
   * }} message
   */
  function onReviewBranchesMessage(message) {
    if (!branchPicker || branchPicker.inflightBranches !== message.requestId) {
      return;
    }
    branchPicker.inflightBranches = '';
    branchPicker.loadingBranches = false;
    if (!message.ok) {
      closeHostBranchPanel();
      return;
    }
    const incoming = Array.isArray(message.branches) ? message.branches : [];
    if (typeof message.currentBranch === 'string' && message.currentBranch) {
      branchPicker.currentBranch = message.currentBranch;
    }
    const seen = new Set(branchPicker.branches);
    for (const name of incoming) {
      if (name && !seen.has(name)) {
        seen.add(name);
        branchPicker.branches.push(name);
      }
    }
    branchPicker.branchesLoaded = true;
    branchPicker.branchNextPage =
      typeof message.nextPage === 'number' ? message.nextPage : undefined;
    renderHostBranchPanel();
    if (branchPicker?.activeQuery && !pickerShowsRequests(branchPicker)) {
      pumpBranchSearch();
    }
  }

  /**
   * @param {{
   *   requestId: string,
   *   ok: boolean,
   *   requests?: Array<{ title: string, sourceBranch: string, author: string, draft: boolean }>,
   *   nextPage?: number,
   *   currentBranch?: string,
   *   message?: string,
   * }} message
   */
  function onReviewOpenRequestsMessage(message) {
    if (!branchPicker || branchPicker.inflightRequests !== message.requestId) {
      return;
    }
    branchPicker.inflightRequests = '';
    branchPicker.loadingMrs = false;
    if (!message.ok) {
      closeHostBranchPanel();
      return;
    }
    const incoming = Array.isArray(message.requests) ? message.requests : [];
    if (typeof message.currentBranch === 'string' && message.currentBranch) {
      branchPicker.currentBranch = message.currentBranch;
    }
    const seen = new Set(branchPicker.requests.map((item) => openRequestKey(item)));
    for (const item of incoming) {
      const key = openRequestKey(item);
      if (!item.sourceBranch || seen.has(key)) {
        continue;
      }
      seen.add(key);
      branchPicker.requests.push(item);
    }
    branchPicker.requestsLoaded = true;
    branchPicker.requestNextPage =
      typeof message.nextPage === 'number' ? message.nextPage : undefined;
    renderHostBranchPanel();
    if (branchPicker?.activeQuery && pickerShowsRequests(branchPicker)) {
      pumpBranchSearch();
    }
  }

  /**
   * @param {{
   *   requestId: string,
   *   ok: boolean,
   *   parent?: string,
   *   message?: string,
   * }} message
   */
  function onReviewParentMessage(message) {
    if (!branchPicker || branchPicker.requestId !== message.requestId) {
      return;
    }
    if (!message.ok || !message.parent) {
      closeHostBranchPanel();
      if (message.message) {
        // Host already surfaces errors for pull; parent resolve uses the same toast path via empty panel close.
      }
      return;
    }
    branchPicker.parentBranch = message.parent;
    branchPicker.selectedBase = message.parent;
    branchPicker.resolvingParent = false;
    branchPicker.step = 'bases';
    if (!branchPicker.branchesLoaded && !branchPicker.loadingBranches) {
      requestHostBranches(1);
      return;
    }
    renderHostBranchPanel();
    if (branchPicker?.activeQuery && !pickerShowsRequests(branchPicker)) {
      pumpBranchSearch();
    }
  }

  function removeOverlay(id) {
    const node = document.getElementById(id);
    if (!node) {
      return;
    }
    const backdrop = node.closest('.map-settings-backdrop');
    if (backdrop) {
      backdrop.remove();
      return;
    }
    node.remove();
  }

  /**
   * Full-panel busy overlay: disables interaction and covers the whole panel.
   * @param {HTMLElement | null | undefined} panel
   * @param {boolean} busy
   */
  function setPanelBusy(panel, busy) {
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    panel.classList.toggle('is-busy', busy);
    panel.setAttribute('aria-busy', busy ? 'true' : 'false');
    let overlay = panel.querySelector(':scope > .panel-busy-overlay');
    if (busy) {
      if (!(overlay instanceof HTMLElement)) {
        overlay = el('div', 'panel-busy-overlay');
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.append(reviewProgressIcon());
        panel.append(overlay);
      }
      for (const btn of panel.querySelectorAll('button')) {
        if (btn instanceof HTMLButtonElement) {
          btn.disabled = true;
        }
      }
      for (const input of panel.querySelectorAll('input, textarea, select')) {
        if (
          input instanceof HTMLInputElement ||
          input instanceof HTMLTextAreaElement ||
          input instanceof HTMLSelectElement
        ) {
          input.disabled = true;
        }
      }
      return;
    }
    if (overlay) {
      overlay.remove();
    }
    for (const btn of panel.querySelectorAll('button')) {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
      }
    }
    for (const input of panel.querySelectorAll('input, textarea, select')) {
      if (
        input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement ||
        input instanceof HTMLSelectElement
      ) {
        input.disabled = false;
      }
    }
  }

  /**
   * Enter commits a settings panel. A textarea keeps the line break, a button keeps its click.
   * @param {KeyboardEvent} event
   */
  function isSettingsCommitKey(event) {
    if (event.key !== 'Enter' || event.repeat || event.isComposing) {
      return false;
    }
    if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
      return false;
    }
    const target = event.target;
    return !(target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement);
  }

  /**
   * @param {HTMLElement} panel
   * @param {() => void} commit
   */
  function bindSettingsCommitKey(panel, commit) {
    panel.addEventListener('keydown', (event) => {
      if (!isSettingsCommitKey(event) || panel.classList.contains('is-busy')) {
        return;
      }
      event.preventDefault();
      commit();
    });
  }

  /**
   * @param {HTMLElement} panel
   * @param {() => void} close
   */
  function mountSettingsOverlay(panel, close) {
    const backdrop = el('div', 'map-settings-backdrop');
    let pressed = false;
    backdrop.addEventListener('mousedown', (event) => {
      pressed = event.target === backdrop;
    });
    backdrop.addEventListener('click', (event) => {
      if (panel.classList.contains('is-busy')) {
        pressed = false;
        return;
      }
      if (pressed && event.target === backdrop) {
        close();
      }
      pressed = false;
    });
    backdrop.append(panel);
    document.body.append(backdrop);
  }

  function closeProjectCreatePanel() {
    removeOverlay('project-create-panel');
  }

  function closeProjectEditPanel() {
    removeOverlay('project-edit-panel');
  }

  /**
   * @param {{
   *   id: string,
   *   name: string,
   *   repoUrl: string,
   *   profileName: string,
   *   githubToken: string,
   *   gitlabToken: string
   * }} opts
   */
  function openProjectEditPanel(opts) {
    closeMapSettingsPanels();
    const panel = el('div', 'review-mr-panel review-create-page-panel project-create-panel');
    panel.id = 'project-edit-panel';
    panel.append(el('div', 'review-mr-people-title', t('projectSettingsTitle')));

    const nameLabel = el('label', 'review-mr-field', t('projectName'));
    const nameInput = document.createElement('input');
    nameInput.className = 'review-mr-title';
    nameInput.type = 'text';
    nameInput.spellcheck = false;
    nameInput.maxLength = 64;
    nameInput.value = opts.name;
    nameLabel.append(nameInput);
    panel.append(nameLabel);

    const repoLabel = el('label', 'review-mr-field', t('projectRepoUrl'));
    const repoRow = el('div', 'project-repo-row');
    const repoInput = document.createElement('input');
    repoInput.className = 'review-mr-title';
    repoInput.type = 'text';
    repoInput.spellcheck = false;
    repoInput.readOnly = true;
    repoInput.value = opts.repoUrl;
    repoInput.setAttribute('aria-readonly', 'true');
    const repoHost = el('span', 'project-repo-host');
    repoHost.hidden = true;
    repoHost.setAttribute('aria-live', 'polite');
    repoRow.append(repoInput, repoHost);
    repoLabel.append(repoRow);
    panel.append(repoLabel);

    const hostTokenLabel = el('label', 'review-mr-field');
    hostTokenLabel.hidden = true;
    const hostTokenCaption = document.createElement('span');
    const hostTokenInput = document.createElement('input');
    hostTokenInput.className = 'review-mr-title';
    hostTokenInput.type = 'password';
    hostTokenInput.spellcheck = false;
    hostTokenInput.autocomplete = 'new-password';
    hostTokenLabel.append(hostTokenCaption, hostTokenInput);
    panel.append(hostTokenLabel);

    const provider = recognizedRepoProvider(opts.repoUrl);
    if (provider) {
      repoHost.hidden = false;
      repoHost.textContent = provider === 'github' ? t('reviewProviderGithub') : t('reviewProviderGitlab');
      hostTokenCaption.textContent = t(
        provider === 'github' ? 'projectHostTokenGithub' : 'projectHostTokenGitlab',
      ).replace('{name}', opts.profileName || '');
      hostTokenInput.value = provider === 'github' ? opts.githubToken : opts.gitlabToken;
      hostTokenLabel.hidden = false;
    }

    const error = el('div', 'review-panel-error');
    error.hidden = true;
    panel.append(error);

    function mark(label, invalid) {
      label.classList.toggle('has-error', invalid);
    }

    nameInput.addEventListener('input', () => {
      if (nameInput.value.trim()) mark(nameLabel, false);
    });
    hostTokenInput.addEventListener('input', () => {
      if (hostTokenInput.value.trim()) mark(hostTokenLabel, false);
    });

    const actions = el('div', 'project-edit-actions');
    const danger = el('div', 'project-edit-danger');
    const trash = el('button', 'project-edit-trash');
    trash.type = 'button';
    trash.title = t('projectDelete');
    trash.setAttribute('aria-label', t('projectDelete'));
    trash.append(reviewSvgIcon('project-edit-trash-ico', PROJECT_DELETE_D));
    const confirmRow = el('div', 'project-edit-confirm');
    confirmRow.hidden = true;
    const confirmInput = document.createElement('input');
    confirmInput.className = 'review-mr-title';
    confirmInput.type = 'text';
    confirmInput.spellcheck = false;
    confirmInput.autocomplete = 'off';
    confirmInput.placeholder = t('projectDeletePlaceholder');
    confirmInput.setAttribute('aria-label', t('projectDeletePlaceholder'));
    const confirmBtn = el('button', 'review-btn project-edit-delete', t('projectDelete'));
    confirmBtn.type = 'button';
    confirmBtn.disabled = true;
    const expectedName = opts.name.trim();
    const syncDelete = () => {
      confirmBtn.disabled = confirmInput.value.trim() !== expectedName;
    };
    confirmInput.addEventListener('input', syncDelete);
    const sendDelete = () => {
      if (panel.classList.contains('is-busy') || confirmBtn.disabled) {
        return;
      }
      error.hidden = true;
      error.textContent = '';
      if (confirmInput.value.trim() !== expectedName) {
        confirmBtn.disabled = true;
        confirmInput.focus();
        return;
      }
      panel.classList.add('is-busy');
      vscode.postMessage({
        type: 'projectDelete',
        id: opts.id,
        name: expectedName,
      });
    };
    confirmBtn.addEventListener('click', sendDelete);
    confirmInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendDelete();
      }
    });
    trash.addEventListener('click', () => {
      if (panel.classList.contains('is-busy')) {
        return;
      }
      trash.hidden = true;
      confirmRow.hidden = false;
      submit.hidden = true;
      confirmInput.focus();
    });
    confirmRow.append(confirmInput, confirmBtn);
    danger.append(trash, confirmRow);

    const submit = el('button', 'review-btn is-primary', t('profileSettingsSave'));
    submit.type = 'button';
    submit.addEventListener('click', () => {
      if (panel.classList.contains('is-busy')) {
        return;
      }
      error.hidden = true;
      error.textContent = '';
      mark(nameLabel, false);
      mark(hostTokenLabel, false);
      const name = nameInput.value.trim();
      if (!name) {
        mark(nameLabel, true);
        error.textContent = t('projectNameEmpty');
        error.hidden = false;
        nameInput.focus();
        return;
      }
      if (provider) {
        const hostToken = hostTokenInput.value.trim();
        if (!hostToken) {
          mark(hostTokenLabel, true);
          error.textContent = hostTokenCaption.textContent || '';
          error.hidden = false;
          hostTokenInput.focus();
          return;
        }
        panel.classList.add('is-busy');
        vscode.postMessage({
          type: 'projectSaveSettings',
          id: opts.id,
          name,
          githubToken: provider === 'github' ? hostToken : opts.githubToken,
          gitlabToken: provider === 'gitlab' ? hostToken : opts.gitlabToken,
        });
        return;
      }
      panel.classList.add('is-busy');
      vscode.postMessage({
        type: 'projectSaveSettings',
        id: opts.id,
        name,
      });
    });
    actions.append(danger, submit);
    panel.append(actions);
    mountSettingsOverlay(panel, closeProjectEditPanel);
    nameInput.focus();
    nameInput.select();
  }

  /**
   * Create mode needs a non-empty project name. Select mode does not.
   * @param {HTMLElement} panel
   */
  function projectCreateSubmitAllowed(panel) {
    if (panel.dataset.projectMode === 'select') {
      return true;
    }
    const nameInput = panel.querySelector('[data-project-name]');
    return nameInput instanceof HTMLInputElement && nameInput.value.trim().length > 0;
  }

  /**
   * Busy state for project create: disable Create/Retry and show a spinner to its left.
   * Cancel stays available.
   * @param {boolean} busy
   */
  function setProjectCreateBusy(busy) {
    const panel = document.getElementById('project-create-panel');
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    panel.classList.toggle('is-creating', busy);
    const submit = panel.querySelector('[data-project-create-submit]');
    if (submit instanceof HTMLButtonElement) {
      submit.disabled = busy;
      if (!busy) {
        submit.classList.add('is-primary');
        const selectMode = panel.dataset.projectMode === 'select';
        submit.classList.toggle('is-idle', !selectMode && !projectCreateSubmitAllowed(panel));
      }
    }
    panel.querySelectorAll('.project-create-modes button').forEach((btn) => {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = busy;
      }
    });
    const loader = panel.querySelector('.project-create-loader');
    if (loader instanceof HTMLElement) {
      loader.hidden = !busy;
      if (busy) {
        loader.replaceChildren(reviewProgressIcon());
      } else {
        loader.replaceChildren();
      }
    }
  }

  /**
   * Host from an https, ssh://, or git@ URL. Mirrors hostFromRepoUrl in reviewHost.ts.
   * @param {string} repoUrl
   */
  function repoHostFromUrl(repoUrl) {
    const raw = repoUrl.trim().replace(/\.git$/i, '');
    const ssh = /^git@([^:]+):/.exec(raw);
    if (ssh) {
      return ssh[1].toLowerCase();
    }
    const sshUrl = /^ssh:\/\/[^@]+@([^/]+)\//.exec(raw);
    if (sshUrl) {
      return sshUrl[1].toLowerCase();
    }
    const https = /^https?:\/\/([^/]+)/i.exec(raw);
    return https ? https[1].toLowerCase() : '';
  }

  /**
   * GitHub or GitLab once the link has a real host and a repository path.
   * Mirrors recognizedRepoProvider in reviewHost.ts.
   * @param {string} repoUrl
   * @returns {'github' | 'gitlab' | ''}
   */
  function recognizedRepoProvider(repoUrl) {
    const host = repoHostFromUrl(repoUrl);
    const name = host.replace(/:\d+$/, '');
    if (!host || (name !== 'localhost' && !name.includes('.'))) {
      return '';
    }
    const raw = repoUrl.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
    const hasPath =
      /^git@[^:]+:(.+)$/.test(raw) ||
      /^ssh:\/\/[^@]+@[^/]+\/(.+)$/.test(raw) ||
      /^https?:\/\/[^/]+\/(.+)$/i.test(raw);
    if (!hasPath) {
      return '';
    }
    if (host === 'github.com' || host.endsWith('.github.com') || host.includes('github')) {
      return 'github';
    }
    return 'gitlab';
  }

  /**
   * @param {{ needChannel: boolean, gate?: boolean, hasDiscord?: boolean, mode?: 'create' | 'select', profileName?: string }} opts
   */
  function openProjectCreatePanel(opts) {
    if (opts.gate && document.getElementById('project-create-panel')) {
      return;
    }
    closeProjectCreatePanel();
    closeMapSettingsPanels();
    const panel = el('div', 'review-mr-panel review-create-page-panel project-create-panel');
    panel.id = 'project-create-panel';
    const title = el('div', 'review-mr-people-title', '');
    panel.append(title);

    const modes = el('div', 'project-create-modes');
    const createModeBtn = el('button', 'review-btn', t('projectModeCreate'));
    createModeBtn.type = 'button';
    const selectModeBtn = el('button', 'review-btn', t('projectSelect'));
    selectModeBtn.type = 'button';
    modes.append(createModeBtn, selectModeBtn);
    panel.append(modes);

    const nameLabel = el('label', 'review-mr-field', t('projectName'));
    const nameInput = document.createElement('input');
    nameInput.className = 'review-mr-title';
    nameInput.type = 'text';
    nameInput.required = true;
    nameInput.spellcheck = false;
    nameInput.maxLength = 64;
    nameInput.dataset.projectName = '1';
    nameLabel.append(nameInput);
    panel.append(nameLabel);

    const channelLabel = el('label', 'review-mr-field', t('projectChannel'));
    const channelInput = document.createElement('input');
    channelInput.className = 'review-mr-title';
    channelInput.type = 'text';
    channelInput.spellcheck = false;
    channelInput.inputMode = 'numeric';
    channelInput.placeholder = t('channelIdPlaceholder');
    channelLabel.append(channelInput);
    panel.append(channelLabel);

    const repoLabel = el('label', 'review-mr-field', t('projectRepoUrl'));
    const repoRow = el('div', 'project-repo-row');
    const repoInput = document.createElement('input');
    repoInput.className = 'review-mr-title';
    repoInput.type = 'text';
    repoInput.spellcheck = false;
    repoInput.placeholder = t('projectRepoPlaceholder');
    repoInput.dataset.projectRepo = '1';
    const repoHost = el('span', 'project-repo-host');
    repoHost.hidden = true;
    repoHost.setAttribute('aria-live', 'polite');
    repoRow.append(repoInput, repoHost);
    repoLabel.append(repoRow);
    panel.append(repoLabel);

    const hostTokenLabel = el('label', 'review-mr-field');
    hostTokenLabel.hidden = true;
    const hostTokenCaption = document.createElement('span');
    const hostTokenInput = document.createElement('input');
    hostTokenInput.className = 'review-mr-title';
    hostTokenInput.type = 'password';
    hostTokenInput.spellcheck = false;
    hostTokenInput.autocomplete = 'new-password';
    hostTokenLabel.append(hostTokenCaption, hostTokenInput);
    panel.append(hostTokenLabel);

    /** @type {HTMLInputElement | null} */
    let tokenInput = null;
    if (opts.hasDiscord === false) {
      const tokenLabel = el('label', 'review-mr-field', t('reviewFieldDiscordToken'));
      tokenInput = document.createElement('input');
      tokenInput.className = 'review-mr-title';
      tokenInput.type = 'password';
      tokenInput.spellcheck = false;
      tokenInput.autocomplete = 'new-password';
      tokenLabel.append(tokenInput);
      panel.append(tokenLabel);
    }

    if (opts.gate) {
      const howToBtn = el('button', 'review-btn discord-gate-howto', t('discordGateHowTo'));
      howToBtn.type = 'button';
      howToBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'discordGateOpenHowTo' });
      });
      panel.append(howToBtn);
    }

    const error = el('div', 'review-panel-error');
    error.hidden = true;
    panel.append(error);

    const actions = el('div', 'review-mr-actions');
    /** @type {HTMLButtonElement | null} */
    let cancel = null;
    if (!opts.gate) {
      cancel = el('button', 'review-btn', t('reviewCreatePageCancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', () => {
        closeProjectCreatePanel();
      });
    }
    const submitWrap = el('span', 'project-create-submit-wrap');
    const loader = el('span', 'project-create-loader');
    loader.hidden = true;
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
    const submit = el('button', 'review-btn is-primary', t('reviewCreatePageSubmit'));
    submit.type = 'button';
    submit.dataset.projectCreateSubmit = '1';

    /** @type {'create' | 'select'} */
    let mode = opts.mode === 'select' ? 'select' : 'create';

    function channelRequired() {
      return mode === 'select' || opts.needChannel || opts.gate === true;
    }

    function applyMode(next) {
      mode = next;
      panel.dataset.projectMode = mode;
      createModeBtn.classList.toggle('is-primary', mode === 'create');
      selectModeBtn.classList.toggle('is-primary', mode === 'select');
      title.textContent = mode === 'select' ? t('projectSelect') : t('projectModeCreate');
      nameLabel.hidden = mode !== 'create';
      repoLabel.hidden = mode !== 'create';
      channelLabel.hidden = !channelRequired();
      if (mode !== 'create') {
        hostTokenLabel.hidden = true;
      } else {
        syncRepoHost();
      }
      if (submit.dataset.projectCreateRetry !== '1' || mode !== 'create') {
        delete submit.dataset.projectCreateRetry;
        submit.textContent = mode === 'select' ? t('projectSelect') : t('reviewCreatePageSubmit');
      }
      syncProjectCreateSubmit();
    }

    function syncProjectCreateSubmit() {
      if (panel.classList.contains('is-creating')) {
        return;
      }
      submit.disabled = false;
      submit.classList.add('is-primary');
      submit.classList.toggle('is-idle', mode === 'create' && nameInput.value.trim().length === 0);
    }

    function markProjectField(label, invalid) {
      label.classList.toggle('has-error', invalid);
    }

    nameInput.addEventListener('input', () => {
      if (nameInput.value.trim()) {
        markProjectField(nameLabel, false);
      }
      syncProjectCreateSubmit();
    });
    function syncRepoHost() {
      const provider = recognizedRepoProvider(repoInput.value);
      if (mode !== 'create' || !provider) {
        repoHost.hidden = true;
        repoHost.textContent = '';
        hostTokenLabel.hidden = true;
        return;
      }
      repoHost.hidden = false;
      repoHost.textContent = provider === 'github' ? t('reviewProviderGithub') : t('reviewProviderGitlab');
      const tokenKey = provider === 'github' ? 'projectHostTokenGithub' : 'projectHostTokenGitlab';
      hostTokenCaption.textContent = t(tokenKey).replace('{name}', opts.profileName || '');
      hostTokenLabel.hidden = false;
    }

    channelInput.addEventListener('input', () => {
      if (channelInput.value.trim()) {
        markProjectField(channelLabel, false);
      }
    });
    repoInput.addEventListener('input', () => {
      if (recognizedRepoProvider(repoInput.value)) {
        markProjectField(repoLabel, false);
      }
      syncRepoHost();
    });
    hostTokenInput.addEventListener('input', () => {
      if (hostTokenInput.value.trim()) {
        markProjectField(hostTokenLabel, false);
      }
    });

    createModeBtn.addEventListener('click', () => {
      if (submit.disabled) {
        return;
      }
      applyMode('create');
      nameInput.focus();
    });
    selectModeBtn.addEventListener('click', () => {
      if (submit.disabled) {
        return;
      }
      applyMode('select');
      channelInput.focus();
    });

    submit.addEventListener('click', () => {
      if (submit.disabled) {
        return;
      }
      error.hidden = true;
      error.textContent = '';
      markProjectField(nameLabel, false);
      markProjectField(channelLabel, false);
      markProjectField(repoLabel, false);
      markProjectField(hostTokenLabel, false);
      if (tokenInput?.parentElement instanceof HTMLElement) {
        tokenInput.parentElement.classList.remove('has-error');
      }
      const discordToken = tokenInput ? tokenInput.value.trim() : '';
      if (tokenInput && !discordToken) {
        if (tokenInput.parentElement instanceof HTMLElement) {
          tokenInput.parentElement.classList.add('has-error');
        }
        error.textContent = t('reviewFieldDiscordToken');
        error.hidden = false;
        tokenInput.focus();
        return;
      }
      if (mode === 'select') {
        const channelId = channelInput.value.trim();
        if (!channelId || !/^\d{5,}$/.test(channelId)) {
          markProjectField(channelLabel, true);
          error.textContent = channelId ? t('projectChannelInvalid') : t('projectChannelEmpty');
          error.hidden = false;
          channelInput.focus();
          return;
        }
        setProjectCreateBusy(true);
        vscode.postMessage({
          type: 'project',
          action: 'selectSubmit',
          channelId,
          discordToken: discordToken || undefined,
        });
        return;
      }
      const name = nameInput.value.trim();
      if (!name) {
        markProjectField(nameLabel, true);
        error.textContent = t('projectNameEmpty');
        error.hidden = false;
        nameInput.focus();
        return;
      }
      let channelId = '';
      if (channelRequired()) {
        channelId = channelInput.value.trim();
        if (!channelId || !/^\d{5,}$/.test(channelId)) {
          markProjectField(channelLabel, true);
          error.textContent = channelId ? t('projectChannelInvalid') : t('projectChannelEmpty');
          error.hidden = false;
          channelInput.focus();
          return;
        }
      }
      const repoUrl = repoInput.value.trim();
      const repoProvider = recognizedRepoProvider(repoUrl);
      if (!repoProvider) {
        markProjectField(repoLabel, true);
        error.textContent = t('projectRepositoryRequired');
        error.hidden = false;
        repoInput.focus();
        return;
      }
      const hostToken = hostTokenInput.value.trim();
      if (!hostToken) {
        markProjectField(hostTokenLabel, true);
        error.textContent = t(
          repoProvider === 'github' ? 'projectHostTokenGithub' : 'projectHostTokenGitlab',
        ).replace('{name}', opts.profileName || '');
        error.hidden = false;
        hostTokenInput.focus();
        return;
      }
      setProjectCreateBusy(true);
      vscode.postMessage({
        type: 'project',
        action: 'createSubmit',
        name,
        channelId: channelId || undefined,
        discordToken: discordToken || undefined,
        repoUrl,
        githubToken: repoProvider === 'github' ? hostToken : undefined,
        gitlabToken: repoProvider === 'gitlab' ? hostToken : undefined,
      });
    });
    submitWrap.append(loader, submit);
    if (cancel) {
      actions.append(cancel, submitWrap);
    } else {
      actions.append(submitWrap);
    }
    panel.append(actions);
    mountSettingsOverlay(panel, opts.gate ? () => {} : closeProjectCreatePanel);
    if (opts.gate && panel.parentElement) {
      panel.parentElement.classList.add('discord-gate-backdrop');
    }
    applyMode(mode);
    if (mode === 'select') {
      channelInput.focus();
    } else {
      nameInput.focus();
    }
  }

  function closeMapSettingsPanels() {
    closeProfileSettingsPanel();
    closePageSettingsPanel();
    closeReviewCreatePagePanel();
    closeReviewMrPanel();
    closeReviewRenamePanel();
    closeProjectCreatePanel();
    closeProjectEditPanel();
  }

  function closeDiscordGatePanel() {
    removeOverlay('discord-gate-panel');
  }

  /**
   * @param {string} field
   * @param {string} message
   */
  function applyDiscordGateError(field, message) {
    const panel = document.getElementById('discord-gate-panel');
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    const saveBtn = panel.querySelector('[data-gate-save]');
    if (saveBtn instanceof HTMLButtonElement) {
      saveBtn.disabled = false;
    }
    panel.querySelectorAll('.discord-gate-field').forEach((node) => {
      if (node instanceof HTMLElement) {
        node.classList.remove('has-error');
      }
    });
    panel.querySelectorAll('.discord-gate-field-error').forEach((node) => {
      if (node instanceof HTMLElement) {
        node.hidden = true;
        node.textContent = '';
      }
    });
    const target = panel.querySelector(`[data-gate-field="${field}"]`);
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (
      field === 'explorer' ||
      field === 'notes' ||
      field === 'links' ||
      field === 'review'
    ) {
      const extra = panel.querySelector('[data-gate-extra]');
      const extraBtn = panel.querySelector('[data-gate-extra-toggle]');
      if (extra instanceof HTMLElement) {
        extra.hidden = false;
      }
      if (extraBtn instanceof HTMLButtonElement) {
        extraBtn.setAttribute('aria-expanded', 'true');
      }
    }
    target.classList.add('has-error');
    const err = target.querySelector('.discord-gate-field-error');
    if (err instanceof HTMLElement) {
      err.hidden = false;
      err.textContent = message || '';
    }
    const input = target.querySelector('input');
    if (input instanceof HTMLInputElement) {
      input.focus();
    }
  }

  function closeReviewRenamePanel() {
    removeOverlay('review-rename-panel');
  }

  /**
   * @param {{ pageId: string, messageId: string, title: string, isPr: boolean }} opts
   */
  function openReviewRenamePanel(opts) {
    closeReviewRenamePanel();
    closeReviewCreatePagePanel();
    closePageSettingsPanel();
    closeProfileSettingsPanel();
    dismissReviewMrPanel();
    const panel = el('div', 'review-mr-panel');
    panel.id = 'review-rename-panel';
    panel.append(
      el('div', 'review-mr-people-title', t(opts.isPr ? 'reviewRenamePr' : 'reviewRenameMr')),
    );
    const nameLabel = el('label', 'review-mr-field', t('reviewRenameTitle'));
    const nameInput = document.createElement('input');
    nameInput.className = 'review-mr-title';
    nameInput.type = 'text';
    nameInput.maxLength = 200;
    nameInput.value = opts.title || '';
    nameLabel.append(nameInput);
    panel.append(nameLabel);
    const actions = el('div', 'review-mr-actions');
    const cancel = el('button', 'review-btn', t('reviewCreatePageCancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', () => closeReviewRenamePanel());
    const submit = el('button', 'review-btn is-primary', t('reviewRenameTitle'));
    submit.type = 'button';
    const send = () => {
      const title = nameInput.value.trim();
      if (!title) {
        nameInput.focus();
        return;
      }
      vscode.postMessage({
        type: 'reviewUpdateMr',
        pageId: opts.pageId,
        messageId: opts.messageId,
        title,
      });
      closeReviewRenamePanel();
    };
    submit.addEventListener('click', send);
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        send();
      }
    });
    actions.append(cancel, submit);
    panel.append(actions);
    mountSettingsOverlay(panel, closeReviewRenamePanel);
    nameInput.focus();
    nameInput.select();
  }

  function closeProfileSettingsPanel() {
    removeOverlay('profile-settings-panel');
  }

  function closePageSettingsPanel() {
    removeOverlay('page-settings-panel');
  }

  /**
   * @param {{
   *   id: string,
   *   creating: boolean,
   *   nameLocked: boolean,
   *   name: string,
   *   githubNick: string,
   *   gitlabNick: string,
   *   githubToken: string,
   *   gitlabToken: string
   * }} opts
   */
  function openProfileSettingsPanel(opts) {
    closeProfileSettingsPanel();
    closeReviewCreatePagePanel();
    closeReviewMrPanel();
    const panel = el('div', 'review-mr-panel review-create-page-panel profile-settings-panel');
    panel.id = 'profile-settings-panel';
    panel.append(
      el(
        'div',
        'review-mr-people-title',
        t(opts.creating ? 'profileSettingsCreateTitle' : 'profileSettingsTitle'),
      ),
    );

    /**
     * @param {string} labelKey
     * @param {{ value?: string, password?: boolean, disabled?: boolean, placeholderKey?: string }} field
     */
    function fieldRow(labelKey, field) {
      const label = el('label', 'review-mr-field', t(labelKey));
      const input = document.createElement('input');
      input.className = 'review-mr-title';
      input.type = field.password ? 'password' : 'text';
      input.spellcheck = false;
      input.value = field.value || '';
      if (field.password) {
        input.autocomplete = 'new-password';
      }
      if (field.placeholderKey) {
        input.placeholder = t(field.placeholderKey);
      }
      if (field.disabled) {
        input.disabled = true;
      }
      label.append(input);
      panel.append(label);
      return input;
    }

    const nameInput = fieldRow('profileFieldName', {
      value: opts.name,
      disabled: opts.nameLocked,
    });
    nameInput.maxLength = 64;
    panel.append(el('div', 'review-mr-people-title', t('labelGithub')));
    const githubNick = fieldRow('gitNickPlaceholder', {
      value: opts.githubNick,
      placeholderKey: 'gitNickPlaceholder',
    });
    const githubToken = fieldRow('gitTokenPlaceholder', {
      value: opts.githubToken,
      password: true,
      placeholderKey: 'gitTokenPlaceholder',
    });
    panel.append(el('div', 'review-mr-people-title', t('labelGitlab')));
    const gitlabNick = fieldRow('gitNickPlaceholder', {
      value: opts.gitlabNick,
      placeholderKey: 'gitNickPlaceholder',
    });
    const gitlabToken = fieldRow('gitTokenPlaceholder', {
      value: opts.gitlabToken,
      password: true,
      placeholderKey: 'gitTokenPlaceholder',
    });

    const error = el('div', 'review-panel-error');
    error.hidden = true;
    panel.append(error);

    const actions = el('div', 'review-mr-actions');
    const cancel = el('button', 'review-btn', t('reviewCreatePageCancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', () => closeProfileSettingsPanel());
    const submit = el('button', 'review-btn is-primary', t('profileSettingsSave'));
    submit.type = 'button';
    submit.addEventListener('click', () => {
      error.hidden = true;
      error.textContent = '';
      const name = nameInput.value.trim();
      if (!opts.nameLocked) {
        if (!name) {
          error.textContent = t('profileNameEmpty');
          error.hidden = false;
          nameInput.focus();
          return;
        }
        if (!isCreatableProfileName(name, opts.creating ? undefined : opts.id)) {
          error.textContent = t('profileNameTaken');
          error.hidden = false;
          nameInput.focus();
          return;
        }
      }
      vscode.postMessage({
        type: 'profileSaveSettings',
        id: opts.creating ? undefined : opts.id,
        name,
        githubNick: githubNick.value,
        gitlabNick: gitlabNick.value,
        githubToken: githubToken.value,
        gitlabToken: gitlabToken.value,
      });
    });
    actions.append(cancel, submit);
    panel.append(actions);
    mountSettingsOverlay(panel, closeProfileSettingsPanel);
    if (opts.nameLocked) {
      githubNick.focus();
    } else {
      nameInput.focus();
      nameInput.select();
    }
  }

  /** @type {(() => void) | null} */
  let detachReviewPathNav = null;
  /** @type {(() => void) | null} */
  let detachReviewTheme = null;

  function closeReviewCreatePagePanel() {
    if (detachReviewTheme) {
      detachReviewTheme();
      detachReviewTheme = null;
    }
    if (detachReviewPathNav) {
      detachReviewPathNav();
      detachReviewPathNav = null;
    }
    removeOverlay('review-create-page-panel');
  }

  /**
   * Page description: two lines tall, stretchable to three, 144 characters.
   * @param {string} value
   * @returns {{ label: HTMLLabelElement, input: HTMLTextAreaElement }}
   */
  function pageDescriptionField(value) {
    const label = el('label', 'review-mr-field');
    const head = el('span', 'review-desc-head');
    head.append(document.createTextNode(t('groupDescription')));
    const counter = el('span', 'group-panel-counter');
    const input = document.createElement('textarea');
    input.className = 'review-mr-title';
    input.rows = 2;
    input.maxLength = MAX_GROUP_DESCRIPTION_LENGTH;
    input.value = clipGroupDescriptionInput(value || '');
    const sync = () => {
      const next = clipGroupDescriptionInput(input.value);
      if (next !== input.value) {
        const caret = input.selectionStart;
        input.value = next;
        if (typeof caret === 'number') {
          const pos = Math.min(caret, next.length);
          input.setSelectionRange(pos, pos);
        }
      }
      counter.textContent = input.value.length + '/' + MAX_GROUP_DESCRIPTION_LENGTH;
    };
    input.addEventListener('input', sync);
    sync();
    head.append(counter);
    label.append(head, input);
    return { label, input };
  }

  /**
   * Name, description, Discord channel and bot of a map page, inside the map window.
   * @param {{
   *   mode: 'create' | 'edit',
   *   pageId?: string,
   *   kind?: string,
   *   name?: string,
   *   description?: string,
   *   channelId?: string,
   *   hasDiscord?: boolean,
   *   figmaToken?: string,
   *   figmaFiles?: string[]
   * }} opts
   */
  function figmaFileKeyFromInput(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) {
      return '';
    }
    const keyRe = /^[0-9A-Za-z]+$/;
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      return keyRe.test(trimmed) ? trimmed : '';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    const host = url.hostname.toLowerCase();
    if (host !== 'figma.com' && !host.endsWith('.figma.com')) {
      return '';
    }
    const kinds = new Set(['file', 'design', 'proto', 'board', 'slides']);
    const parts = url.pathname.split('/').filter((part) => part.length > 0);
    const kindAt = parts.findIndex((part) => kinds.has(part.toLowerCase()));
    if (kindAt < 0) {
      return '';
    }
    const fileKey = parts[kindAt + 1];
    if (!fileKey || !keyRe.test(fileKey)) {
      return '';
    }
    let key = fileKey;
    if (parts[kindAt + 2] && parts[kindAt + 2].toLowerCase() === 'branch') {
      const branchKey = parts[kindAt + 3];
      if (branchKey && keyRe.test(branchKey)) {
        key = branchKey;
      }
    }
    return key;
  }

  function openPageSettingsPanel(opts) {
    closePageSettingsPanel();
    closeReviewCreatePagePanel();
    closeReviewMrPanel();
    closeProfileSettingsPanel();
    const creating = opts.mode !== 'edit';
    const panel = el('div', 'review-mr-panel review-create-page-panel page-settings-panel');
    panel.id = 'page-settings-panel';
    panel.append(
      el('div', 'review-mr-people-title', t(creating ? 'pageSettingsCreateTitle' : 'pageSettingsTitle')),
    );

    /**
     * @param {string} labelKey
     * @param {{ value?: string, password?: boolean, placeholderKey?: string }} field
     */
    function fieldRow(labelKey, field) {
      const label = el('label', 'review-mr-field', t(labelKey));
      const input = document.createElement('input');
      input.className = 'review-mr-title';
      input.type = field.password ? 'password' : 'text';
      input.spellcheck = false;
      input.value = field.value || '';
      if (field.password) {
        input.autocomplete = 'new-password';
      }
      if (field.placeholderKey) {
        input.placeholder = t(field.placeholderKey);
      }
      label.append(input);
      panel.append(label);
      return input;
    }

    const nameInput = document.createElement('input');
    nameInput.className = 'review-mr-title';
    nameInput.type = 'text';
    nameInput.spellcheck = false;
    nameInput.maxLength = 64;
    nameInput.value = opts.name || '';
    nameInput.setAttribute('aria-label', t('reviewFieldPageName'));
    panel.append(nameInput);

    const selectedKind =
      opts.kind === 'notes' || opts.kind === 'links' || opts.kind === 'figma' || opts.kind === 'files'
        ? opts.kind
        : 'files';
    const kindKey =
      selectedKind === 'notes'
        ? 'pageKindNotes'
        : selectedKind === 'links'
          ? 'pageKindLinks'
          : selectedKind === 'figma'
            ? 'pageKindFigma'
            : 'pageKindFiles';
    panel.append(el('div', 'page-kind-line', t('labelPageKind') + ': ' + t(kindKey)));

    const pageDesc = pageDescriptionField(opts.description || '');
    const descInput = pageDesc.input;
    panel.append(pageDesc.label);

    const channelInput = fieldRow('labelChannelDiscord', {
      value: opts.channelId || '',
      placeholderKey: 'channelIdPlaceholder',
    });

    /** @type {HTMLInputElement | null} */
    let figmaInput = null;
    /** @type {{ label: HTMLElement, input: HTMLInputElement }[]} */
    const figmaFileRows = [];
    /** @type {HTMLButtonElement | null} */
    let figmaAdd = null;
    let onFigmaFilesChanged = () => {};
    const figmaFileMax = 10;
    if (selectedKind === 'figma') {
      const figmaLabel = el('label', 'review-mr-field', t('figmaTokenField'));
      const figmaRow = el('div', 'figma-token-row');
      const figmaTokenInput = document.createElement('input');
      figmaTokenInput.className = 'review-mr-title';
      figmaTokenInput.type = 'password';
      figmaTokenInput.spellcheck = false;
      figmaTokenInput.autocomplete = 'new-password';
      figmaTokenInput.placeholder = t('figmaTokenPlaceholder');
      figmaTokenInput.value = opts.figmaToken || '';
      const figmaHelp = el('button', 'figma-token-help', '?');
      figmaHelp.type = 'button';
      figmaHelp.title = t('figmaTokenHelp');
      figmaHelp.setAttribute('aria-label', t('figmaTokenHelp'));
      figmaHelp.setAttribute('aria-expanded', 'false');
      const figmaHint = el('div', 'figma-token-hint', t('figmaTokenHelpBody'));
      figmaHint.hidden = true;
      figmaHelp.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const open = figmaHint.hidden;
        figmaHint.hidden = !open;
        figmaHelp.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      figmaHelp.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation();
        }
      });
      figmaRow.append(figmaTokenInput, figmaHelp);
      figmaLabel.append(figmaRow);
      panel.append(figmaLabel, figmaHint);
      figmaInput = figmaTokenInput;

      figmaAdd = el('button', 'review-btn', t('figmaFilesAdd'));
      figmaAdd.type = 'button';
      figmaAdd.addEventListener('click', (event) => {
        event.preventDefault();
        addFigmaFileRow('');
        const last = figmaFileRows[figmaFileRows.length - 1];
        if (last) {
          last.input.focus();
        }
      });
      panel.append(figmaAdd);
      /**
       * @param {string} value
       */
      function addFigmaFileRow(value) {
        if (!figmaAdd || figmaFileRows.length >= figmaFileMax) {
          return;
        }
        const label = el('label', 'review-mr-field');
        const row = el('div', 'figma-token-row');
        const input = document.createElement('input');
        input.className = 'review-mr-title';
        input.type = 'text';
        input.spellcheck = false;
        input.placeholder = t('figmaFilePlaceholder');
        input.value = value || '';
        input.addEventListener('input', () => {
          label.classList.remove('has-error');
        });
        input.addEventListener('change', () => onFigmaFilesChanged());
        const remove = el('button', 'figma-token-help', '×');
        remove.type = 'button';
        remove.title = t('figmaFileRemove');
        remove.setAttribute('aria-label', t('figmaFileRemove'));
        remove.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const index = figmaFileRows.findIndex((item) => item.input === input);
          if (index >= 0) {
            figmaFileRows.splice(index, 1);
          }
          label.remove();
          syncFigmaAdd();
          onFigmaFilesChanged();
        });
        row.append(input, remove);
        label.append(row);
        figmaAdd.before(label);
        figmaFileRows.push({ label, input });
        syncFigmaAdd();
      }
      function syncFigmaAdd() {
        if (figmaAdd) {
          figmaAdd.hidden = figmaFileRows.length >= figmaFileMax;
        }
      }
      const savedFiles = Array.isArray(opts.figmaFiles) ? opts.figmaFiles.filter((item) => item) : [];
      if (savedFiles.length === 0) {
        for (let slot = 0; slot < 3; slot += 1) {
          addFigmaFileRow('');
        }
      } else {
        for (const key of savedFiles.slice(0, figmaFileMax)) {
          addFigmaFileRow(key);
        }
      }
    }

    /** @type {HTMLInputElement | null} */
    let discordInput = null;
    if (opts.hasDiscord) {
      panel.append(
        el('div', 'review-token-hint', t('reviewFieldDiscordToken') + ': ' + t('reviewTokenSaved')),
      );
    } else {
      discordInput = fieldRow('reviewFieldDiscordToken', { password: true });
    }

    const error = el('div', 'review-panel-error');
    error.hidden = true;
    panel.append(error);

    /**
     * @param {boolean} report
     * @returns {{ name: string, kind: string, description: string | undefined, channelId: string, discordToken: string | undefined, figmaToken: string | undefined, figmaFiles: string[] | undefined } | null}
     */
    function readPageForm(report) {
      const name = nameInput.value.trim();
      const channelId = channelInput.value.trim();
      const kind = selectedKind;
      if (!name) {
        if (report) {
          error.textContent = t('profileNameEmpty');
          error.hidden = false;
          nameInput.focus();
        }
        return null;
      }
      if (creating && !/^\d{5,}$/.test(channelId)) {
        if (report) {
          const channelLabel = channelInput.closest('.review-mr-field');
          if (channelLabel instanceof HTMLElement) {
            channelLabel.classList.add('has-error');
          }
          error.textContent = channelId ? t('projectChannelInvalid') : t('projectChannelEmpty');
          error.hidden = false;
          channelInput.focus();
        }
        return null;
      }
      if (!creating && channelId && !/^\d{5,}$/.test(channelId)) {
        if (report) {
          error.textContent = t('projectChannelInvalid');
          error.hidden = false;
          channelInput.focus();
        }
        return null;
      }
      /** @type {string[] | undefined} */
      let figmaFiles;
      if (selectedKind === 'figma') {
        const keys = [];
        /** @type {Map<string, HTMLElement>} */
        const seen = new Map();
        let invalid = false;
        let duplicate = false;
        for (const row of figmaFileRows) {
          row.label.classList.remove('has-error');
          const raw = row.input.value.trim();
          if (!raw) {
            continue;
          }
          const key = figmaFileKeyFromInput(raw);
          if (!key) {
            invalid = true;
            row.label.classList.add('has-error');
            continue;
          }
          const prev = seen.get(key);
          if (prev) {
            duplicate = true;
            prev.classList.add('has-error');
            row.label.classList.add('has-error');
          } else {
            seen.set(key, row.label);
            keys.push(key);
          }
        }
        if (invalid || duplicate) {
          if (report) {
            error.textContent = t(invalid ? 'figmaFileInvalid' : 'figmaFileDuplicate');
            error.hidden = false;
            const bad = panel.querySelector('.review-mr-field.has-error input');
            if (bad instanceof HTMLElement) {
              bad.focus();
            }
          }
          return null;
        }
        figmaFiles = keys;
      }
      if (report) {
        error.hidden = true;
        error.textContent = '';
      }
      return {
        name,
        kind,
        description: clipGroupDescriptionInput(descInput.value).trim() || undefined,
        channelId,
        discordToken: discordInput?.value.trim() || undefined,
        figmaToken: figmaInput ? figmaInput.value.trim() : undefined,
        figmaFiles,
      };
    }

    if (creating) {
      const actions = el('div', 'review-mr-actions');
      const cancel = el('button', 'review-btn', t('reviewCreatePageCancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', () => {
        if (panel.classList.contains('is-busy')) {
          return;
        }
        closePageSettingsPanel();
      });
      const submit = el('button', 'review-btn is-primary', t('reviewCreatePageSubmit'));
      submit.type = 'button';
      const syncPageCreateSubmit = () => {
        if (panel.classList.contains('is-busy')) {
          return;
        }
        submit.classList.toggle('is-idle', !/^\d{5,}$/.test(channelInput.value.trim()));
      };
      channelInput.addEventListener('input', () => {
        if (/^\d{5,}$/.test(channelInput.value.trim())) {
          const channelLabel = channelInput.closest('.review-mr-field');
          if (channelLabel instanceof HTMLElement) {
            channelLabel.classList.remove('has-error');
          }
        }
        syncPageCreateSubmit();
      });
      syncPageCreateSubmit();
      const submitCreate = () => {
        if (panel.classList.contains('is-busy')) {
          return;
        }
        const fields = readPageForm(true);
        if (!fields) {
          return;
        }
        setPanelBusy(panel, true);
        vscode.postMessage({
          type: 'pageSaveSettings',
          kind: fields.kind,
          name: fields.name,
          description: fields.description,
          channelId: fields.channelId,
          discordToken: fields.discordToken,
          figmaToken: fields.figmaToken,
          figmaFiles: fields.figmaFiles,
        });
      };
      submit.addEventListener('click', submitCreate);
      bindSettingsCommitKey(panel, submitCreate);
      actions.append(cancel, submit);
      panel.append(actions);
    } else {
      let savedSig = JSON.stringify({
        name: (opts.name || '').trim(),
        description: clipGroupDescriptionInput(opts.description || '').trim(),
        channelId: (opts.channelId || '').trim(),
        discordToken: '',
        figmaToken: figmaInput ? figmaInput.value.trim() : '',
        figmaFiles: (Array.isArray(opts.figmaFiles) ? opts.figmaFiles : []).join('\n'),
      });
      /**
       * @param {boolean} [closeAfter]
       */
      const saveEditing = (closeAfter) => {
        const fields = readPageForm(true);
        if (!fields) {
          return;
        }
        const sig = JSON.stringify({
          name: fields.name,
          description: fields.description || '',
          channelId: fields.channelId,
          discordToken: fields.discordToken || '',
          figmaToken: fields.figmaToken || '',
          figmaFiles: (fields.figmaFiles || []).join('\n'),
        });
        if (sig !== savedSig) {
          savedSig = sig;
          vscode.postMessage({
            type: 'pageSaveSettings',
            pageId: opts.pageId,
            name: fields.name,
            description: fields.description,
            channelId: fields.channelId,
            discordToken: fields.discordToken,
            figmaToken: fields.figmaToken,
            figmaFiles: fields.figmaFiles,
          });
        }
        if (closeAfter) {
          closePageSettingsPanel();
        }
      };
      nameInput.addEventListener('change', () => saveEditing(false));
      descInput.addEventListener('change', () => saveEditing(false));
      channelInput.addEventListener('change', () => saveEditing(false));
      if (discordInput) {
        discordInput.addEventListener('change', () => saveEditing(false));
      }
      if (figmaInput) {
        figmaInput.addEventListener('change', () => saveEditing(false));
      }
      onFigmaFilesChanged = () => saveEditing(false);
      bindSettingsCommitKey(panel, () => saveEditing(true));
    }
    mountSettingsOverlay(panel, closePageSettingsPanel);
    nameInput.focus();
    if (!creating) {
      nameInput.select();
    }
  }

  /**
   * Scheme name list under the page description. The menu stays in the panel flow
   * so the settings scroller does not clip it.
   * @param {unknown} initial
   * @param {(scheme: string) => void} onPick
   */
  function mountReviewThemeField(initial, onPick) {
    let scheme = normalizeReviewScheme(initial);
    let open = false;
    const label = el('div', 'review-mr-field');
    label.append(el('span', 'review-desc-head', t('reviewFieldTheme')));
    const strip = el('button', 'review-theme-strip');
    strip.type = 'button';
    strip.setAttribute('aria-haspopup', 'listbox');
    const current = el('span', 'review-theme-current');
    strip.append(current);
    const menu = el('div', 'review-theme-menu');
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    /** @type {HTMLButtonElement[]} */
    const options = REVIEW_SCHEME_IDS.map((id) => {
      const option = el('button', 'review-theme-option', REVIEW_SCHEME_LABELS[id] || id);
      option.type = 'button';
      option.dataset.scheme = id;
      option.setAttribute('role', 'option');
      option.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        scheme = id;
        open = false;
        menu.hidden = true;
        paintOptions();
        fill();
        onPick(scheme);
      });
      return option;
    });
    menu.append(...options);
    const paintOptions = () => {
      for (const option of options) {
        const active = option.dataset.scheme === scheme;
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    };
    const fill = () => {
      current.textContent = REVIEW_SCHEME_LABELS[scheme] || scheme;
      strip.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    strip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      open = !open;
      menu.hidden = !open;
      fill();
    });
    const onPointer = (event) => {
      if (!open || !(event.target instanceof Node) || label.contains(event.target)) {
        return;
      }
      open = false;
      menu.hidden = true;
      fill();
    };
    const onKey = (event) => {
      if (!open || event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      open = false;
      menu.hidden = true;
      fill();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    detachReviewTheme = () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
    fill();
    paintOptions();
    label.append(strip, menu);
    return { label, theme: () => scheme };
  }

  /**
   * @param {{
   *   origin: string,
   *   suggestedProvider: 'gitlab' | 'github',
   *   hasGitlab: boolean,
   *   hasGithub: boolean,
   *   hasDiscord: boolean,
   *   pageId?: string,
   *   name?: string,
   *   description?: string,
   *   channelId?: string,
   *   repoUrl?: string,
   *   projectRepoLocked?: boolean,
   *   githubToken?: string,
   *   gitlabToken?: string,
   *   reviewSkillPath?: string,
   *   reviewFixSkillPath?: string,
   *   explainSkillPath?: string,
   *   studySkillPath?: string,
   *   reviewDirPath?: string,
   *   reviewModel?: string,
   *   reviewFixModel?: string,
   *   reviewPrintThinking?: boolean,
   *   reviewPrintTools?: boolean,
   *   reviewScheme?: string
   * }} opts
   */
  function openReviewCreatePagePanel(opts) {
    closeReviewCreatePagePanel();
    closeReviewMrPanel();
    closeProfileSettingsPanel();
    const editing = !!opts.pageId;
    const panel = el('div', 'review-mr-panel review-create-page-panel');
    panel.id = 'review-create-page-panel';
    if (editing) {
      panel.append(el('div', 'review-mr-people-title', t('reviewPageSettingsTitle')));
    } else {
      const header = el('div', 'review-create-page-header');
      header.append(el('div', 'review-mr-people-title', t('reviewCreatePageTitle')));
      const headerLinks = el('div', 'review-create-page-links');
      const howTo = el('button', 'review-howto-link', t('reviewHowToConnect'));
      howTo.type = 'button';
      howTo.addEventListener('click', () => {
        vscode.postMessage({ type: 'reviewOpenSetupDoc' });
      });
      const promptEx = el('button', 'review-howto-link', t('reviewPromptExample'));
      promptEx.type = 'button';
      promptEx.addEventListener('click', () => {
        vscode.postMessage({ type: 'reviewOpenPromptExample' });
      });
      headerLinks.append(howTo, promptEx);
      header.append(headerLinks);
      panel.append(header);
    }

    /**
     * @param {string} labelKey
     * @param {{ type?: string, value?: string, placeholder?: string, password?: boolean }} field
     */
    function fieldRow(labelKey, field) {
      const label = el('label', 'review-mr-field', t(labelKey));
      const input = document.createElement('input');
      input.className = 'review-mr-title';
      input.type = field.password ? 'password' : field.type || 'text';
      if (field.value) {
        input.value = field.value;
      }
      if (field.placeholder) {
        input.placeholder = field.placeholder;
      }
      label.append(input);
      panel.append(label);
      return input;
    }

    const nameInput = fieldRow('reviewFieldPageName', {
      placeholder: 'Review',
      value: opts.name || '',
    });
    const pageDesc = pageDescriptionField(opts.description || '');
    const descInput = pageDesc.input;
    panel.append(pageDesc.label);
    const themeField = mountReviewThemeField(opts.reviewScheme, (scheme) => {
      vscode.postMessage({ type: 'reviewSetScheme', scheme });
    });
    panel.append(themeField.label);
    const channelInput = fieldRow('reviewFieldChannelId', {
      placeholder: '123456789012345678',
      value: opts.channelId || '',
    });

    /** @type {'gitlab' | 'github'} */
    let provider = opts.suggestedProvider === 'github' ? 'github' : 'gitlab';
    const hostBox = el('div', 'review-provider-row');
    hostBox.append(el('div', 'review-mr-people-title', t('reviewFieldProvider')));
    const repoRow = el('div', 'project-repo-row');
    const repoInput = document.createElement('input');
    repoInput.className = 'review-mr-title';
    repoInput.type = 'text';
    repoInput.spellcheck = false;
    repoInput.placeholder = t('projectRepoPlaceholder');
    repoInput.value = opts.repoUrl || (opts.projectRepoLocked ? '' : opts.origin);
    if (opts.projectRepoLocked) {
      repoInput.readOnly = true;
      repoInput.setAttribute('aria-readonly', 'true');
    }
    const repoHost = el('span', 'project-repo-host');
    repoHost.hidden = true;
    repoHost.setAttribute('aria-live', 'polite');
    repoRow.append(repoInput, repoHost);
    hostBox.append(repoRow);
    panel.append(hostBox);

    const hostTokenSlot = el('div', 'review-host-token-slot');
    hostTokenSlot.hidden = true;
    panel.append(hostTokenSlot);

    /** @type {HTMLInputElement | null} */
    let hostTokenInput = null;
    /** @type {'' | 'gitlab' | 'github'} */
    let renderedHost = '';

    function renderHostToken() {
      hostTokenSlot.replaceChildren();
      const labelKey = provider === 'github' ? 'reviewFieldGithubToken' : 'reviewFieldGitlabToken';
      const label = el('label', 'review-mr-field', t(labelKey));
      const input = document.createElement('input');
      input.className = 'review-mr-title';
      input.type = 'password';
      input.spellcheck = false;
      input.autocomplete = 'new-password';
      input.value = provider === 'github' ? opts.githubToken || '' : opts.gitlabToken || '';
      label.append(input);
      hostTokenSlot.append(label);
      hostTokenInput = input;
      renderedHost = provider;
      if (editing) {
        input.addEventListener('change', () => saveEditing());
      }
    }

    function syncReviewRepoHost() {
      const detected = recognizedRepoProvider(repoInput.value);
      if (!detected) {
        if (hostTokenInput) {
          if (provider === 'github') opts.githubToken = hostTokenInput.value;
          else opts.gitlabToken = hostTokenInput.value;
        }
        repoHost.hidden = true;
        repoHost.textContent = '';
        hostTokenSlot.hidden = true;
        renderedHost = '';
        return;
      }
      if (hostTokenInput && provider !== detected) {
        if (provider === 'github') opts.githubToken = hostTokenInput.value;
        else opts.gitlabToken = hostTokenInput.value;
      }
      provider = detected;
      repoHost.hidden = false;
      repoHost.textContent = t(detected === 'github' ? 'reviewProviderGithub' : 'reviewProviderGitlab');
      hostTokenSlot.hidden = false;
      if (renderedHost !== detected) {
        renderHostToken();
      }
    }

    repoInput.addEventListener('input', () => {
      syncReviewRepoHost();
    });
    syncReviewRepoHost();

    /** @type {HTMLInputElement | null} */
    let discordInput = null;
    if (opts.hasDiscord) {
      const saved = el('div', 'review-token-hint', t('reviewFieldDiscordToken') + ': ' + t('reviewTokenSaved'));
      panel.append(saved);
    } else {
      discordInput = fieldRow('reviewFieldDiscordToken', { password: true });
    }

    /** @type {HTMLInputElement | null} */
    let skillInput = null;
    /** @type {HTMLInputElement | null} */
    let fixSkillInput = null;
    /** @type {HTMLInputElement | null} */
    let explainSkillInput = null;
    /** @type {HTMLInputElement | null} */
    let studySkillInput = null;
    /** @type {HTMLInputElement | null} */
    let dirInput = null;
    /** @type {HTMLInputElement | null} */
    let modelInput = null;
    /** @type {HTMLInputElement | null} */
    let printThinkingInput = null;
    /** @type {HTMLInputElement | null} */
    let printToolsInput = null;
    /** Flushes skill, directory, and model fields. Set when the review page is being edited. */
    let flushReviewAgentFields = () => {};
    if (editing) {
      /**
       * @param {string} labelKey
       * @param {string} value
       * @param {'skill' | 'fix' | 'explain' | 'study' | 'dir' | 'model'} kind
       */
      function reviewAgentField(labelKey, value, kind) {
        const label = el('label', 'review-mr-field', t(labelKey));
        const row = el('div', 'review-path-field');
        const input = document.createElement('input');
        input.className = 'review-mr-title' + (kind === 'model' ? ' review-model-input' : '');
        input.type = 'text';
        input.spellcheck = false;
        input.value = value;
        if (kind === 'model') {
          input.autocapitalize = 'none';
          input.autocomplete = 'off';
          input.placeholder = 'grok-4.7-high-fast';
          input.addEventListener('input', () => {
            const next = input.value.toLowerCase();
            if (next === input.value) {
              return;
            }
            const start = input.selectionStart;
            const end = input.selectionEnd;
            input.value = next;
            if (start !== null && end !== null) {
              input.setSelectionRange(start, end);
            }
          });
        }
        row.append(input);
        if (kind !== 'model') {
          const browse = el('button', 'review-btn review-path-browse', '…');
          browse.type = 'button';
          browse.title = t('browseProject');
          browse.setAttribute('aria-label', t('browseProject'));
          browse.addEventListener('click', () => openReviewPathNav(kind, input));
          row.append(browse);
        }
        label.append(row);
        panel.append(label);
        return input;
      }

      skillInput = reviewAgentField('labelReviewSkillPath', opts.reviewSkillPath || '', 'skill');
      fixSkillInput = reviewAgentField('labelReviewFixSkillPath', opts.reviewFixSkillPath || '', 'fix');
      explainSkillInput = reviewAgentField(
        'labelExplainSkillPath',
        opts.explainSkillPath || '',
        'explain',
      );
      studySkillInput = reviewAgentField(
        'labelStudySkillPath',
        opts.studySkillPath || '',
        'study',
      );
      dirInput = reviewAgentField('labelReviewDirPath', opts.reviewDirPath || '', 'dir');
      modelInput = reviewAgentField('labelReviewModel', (opts.reviewModel || '').toLowerCase(), 'model');

      /**
       * @param {string} labelKey
       * @param {boolean} checked
       */
      function reviewAgentFlag(labelKey, checked) {
        const label = el('label', 'review-terminal-flag');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        label.append(input, el('span', 'review-terminal-flag-text', t(labelKey)));
        panel.append(label);
        return input;
      }

      printThinkingInput = reviewAgentFlag('labelReviewPrintThinking', opts.reviewPrintThinking === true);
      printToolsInput = reviewAgentFlag('labelReviewPrintTools', opts.reviewPrintTools !== false);

      function saveReviewPaths() {
        if (!(skillInput instanceof HTMLInputElement) || !(dirInput instanceof HTMLInputElement)) {
          return;
        }
        const reviewSkillPath = skillInput.value.trim();
        const reviewFixSkillPath =
          fixSkillInput instanceof HTMLInputElement ? fixSkillInput.value.trim() : '';
        const explainSkillPath =
          explainSkillInput instanceof HTMLInputElement ? explainSkillInput.value.trim() : '';
        const studySkillPath =
          studySkillInput instanceof HTMLInputElement ? studySkillInput.value.trim() : '';
        const reviewDirPath = dirInput.value.trim();
        const reviewModel = modelInput instanceof HTMLInputElement ? modelInput.value.trim().toLowerCase() : '';
        const reviewPrintThinking =
          printThinkingInput instanceof HTMLInputElement && printThinkingInput.checked;
        const reviewPrintTools = !(printToolsInput instanceof HTMLInputElement) || printToolsInput.checked;
        if (
          reviewSkillPath === (opts.reviewSkillPath || '') &&
          reviewFixSkillPath === (opts.reviewFixSkillPath || '') &&
          explainSkillPath === (opts.explainSkillPath || '') &&
          studySkillPath === (opts.studySkillPath || '') &&
          reviewDirPath === (opts.reviewDirPath || '') &&
          reviewModel === (opts.reviewModel || '').toLowerCase() &&
          reviewPrintThinking === (opts.reviewPrintThinking === true) &&
          reviewPrintTools === (opts.reviewPrintTools !== false)
        ) {
          return;
        }
        opts.reviewSkillPath = reviewSkillPath;
        opts.reviewFixSkillPath = reviewFixSkillPath;
        opts.explainSkillPath = explainSkillPath;
        opts.studySkillPath = studySkillPath;
        opts.reviewDirPath = reviewDirPath;
        opts.reviewModel = reviewModel;
        opts.reviewPrintThinking = reviewPrintThinking;
        opts.reviewPrintTools = reviewPrintTools;
        vscode.postMessage({
          type: 'setReviewPaths',
          reviewSkillPath,
          reviewFixSkillPath,
          explainSkillPath,
          studySkillPath,
          reviewDirPath,
          reviewModel,
          reviewPrintThinking,
          reviewPrintTools,
        });
      }

      flushReviewAgentFields = saveReviewPaths;
      for (const input of [skillInput, fixSkillInput, explainSkillInput, studySkillInput, dirInput, modelInput, printThinkingInput, printToolsInput]) {
        input.addEventListener('change', () => saveReviewPaths());
      }

      /** @type {HTMLInputElement | null} */
      let navTarget = null;
      let browseSeq = 0;
      let navRel = '';
      const pathNav = el('div', 'review-path-nav');
      pathNav.id = 'review-path-nav';
      pathNav.hidden = true;
      const pathPanel = el('div', 'review-path-nav-panel');
      pathPanel.setAttribute('role', 'dialog');
      const pathTitle = el('div', 'review-path-nav-title', '');
      const pathBar = el('div', 'review-path-nav-bar');
      const pathUp = el('button', 'review-path-nav-icon', '↑');
      pathUp.type = 'button';
      pathUp.title = t('pathNavUp');
      const pathCrumbs = el('div', 'review-path-nav-crumbs');
      const pathClose = el('button', 'review-path-nav-icon', '×');
      pathClose.type = 'button';
      pathClose.title = t('pathNavClose');
      pathBar.append(pathUp, pathCrumbs, pathClose);
      const pathList = el('div', 'review-path-nav-list');
      pathList.tabIndex = -1;
      const pathFoot = el('div', 'review-path-nav-foot');
      const pathPick = el('button', 'review-btn', t('pathNavSelectDir'));
      pathPick.type = 'button';
      pathFoot.append(pathPick);
      pathPanel.append(pathTitle, pathBar, pathList, pathFoot);
      pathNav.append(pathPanel);
      document.body.append(pathNav);

      function closeReviewPathNav() {
        pathNav.hidden = true;
      }

      function requestReviewDir(rel) {
        browseSeq += 1;
        navRel = rel || '';
        vscode.postMessage({ type: 'listProjectDir', seq: browseSeq, rel: navRel });
      }

      function chooseReviewPath(rel) {
        if (!(navTarget instanceof HTMLInputElement)) {
          return;
        }
        navTarget.value = rel || '.';
        closeReviewPathNav();
        navTarget.dispatchEvent(new Event('change'));
      }

      /**
       * @param {{ relDir?: string, entries?: Array<{ name: string, relPath: string, isDir: boolean }>, error?: string }} payload
       */
      function renderReviewPathNav(payload) {
        navRel = payload && typeof payload.relDir === 'string' ? payload.relDir : '';
        pathUp.disabled = !navRel;
        pathCrumbs.replaceChildren();
        const rootBtn = el('button', 'review-path-crumb', t('pathNavRoot'));
        rootBtn.type = 'button';
        rootBtn.addEventListener('click', () => requestReviewDir(''));
        pathCrumbs.append(rootBtn);
        if (navRel) {
          let acc = '';
          for (const part of navRel.split('/')) {
            acc = acc ? acc + '/' + part : part;
            pathCrumbs.append(el('span', 'review-path-crumb-sep', '/'));
            const crumb = el('button', 'review-path-crumb', part);
            crumb.type = 'button';
            const target = acc;
            crumb.addEventListener('click', () => requestReviewDir(target));
            pathCrumbs.append(crumb);
          }
        }
        pathList.replaceChildren();
        const entries = payload && Array.isArray(payload.entries) ? payload.entries : [];
        if (payload && payload.error) {
          pathList.append(el('p', 'review-path-nav-empty', t('pathNavUnreadable')));
        } else if (entries.length === 0) {
          pathList.append(el('p', 'review-path-nav-empty', t('pathNavEmpty')));
        }
        for (const entry of entries) {
          const row = el('div', 'review-path-nav-row');
          const open = el('button', 'review-path-nav-open');
          open.type = 'button';
          open.append(el('span', 'review-path-nav-mark', entry.isDir ? '▸' : ''), el('span', 'review-path-nav-name', entry.name));
          if (entry.isDir) {
            open.addEventListener('click', () => requestReviewDir(entry.relPath));
            const pick = el('button', 'review-btn review-path-nav-pick', t('pathNavPick'));
            pick.type = 'button';
            pick.addEventListener('click', () => chooseReviewPath(entry.relPath));
            row.append(open, pick);
          } else {
            open.title = t('pathNavPick');
            open.addEventListener('click', () => chooseReviewPath(entry.relPath));
            row.append(open);
          }
          pathList.append(row);
        }
      }

      /**
       * @param {'skill' | 'fix' | 'explain' | 'study' | 'dir'} kind
       * @param {HTMLInputElement} input
       */
      function openReviewPathNav(kind, input) {
        navTarget = input;
        pathTitle.textContent = t(
          kind === 'dir'
            ? 'labelReviewDirPath'
            : kind === 'explain'
              ? 'labelExplainSkillPath'
              : kind === 'study'
                ? 'labelStudySkillPath'
              : kind === 'fix'
                ? 'labelReviewFixSkillPath'
                : 'labelReviewSkillPath',
        );
        pathNav.hidden = false;
        requestReviewDir(input.value);
        pathList.focus();
      }

      pathUp.addEventListener('click', () => {
        requestReviewDir(navRel.includes('/') ? navRel.slice(0, navRel.lastIndexOf('/')) : '');
      });
      pathClose.addEventListener('click', () => closeReviewPathNav());
      pathPick.addEventListener('click', () => chooseReviewPath(navRel));
      pathNav.addEventListener('click', (event) => {
        if (event.target === pathNav) {
          closeReviewPathNav();
        }
      });
      function onReviewPathKey(event) {
        if (event.key === 'Escape' && !pathNav.hidden) {
          event.stopPropagation();
          closeReviewPathNav();
        }
      }
      function onReviewPathMessage(event) {
        if (event.data?.type === 'projectDir' && event.data.seq === browseSeq) {
          renderReviewPathNav(event.data);
        }
      }
      document.addEventListener('keydown', onReviewPathKey, true);
      window.addEventListener('message', onReviewPathMessage);
      detachReviewPathNav = () => {
        document.removeEventListener('keydown', onReviewPathKey, true);
        window.removeEventListener('message', onReviewPathMessage);
        pathNav.remove();
      };
    }

    const error = el('div', 'review-panel-error');
    error.hidden = true;
    panel.append(error);

    /**
     * @param {boolean | 'focus'} report
     * @returns {Record<string, string | undefined> | null}
     */
    function readReviewPageForm(report) {
      const name = nameInput.value.trim();
      const channelId = channelInput.value.trim();
      const repoUrl = repoInput.value.trim();
      const fail = (key, input) => {
        if (report) {
          error.textContent = t(key);
          error.hidden = false;
          if (report === 'focus' && input instanceof HTMLElement) {
            input.focus();
          }
        }
        return null;
      };
      if (!name) {
        return fail('reviewFieldPageName', nameInput);
      }
      if (!/^\d{5,}$/.test(channelId)) {
        return fail('reviewFieldChannelId', channelInput);
      }
      const detected = recognizedRepoProvider(repoUrl);
      if (!detected) {
        return fail('projectRepositoryRequired', repoInput);
      }
      provider = detected;
      if (hostTokenSlot.hidden) {
        syncReviewRepoHost();
      }
      const hostLabelKey = provider === 'github' ? 'reviewFieldGithubToken' : 'reviewFieldGitlabToken';
      if (!(hostTokenInput?.value || '').trim()) {
        return fail(hostLabelKey, hostTokenInput);
      }
      if (!opts.hasDiscord && !(discordInput?.value || '').trim()) {
        return fail('reviewFieldDiscordToken', discordInput);
      }
      const hostToken = hostTokenInput?.value.trim() || '';
      if (provider === 'github') opts.githubToken = hostToken;
      else opts.gitlabToken = hostToken;
      if (report) {
        error.hidden = true;
        error.textContent = '';
      }
      return {
        name,
        provider,
        channelId,
        repoUrl,
        description: clipGroupDescriptionInput(descInput.value).trim() || undefined,
        gitlabToken: (opts.gitlabToken || '').trim() || undefined,
        githubToken: (opts.githubToken || '').trim() || undefined,
        discordToken: discordInput?.value.trim() || undefined,
      };
    }

    let savedSig = '';

    /**
     * @param {boolean | 'focus'} [report]
     * @returns {boolean}
     */
    function saveEditing(report) {
      if (!editing) {
        return false;
      }
      const fields = readReviewPageForm(report === undefined ? true : report);
      if (!fields) {
        return false;
      }
      const sig = JSON.stringify(fields);
      if (sig !== savedSig) {
        savedSig = sig;
        vscode.postMessage({
          type: 'reviewUpdatePage',
          pageId: opts.pageId,
          ...fields,
        });
      }
      return true;
    }

    const reviewSkillIconPath = {
      download:
        'M3 19H21V21H3V19ZM13 13.1716L19.0711 7.1005L20.4853 8.51472L12 17L3.51472 8.51472L4.92893 7.1005L11 13.1716V2H13V13.1716Z',
      copy:
        'M6.99979 7V3C6.99979 2.44772 7.4475 2 7.99979 2H20.9998C21.5521 2 21.9998 2.44772 21.9998 3V16C21.9998 16.5523 21.5521 17 20.9998 17H17V20.9925C17 21.5489 16.551 22 15.9925 22H3.00728C2.45086 22 2 21.5511 2 20.9925L2.00276 8.00748C2.00288 7.45107 2.4518 7 3.01025 7H6.99979ZM8.99979 7H15.9927C16.549 7 17 7.44892 17 8.00748V15H19.9998V4H8.99979V7ZM4.00255 9L4.00021 20H15V9H4.00255Z',
    };

    /**
     * @param {'download' | 'copy'} kind
     * @param {string} label
     * @param {() => void} onClick
     */
    function reviewSkillIconButton(kind, label, onClick) {
      const button = el('button', 'review-skill-icon');
      button.type = 'button';
      button.title = label;
      button.setAttribute('aria-label', label);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('d', reviewSkillIconPath[kind]);
      svg.append(path);
      button.append(svg);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return button;
    }

    /**
     * Skill sample: the label opens the doc, the icons save or copy it.
     * @param {'review' | 'explain' | 'study'} which
     * @param {string} label
     */
    function reviewSkillCard(which, label) {
      const card = el('div', 'review-doc-card');
      const open = el('button', 'review-doc-open', label);
      open.type = 'button';
      open.addEventListener('click', () => {
        vscode.postMessage({ type: 'reviewSkillFile', which, action: 'open' });
      });
      const icons = el('div', 'review-skill-icons');
      icons.append(
        reviewSkillIconButton('download', t('reviewSkillDownload'), () => {
          vscode.postMessage({ type: 'reviewSkillFile', which, action: 'save' });
        }),
        reviewSkillIconButton('copy', t('reviewSkillCopy'), () => {
          vscode.postMessage({ type: 'reviewSkillFile', which, action: 'copy' });
        }),
      );
      card.append(open, icons);
      return card;
    }

    if (editing) {
      const initial = readReviewPageForm(false);
      savedSig = initial ? JSON.stringify(initial) : '';
      for (const input of [nameInput, descInput, channelInput, repoInput, discordInput]) {
        input?.addEventListener('change', () => saveEditing());
      }
      const docs = el('div', 'review-settings-docs');
      const howTo = el('button', 'review-doc-card', t('reviewHowToConnect'));
      howTo.type = 'button';
      howTo.addEventListener('click', () => {
        vscode.postMessage({ type: 'reviewOpenSetupDoc' });
      });
      docs.append(
        howTo,
        reviewSkillCard('review', t('reviewPromptExampleShort')),
        reviewSkillCard('explain', t('explainMenu')),
        reviewSkillCard('study', t('studyPromptExample')),
      );
      panel.append(docs);
      const whyWrap = el('div', 'review-skill-why-wrap');
      const whyLink = el('button', 'review-skill-why-link');
      whyLink.type = 'button';
      whyLink.setAttribute('aria-expanded', 'false');
      const whyChev = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      whyChev.setAttribute('viewBox', '0 0 16 16');
      whyChev.setAttribute('class', 'review-skill-why-chev');
      whyChev.setAttribute('aria-hidden', 'true');
      const whyChevPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      whyChevPath.setAttribute('d', 'M6 4l4 4-4 4');
      whyChevPath.setAttribute('fill', 'none');
      whyChevPath.setAttribute('stroke', 'currentColor');
      whyChevPath.setAttribute('stroke-width', '1.5');
      whyChevPath.setAttribute('stroke-linecap', 'round');
      whyChevPath.setAttribute('stroke-linejoin', 'round');
      whyChev.append(whyChevPath);
      whyLink.append(whyChev, document.createTextNode(t('reviewSkillsWhy')));
      const whyBody = el('p', 'review-skill-why', t('reviewSkillsWhyBody'));
      whyBody.hidden = true;
      whyLink.addEventListener('click', () => {
        const open = whyBody.hidden;
        whyBody.hidden = !open;
        whyLink.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      const copied = el('p', 'review-skill-copied');
      copied.id = 'review-skill-copied';
      copied.hidden = true;
      copied.setAttribute('aria-live', 'polite');
      whyWrap.append(whyLink, whyBody, copied);
      panel.append(whyWrap);
    } else {
      const actions = el('div', 'review-mr-actions');
      const cancel = el('button', 'review-btn', t('reviewCreatePageCancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', () => {
        if (panel.classList.contains('is-busy')) {
          return;
        }
        closeReviewCreatePagePanel();
      });
      const submit = el('button', 'review-btn is-primary', t('reviewCreatePageSubmit'));
      submit.type = 'button';
      const submitCreate = () => {
        if (panel.classList.contains('is-busy')) {
          return;
        }
        const fields = readReviewPageForm('focus');
        if (!fields) {
          return;
        }
        setPanelBusy(panel, true);
        vscode.postMessage({
          type: 'reviewCreatePage',
          ...fields,
        });
      };
      submit.addEventListener('click', submitCreate);
      bindSettingsCommitKey(panel, submitCreate);
      actions.append(cancel, submit);
      panel.append(actions);
    }
    if (editing) {
      bindSettingsCommitKey(panel, () => {
        if (!saveEditing('focus')) {
          return;
        }
        flushReviewAgentFields();
        closeReviewCreatePagePanel();
      });
    }
    mountSettingsOverlay(panel, closeReviewCreatePagePanel);
    nameInput.focus();
  }

  function openReviewMrPanel() {
    dismissReviewMrPanel();
    closeHostBranchPanel();
    closeProfileSettingsPanel();
    if (!reviewMrPanel) {
      return;
    }
    const isGithub = reviewMrPanel.provider === 'github';
    const createLabel = t(isGithub ? 'createPr' : 'createMr');
    const panel = el('div', 'review-mr-panel');
    panel.id = 'review-mr-panel';
    const titleRow = el('div', 'review-mr-title-row');
    const draftChip = el('button', 'review-btn review-draft-chip is-primary', 'Draft');
    draftChip.type = 'button';
    draftChip.dataset.on = '1';
    draftChip.addEventListener('click', () => {
      const on = draftChip.dataset.on === '1';
      draftChip.dataset.on = on ? '0' : '1';
      draftChip.classList.toggle('is-primary', !on);
    });
    const titleInput = document.createElement('input');
    titleInput.className = 'review-mr-title';
    titleInput.placeholder = t(isGithub ? 'reviewPrTitlePlaceholder' : 'reviewMrTitlePlaceholder');
    titleRow.append(draftChip, titleInput);
    panel.append(titleRow);

    const branchLabel = el('label', 'review-mr-field', createLabel);
    const branchSelect = document.createElement('select');
    branchSelect.className = 'review-mr-select';
    for (const branch of reviewMrPanel.branches) {
      const opt = document.createElement('option');
      opt.value = branch;
      opt.textContent = branch + (branch === reviewMrPanel.parent ? ' ←' : '');
      if (branch === reviewMrPanel.parent) {
        opt.selected = true;
      }
      branchSelect.append(opt);
    }
    if (!reviewMrPanel.branches.length && reviewMrPanel.parent) {
      const opt = document.createElement('option');
      opt.value = reviewMrPanel.parent;
      opt.textContent = reviewMrPanel.parent;
      opt.selected = true;
      branchSelect.append(opt);
    }
    branchLabel.append(branchSelect);
    panel.append(branchLabel);

    /** @type {Set<string>} */
    const reviewers = new Set();
    /** @type {Set<string>} */
    const assignees = new Set();
    if (reviewMrPanel.defaultAssignee) {
      assignees.add(reviewMrPanel.defaultAssignee);
    }
    const peopleBox = el('div', 'review-mr-people');
    peopleBox.append(el('div', 'review-mr-people-title', 'Reviewers / Assignees'));
    for (const person of reviewMrPanel.people) {
      const row = el('div', 'review-mr-person');
      const label = person.name ? person.name + ' (' + person.nick + ')' : person.nick;
      row.append(el('span', 'review-mr-person-name', label));
      const rev = el('button', 'review-person-toggle', 'R');
      rev.type = 'button';
      rev.title = 'Reviewer';
      rev.addEventListener('click', () => {
        if (reviewers.has(person.nick)) {
          reviewers.delete(person.nick);
          rev.classList.remove('is-on');
        } else {
          reviewers.add(person.nick);
          rev.classList.add('is-on');
        }
      });
      const asg = el('button', 'review-person-toggle', 'A');
      asg.type = 'button';
      asg.title = 'Assignee';
      if (assignees.has(person.nick)) {
        asg.classList.add('is-on');
      }
      asg.addEventListener('click', () => {
        if (assignees.has(person.nick)) {
          assignees.delete(person.nick);
          asg.classList.remove('is-on');
        } else {
          assignees.add(person.nick);
          asg.classList.add('is-on');
        }
      });
      row.append(rev, asg);
      peopleBox.append(row);
    }
    if (reviewMrPanel.people.length) {
      panel.append(peopleBox);
    }

    const squash = document.createElement('input');
    squash.type = 'checkbox';
    squash.checked = true;
    if (!isGithub) {
      const squashRow = el('label', 'review-mr-field review-mr-squash');
      squashRow.append(squash, document.createTextNode(' Squash'));
      panel.append(squashRow);
    }

    const actions = el('div', 'review-mr-actions');
    const cancel = el('button', 'review-btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => closeReviewMrPanel());
    const submit = el('button', 'review-btn is-primary', createLabel);
    submit.type = 'button';
    submit.addEventListener('click', () => {
      const title = titleInput.value.trim();
      if (!title) {
        titleInput.focus();
        return;
      }
      const pageId = reviewMrPanel?.pageId;
      if (!pageId) {
        return;
      }
      beginLocalMrSkeleton(pageId, title, draftChip.dataset.on === '1');
      vscode.postMessage({
        type: 'reviewCreateMr',
        pageId,
        title,
        draft: draftChip.dataset.on === '1',
        targetBranch: branchSelect.value,
        reviewers: [...reviewers],
        assignees: [...assignees],
        squash: squash.checked,
      });
      closeReviewMrPanel();
    });
    actions.append(cancel, submit);
    panel.append(actions);
    mountSettingsOverlay(panel, closeReviewMrPanel);
    titleInput.focus();
  }

  function paintLinksPage() {
    const links = pageLinks();
    const key = linkStructureKey(links);
    const tree = root.querySelector(':scope > .links-tree');
    if (
      key === linksStructureKey &&
      tree &&
      !tree.classList.contains('page-skel') &&
      !root.classList.contains('is-page-skeleton') &&
      root.classList.contains('links-page') &&
      !data?.error
    ) {
      syncLinkCollapsed();
      setCollapseButton();
      mountLinkPanel(links);
      return;
    }
    linksStructureKey = key;
    removeLinkPanelBackdrop();
    const folds = captureFolds();
    foldToken += 1;
    isFolding = false;
    setCollapseButton();
    root.textContent = '';
    root.removeAttribute('data-syn3-context');
    root.className = 'map-page links-page';
    clearDropHighlights();
    if (data.error) {
      root.append(el('div', 'error', data.error));
    }
    const roots = links.filter((link) => !link.parent).sort((a, b) => a.order - b.order);
    if (roots.length === 0) {
      root.append(el('div', 'empty', 'Пока пусто. Нажми «Создать», чтобы добавить макет.'));
      return;
    }
    const byId = Object.fromEntries(links.map((link) => [link.id, link]));
    const nextTree = el('div', 'links-tree');
    roots.forEach((link, index) => {
      nextTree.append(renderLinkNode(link, byId, index > 0, roots[index + 1]?.color || ''));
    });
    nextTree.append(renderLinkTail(roots[roots.length - 1]));
    root.append(nextTree);
    mountLinkPanel(links);
    playFolds(folds);
  }

  const LINK_BRANCH_GAP = 18;
  const LINK_ELBOW_RADIUS = 8;
  const LINK_ROW_GAP = 10;

  /** Half of the chip height. Root 40, depth 1 is 15% shorter, depth 2 is 20% shorter. */
  function linkChipHalf(depth) {
    if (!depth) {
      return 20;
    }
    if (depth === 1) {
      return 17;
    }
    return 16;
  }

  /**
   * Rounded elbow into the chip. This branch's color stops at the turn.
   * The spine below that point is the next sibling's color.
   * @param {number} mid
   * @param {string} [stemColor]
   * @returns {SVGSVGElement}
   */
  function linkElbow(mid, stemColor) {
    const elbow = document.createElement('div');
    elbow.className = 'link-elbow';
    elbow.setAttribute('aria-hidden', 'true');
    const radius = Math.min(LINK_ELBOW_RADIUS, Math.max(2, mid - 1));
    const turnY = mid - radius;
    if (stemColor) {
      const stem = document.createElement('span');
      stem.className = 'link-elbow-stem';
      stem.style.top = turnY + 'px';
      stem.style.background = stemColor;
      elbow.append(stem);
    }
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(LINK_BRANCH_GAP));
    svg.setAttribute('height', '100%');
    const turn = document.createElementNS(SVG_NS, 'path');
    turn.setAttribute('d', `M1 0 V${turnY} Q1 ${mid} ${1 + radius} ${mid} H${LINK_BRANCH_GAP}`);
    turn.setAttribute('fill', 'none');
    turn.setAttribute('stroke', 'currentColor');
    turn.setAttribute('stroke-width', '1.4');
    turn.setAttribute('stroke-linecap', 'butt');
    svg.append(turn);
    elbow.append(svg);
    return elbow;
  }

  /** Rounded down-triangle: group color, thick white rim. @returns {SVGSVGElement} */
  function linkCaretIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 28 26');
    svg.setAttribute('aria-hidden', 'true');
    const rim = document.createElementNS(SVG_NS, 'path');
    rim.setAttribute(
      'd',
      'M 10.00 3.80 L 18.00 3.80 Q 24.40 3.80 21.42 9.47 L 16.98 17.93 Q 14.00 23.60 11.02 17.93 L 6.58 9.47 Q 3.60 3.80 10.00 3.80 Z',
    );
    rim.setAttribute('fill', '#fff');
    const fill = document.createElementNS(SVG_NS, 'path');
    fill.setAttribute(
      'd',
      'M 11.12 5.65 L 16.88 5.65 Q 21.49 5.65 19.35 9.73 L 16.14 15.82 Q 14.00 19.90 11.86 15.82 L 8.65 9.73 Q 6.51 5.65 11.12 5.65 Z',
    );
    fill.setAttribute('fill', 'currentColor');
    svg.append(rim, fill);
    return svg;
  }

  /**
   * @param {*} link
   * @param {Record<string, *>} byId
   * @param {boolean} leadingGap
   * @param {string} [nextColor] color of the following sibling; paints the spine below this turn
   */
  function renderLinkNode(link, byId, leadingGap, nextColor) {
    const childIds = link.children || [];
    const children = childIds.map((id) => byId[id]).filter(Boolean);
    const collapsed = childIds.length > 0 && isCollapsed(link.id);
    const locked = isLocked(link);
    const depth = link.depth || 0;
    const row = el(
      'div',
      'link-node depth-' +
        depth +
        (leadingGap ? ' has-gap' : '') +
        (collapsed ? ' is-collapsed' : '') +
        (locked ? ' is-locked' : '') +
        (!link.parent ? ' is-layout' : ' is-component'),
    );
    row.dataset.linkId = link.id;
    row.dataset.depth = String(depth);
    row.style.setProperty('--link-color', link.color || 'var(--vscode-foreground)');
    row.append(linkElbow((leadingGap ? LINK_ROW_GAP : 0) + linkChipHalf(depth), nextColor));

    const body = el('div', 'link-body');
    const chipWrap = el('div', 'link-chip-wrap');
    const chip = el('button', 'link-chip' + (entityLinkIsBroken(link.url) ? ' is-broken' : ''));
    chip.type = 'button';
    chip.append(el('span', 'link-chip-label', link.label || t('linkComponentFallback')));
    if (childIds.length > 0) {
      const tri = el('span', 'link-chip-tri' + (collapsed ? ' is-collapsed' : ''));
      tri.append(linkCaretIcon());
      tri.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (locked) {
          flashLock(link.id, chipWrap);
          return;
        }
        toggleLinkCollapsed(link.id);
      });
      tri.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      chip.append(tri);
    }
    let openTimer = 0;
    let previewTimer = 0;
    chip.addEventListener('click', (event) => {
      window.clearTimeout(previewTimer);
      previewTimer = 0;
      hideLinkPreview();
      if (event.detail > 1) {
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest('.link-chip-tri')) {
        return;
      }
      if (!link.url) {
        return;
      }
      window.clearTimeout(openTimer);
      openTimer = window.setTimeout(() => {
        openTimer = 0;
        if (followEntityUrl(link.url, { linkId: link.id, url: link.url })) {
          return;
        }
        vscode.postMessage({ type: 'confirmOpenLinkUrl', url: link.url });
      }, 400);
    });
    chip.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.clearTimeout(openTimer);
      openTimer = 0;
      openLinkPanelId = link.id;
      focusLinkNameOnOpen = true;
      paintLinksPage();
    });
    /** @type {HTMLElement | null} */
    let previewLoader = null;
    if (link.url && !parseEntityLink(link.url) && (figmaLinkPreviewEnabled || !isFigmaPreviewUrl(link.url))) {
      chip.dataset.previewUrl = link.url;
      const figmaPreview = isFigmaPreviewUrl(link.url);
      if (figmaPreview) {
        previewLoader = el('span', 'link-preview-loader');
        previewLoader.hidden = true;
        previewLoader.setAttribute('role', 'status');
        previewLoader.setAttribute('aria-label', t('linkPreviewLoading'));
      }
      let previewGen = linkPreviewGen;
      chip.addEventListener('mouseenter', () => {
        previewGen = linkPreviewGen;
        window.clearTimeout(previewTimer);
        if (previewLoader) {
          armLinkPreviewLoader(previewLoader);
        }
        previewTimer = window.setTimeout(() => {
          previewTimer = 0;
          if (previewGen !== linkPreviewGen || !chip.isConnected) {
            if (previewLoader) {
              clearLinkPreviewLoader(previewLoader);
            }
            return;
          }
          showLinkPreview(chip);
        }, 1000);
      });
      chip.addEventListener('mouseleave', () => {
        window.clearTimeout(previewTimer);
        previewTimer = 0;
        if (previewGen !== linkPreviewGen || !chip.isConnected) {
          return;
        }
        scheduleHideLinkPreview();
        if (previewLoader && linkPreviewUrl !== link.url) {
          clearLinkPreviewLoader(previewLoader);
        }
      });
    }
    chipWrap.append(chip);
    if (previewLoader) {
      chipWrap.append(previewLoader);
    }

    const side = el('div', 'link-side');
    const lock = el('button', 'lock-btn' + (locked ? ' is-locked' : ''));
    lock.type = 'button';
    lock.title = locked ? t('unlockLink') : t('lockLink');
    lock.setAttribute('aria-label', lock.title);
    lock.append(locked ? lockClosedIcon() : lockOpenIcon());
    lock.addEventListener('click', (event) => {
      event.stopPropagation();
      vscode.postMessage({ type: 'toggleLinkLock', linkId: link.id });
    });
    if (childIds.length > 0) {
      side.append(el('span', 'link-child-count', String(childIds.length)));
    }
    side.append(lock);
    chipWrap.append(side);
    body.append(chipWrap);

    if (!locked) {
      chip.draggable = true;
      chip.addEventListener('dragstart', (event) => {
        beginDrag(
          event,
          {
            kind: 'link',
            id: link.id,
            depth: link.depth || 0,
            subtreeHeight: link.subtreeHeight || 0,
            label: link.label,
          },
          'copyMove',
          link.label || '',
        );
        chip.classList.add('dragging');
        revealLinkTail(link.id);
      });
      chip.addEventListener('dragend', () => {
        chip.classList.remove('dragging');
        endDrag();
      });
    }

    row.addEventListener('dragover', (event) => {
      const payload = readPayload(event);
      if (!payload || payload.kind !== 'link' || payload.id === link.id) {
        return;
      }
      // A parent cannot land on its own subtree: the slot would nest it inside itself.
      if (isLinkDescendant(payload.id, link.id)) {
        event.stopPropagation();
        clearLinkDropCue();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'none';
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      showLinkRowCue(row, linkDropEdge(event, row));
    });
    row.addEventListener('drop', (event) => {
      const payload = readPayload(event);
      if (
        !payload ||
        payload.kind !== 'link' ||
        payload.id === link.id ||
        isLinkDescendant(payload.id, link.id)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const edge = linkDropEdge(event, row);
      clearLinkDropCue();
      applyLinkRowDrop(payload, link, edge);
    });

    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openLinkContextMenu(event.clientX, event.clientY, link);
    });

    if (children.length > 0) {
      const kids = el('div', 'link-children');
      const clip = el('div', 'link-children-clip');
      const slide = el('div', 'link-children-slide');
      const foldRail = el('button', 'link-fold-rail');
      foldRail.type = 'button';
      foldRail.title = t('toolbarCollapse');
      foldRail.addEventListener('click', (event) => {
        event.stopPropagation();
        if (locked) {
          flashLock(link.id, chipWrap);
          return;
        }
        toggleLinkCollapsed(link.id);
      });
      const ordered = children.slice().sort((a, b) => a.order - b.order);
      ordered.forEach((child, index) => {
        slide.append(renderLinkNode(child, byId, true, ordered[index + 1]?.color || ''));
      });
      clip.append(slide);
      kids.append(foldRail, clip);
      body.append(kids);
    }
    row.append(body);
    return row;
  }

  /**
   * Top third of the whole branch is before, bottom third is after, middle nests.
   * @param {DragEvent} event
   * @param {HTMLElement} row
   * @returns {'before' | 'after' | 'into'}
   */
  function linkDropEdge(event, row) {
    const rect = row.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 3) {
      return 'before';
    }
    if (event.clientY > rect.bottom - rect.height / 3) {
      return 'after';
    }
    return 'into';
  }

  /** @param {string} id */
  function linkRecord(id) {
    return (data?.links || []).find((item) => item.id === id) || null;
  }

  /**
   * True when `nodeId` is inside the subtree rooted at `ancestorId`.
   * @param {string} ancestorId
   * @param {string} nodeId
   */
  function isLinkDescendant(ancestorId, nodeId) {
    const seen = new Set();
    let current = linkRecord(nodeId);
    while (current?.parent) {
      if (current.parent === ancestorId) {
        return true;
      }
      if (seen.has(current.parent)) {
        return false;
      }
      seen.add(current.parent);
      current = linkRecord(current.parent);
    }
    return false;
  }

  /**
   * Strip under the last root, below its children. Drop here places after that root.
   * @param {*} lastRoot
   */
  function renderLinkTail(lastRoot) {
    const tail = el('div', 'link-drop-tail');
    tail.hidden = true;
    tail.dataset.linkId = lastRoot.id;
    tail.setAttribute('aria-hidden', 'true');
    tail.addEventListener('dragover', (event) => {
      const payload = readPayload(event);
      if (!payload || payload.kind !== 'link' || payload.id === lastRoot.id) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      showLinkTailCue(tail);
    });
    tail.addEventListener('drop', (event) => {
      const payload = readPayload(event);
      if (!payload || payload.kind !== 'link' || payload.id === lastRoot.id) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      clearLinkDropCue();
      finishLinkDrop({
        id: payload.id,
        targetId: lastRoot.id,
        mode: 'place',
        position: 'after',
      });
    });
    return tail;
  }

  /** @param {string} dragId */
  function revealLinkTail(dragId) {
    const tail = root.querySelector('.link-drop-tail');
    if (!(tail instanceof HTMLElement)) {
      return;
    }
    const draggingLast = tail.dataset.linkId === dragId;
    tail.hidden = draggingLast;
    if (draggingLast) {
      return;
    }
    const nodes = root.querySelectorAll('.links-tree > .link-node.is-layout');
    const last = nodes[nodes.length - 1];
    const chip =
      last instanceof HTMLElement
        ? last.querySelector(':scope > .link-body > .link-chip-wrap > .link-chip')
        : null;
    if (last instanceof HTMLElement) {
      const color = last.style.getPropertyValue('--link-color');
      if (color) {
        tail.style.setProperty('--link-color', color);
      }
    }
    if (chip instanceof HTMLElement) {
      tail.style.width = Math.max(140, chip.getBoundingClientRect().width) + 'px';
    }
  }

  function hideLinkTail() {
    const tail = root.querySelector('.link-drop-tail');
    if (!(tail instanceof HTMLElement)) {
      return;
    }
    tail.hidden = true;
    tail.classList.remove('is-active');
  }

  function linkSlotEl() {
    if (!linkDropSlotEl) {
      const slot = el('div', 'link-drop-slot');
      slot.setAttribute('aria-hidden', 'true');
      linkDropSlotEl = slot;
    }
    return linkDropSlotEl;
  }

  function clearLinkDropCue() {
    hideDropEdge();
    if (linkDropSlotEl && linkDropSlotEl.isConnected) {
      linkDropSlotEl.remove();
    }
    linkCue = null;
    root.querySelectorAll('.link-node.link-drop-into').forEach((node) => {
      node.classList.remove('link-drop-into');
    });
    root.querySelectorAll('.link-drop-tail.is-active').forEach((node) => {
      node.classList.remove('is-active');
    });
  }

  /**
   * @param {HTMLElement} row
   * @param {'before' | 'after' | 'into'} edge
   */
  function showLinkRowCue(row, edge) {
    const same = linkCue && linkCue.kind === 'row' && linkCue.row === row && linkCue.edge === edge;
    if (!same) {
      clearLinkDropCue();
      linkCue = { kind: 'row', row, edge };
      if (edge === 'into') {
        row.classList.add('link-drop-into');
      }
    }
    if (edge === 'into') {
      return;
    }
    showDropEdge(row, edge);
    placeLinkSlot(row, edge);
  }

  /** @param {HTMLElement} tail */
  function showLinkTailCue(tail) {
    if (linkCue && linkCue.kind === 'tail' && linkCue.tail === tail) {
      return;
    }
    clearLinkDropCue();
    linkCue = { kind: 'tail', tail };
    tail.classList.add('is-active');
  }

  /**
   * @param {HTMLElement} row
   * @param {'before' | 'after'} edge
   */
  function placeLinkSlot(row, edge) {
    const slot = linkSlotEl();
    const rect = row.getBoundingClientRect();
    const height = 24;
    slot.style.left = rect.left + 'px';
    slot.style.width = Math.max(rect.width, 0) + 'px';
    slot.style.top = (edge === 'before' ? rect.top - height : rect.bottom) + 'px';
    if (!slot.isConnected) {
      document.body.append(slot);
    }
  }

  /**
   * @param {*} payload
   * @param {*} link
   * @param {'before' | 'after' | 'into'} edge
   */
  function applyLinkRowDrop(payload, link, edge) {
    if (edge === 'into') {
      const nextDepth = (link.depth || 0) + 1 + (payload.subtreeHeight || 0);
      if (nextDepth > MAX_DEPTH) {
        vscode.postMessage({ type: 'nestLink', id: payload.id, parentId: link.id });
        return;
      }
      finishLinkDrop({ id: payload.id, targetId: link.id, mode: 'nest' });
      return;
    }
    finishLinkDrop({
      id: payload.id,
      targetId: link.id,
      mode: 'place',
      position: edge,
    });
  }

  /**
   * Same parent reorders immediately. A new parent, or nesting into a chip, asks Move / Copy.
   * @param {{ id: string, targetId: string, mode: 'place' | 'nest', position?: 'before' | 'after' }} pending
   */
  function finishLinkDrop(pending) {
    if (pending.mode !== 'nest') {
      const source = linkRecord(pending.id);
      const target = linkRecord(pending.targetId);
      if ((source?.parent || '') === (target?.parent || '')) {
        commitLinkDrop(pending, false);
        return;
      }
    }
    openLinkDropChoose(pending);
  }

  root.addEventListener('dragover', (event) => {
    if (!dragPayload || (dragPayload.kind !== 'link' && dragPayload.kind !== 'scenario')) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('.link-node, .link-drop-tail, .link-drop-slot')) {
      return;
    }
    clearLinkDropCue();
    clearScenarioDropCue();
  });

  /** @param {{ id: string, targetId: string, mode: 'place' | 'nest', position?: 'before' | 'after' }} pending */
  function openLinkDropChoose(pending) {
    pendingLinkDrop = pending;
    pendingChipDrop = null;
    dialogKind = 'drop';
    choiceDismiss = null;
    dropDialog.hidden = false;
    dropDialog.replaceChildren();
    const panel = el('div', 'drop-dialog-panel');
    const actions = el('div', 'drop-dialog-actions');
    const moveBtn = el('button', 'drop-dialog-btn');
    moveBtn.type = 'button';
    moveBtn.textContent = t('dropMove');
    moveBtn.addEventListener('click', () => {
      const current = pendingLinkDrop;
      closeDropDialog();
      pendingLinkDrop = null;
      if (current) {
        commitLinkDrop(current, false);
      }
    });
    const copyBtn = el('button', 'drop-dialog-btn');
    copyBtn.type = 'button';
    copyBtn.textContent = t('dropCopy');
    copyBtn.addEventListener('click', () => {
      const current = pendingLinkDrop;
      closeDropDialog();
      pendingLinkDrop = null;
      if (current) {
        commitLinkDrop(current, true);
      }
    });
    actions.append(moveBtn, copyBtn);
    panel.append(actions);
    dropDialog.append(panel);
    moveBtn.focus();
  }

  /**
   * @param {{ id: string, targetId: string, mode: 'place' | 'nest', position?: 'before' | 'after' }} pending
   * @param {boolean} copy
   */
  function commitLinkDrop(pending, copy) {
    if (pending.mode === 'nest') {
      vscode.postMessage({ type: 'nestLink', id: pending.id, parentId: pending.targetId, copy });
      return;
    }
    vscode.postMessage({
      type: 'placeLink',
      id: pending.id,
      targetId: pending.targetId,
      position: pending.position || 'after',
      copy,
    });
  }

  /** @param {string} id */
  function toggleLinkCollapsed(id) {
    const page = activePage();
    if (!page) {
      return;
    }
    const next = { ...(page.collapsed || {}) };
    if (next[id]) {
      delete next[id];
    } else {
      next[id] = true;
    }
    const tops = collapsibleTopGroups();
    const allTopCollapsed = tops.length > 0 && tops.every((item) => !!next[item.id]);
    vscode.postMessage({
      type: 'setCollapsed',
      pageId: page.id,
      collapsed: next,
      allTopCollapsed,
    });
    page.collapsed = next;
    paintLinksPage();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {*} link
   */
  function openLinkContextMenu(x, y, link) {
    cancelMenuClose('context');
    closeToolbarMenus();
    const canCreate = (link.depth || 0) < MAX_DEPTH && !isLocked(link);
    const settingsBtn = menuAction(t('menuSettings'));
    settingsBtn.addEventListener('click', () => {
      closeContextMenu();
      openLinkPanelId = link.id;
      focusLinkNameOnOpen = true;
      paintLinksPage();
    });
    const createBtn = menuActionChoice(t('linkCreateChild'), { create: 'linkChild' });
    createBtn.disabled = !canCreate;
    createBtn.addEventListener('click', () => {
      closeContextMenu();
      if (!createBtn.disabled) {
        vscode.postMessage({ type: 'createLinkChild', parentId: link.id });
      }
    });
    openMenuState = {
      kind: 'context',
      viewExpanded: false,
      createExpanded: false,
      deleteExpanded: false,
      ctx: { linkId: link.id },
      x,
      y,
    };
    const scroller = ensureMenuChrome(contextMenu).scroller;
    scroller.replaceChildren(settingsBtn, createBtn);
    updateMenuScrollbar(contextMenu);
    contextMenu.hidden = false;
    positionMenu(contextMenu, { left: x, top: y, preferBelow: true });
  }

  /** @param {*} link */
  function renderLinkPanel(link) {
    const locked = isLocked(link);
    const panel = el('aside', 'link-panel' + (locked ? ' is-locked' : ''));
    const nameRow = el('div', 'link-panel-name-row');
    const nameInput = el('input', 'link-panel-input');
    nameInput.type = 'text';
    nameInput.value = link.label || '';
    nameInput.disabled = locked;
    nameInput.setAttribute('aria-label', 'Название');
    const lockBtn = el('button', 'lock-btn' + (locked ? ' is-locked' : ''));
    lockBtn.type = 'button';
    lockBtn.title = locked ? t('unlockLink') : t('lockLink');
    lockBtn.setAttribute('aria-label', lockBtn.title);
    lockBtn.append(locked ? lockClosedIcon() : lockOpenIcon());
    lockBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleLinkLock', linkId: link.id });
    });
    nameRow.append(nameInput, lockBtn);
    panel.append(nameRow);

    const descWrap = el('div', 'link-panel-field');
    const showDesc = link.description != null || panel.dataset.showDesc === '1';
    if (showDesc) {
      const descLabel = el('label', '');
      descLabel.append(document.createTextNode('Описание'));
      const descInput = el('textarea', 'link-panel-input');
      descInput.value = link.description && link.description.trim() ? link.description : '';
      descInput.rows = 3;
      descInput.disabled = locked;
      descLabel.append(descInput);
      descWrap.append(descLabel);
      descInput.addEventListener('change', () => {
        if (!locked) {
          vscode.postMessage({
            type: 'updateLink',
            linkId: link.id,
            description: descInput.value.trim() ? descInput.value : null,
          });
        }
      });
    } else {
      const addDesc = el('button', 'link-panel-secondary');
      addDesc.type = 'button';
      addDesc.textContent = t('linkAddDescription');
      addDesc.disabled = locked;
      addDesc.addEventListener('click', () => {
        if (locked) {
          return;
        }
        panel.dataset.showDesc = '1';
        descWrap.replaceChildren();
        const descLabel = el('label', '');
        descLabel.append(document.createTextNode('Описание'));
        const descInput = el('textarea', 'link-panel-input');
        descInput.rows = 3;
        descLabel.append(descInput);
        descWrap.append(descLabel);
        descInput.focus();
        descInput.addEventListener('change', () => {
          vscode.postMessage({
            type: 'updateLink',
            linkId: link.id,
            description: descInput.value.trim() ? descInput.value : null,
          });
        });
      });
      descWrap.append(addDesc);
    }
    panel.append(descWrap);

    if (!link.parent) {
      const colorField = el('div', 'link-panel-field link-panel-color');
      const colorRow = el('div', 'link-color-row');
      const colorCaption = el('span', 'link-color-caption');
      colorCaption.textContent = t('changeColor');
      const raw = String(link.colorId || link.color || '');
      const parsed = splitHexAlpha(raw);
      const currentHex = parsed ? hexWithAlpha(parsed.rgb, parsed.alpha) : '#3658d3';
      const well = el('button', 'link-color-well');
      well.type = 'button';
      well.disabled = locked;
      well.style.setProperty('--swatch', currentHex);
      well.setAttribute('aria-label', t('changeColor'));
      well.addEventListener('click', () => {
        if (locked) {
          return;
        }
        openColorsPanel({
          kind: 'link',
          id: link.id,
          currentHex,
          allowNone: true,
          noneDisabled: true,
          locked: false,
        });
      });
      colorRow.append(colorCaption, well);
      colorField.append(colorRow);
      panel.append(colorField);
    }

    const urlLabel = el('label', 'link-panel-field');
    urlLabel.append(document.createTextNode(t('linkFieldUrl')));
    const urlInput = el('input', 'link-panel-input');
    urlInput.type = 'url';
    urlInput.value = link.url || '';
    urlInput.placeholder = 'https://…';
    urlInput.disabled = locked;
    urlLabel.append(urlInput);
    panel.append(urlLabel);

    nameInput.addEventListener('change', () => {
      if (!locked && nameInput.value.trim()) {
        vscode.postMessage({ type: 'updateLink', linkId: link.id, label: nameInput.value });
      }
    });
    urlInput.addEventListener('change', () => {
      if (!locked) {
        vscode.postMessage({
          type: 'updateLink',
          linkId: link.id,
          url: urlInput.value.trim() || null,
        });
      }
    });

    const actions = el('div', 'link-panel-actions');
    const createChild = el('button', 'link-panel-secondary');
    createChild.type = 'button';
    createChild.textContent = t('linkCreateChild');
    createChild.disabled = locked || (link.depth || 0) >= MAX_DEPTH;
    createChild.addEventListener('click', () => {
      if (!createChild.disabled) {
        vscode.postMessage({ type: 'createLinkChild', parentId: link.id });
      }
    });
    actions.append(createChild);

    const delLift = el('button', 'link-panel-danger');
    delLift.type = 'button';
    delLift.textContent = t('menuDeleteLift');
    delLift.disabled = locked || !link.canDelete;
    delLift.addEventListener('click', () => {
      if (!delLift.disabled) {
        vscode.postMessage({ type: 'deleteLinkLift', linkId: link.id });
        openLinkPanelId = null;
      }
    });
    actions.append(delLift);

    const delAll = el('button', 'link-panel-danger');
    delAll.type = 'button';
    delAll.textContent = t('menuDeleteTree');
    delAll.disabled = locked || !link.canDelete;
    delAll.addEventListener('click', () => {
      if (!delAll.disabled) {
        vscode.postMessage({ type: 'deleteLink', linkId: link.id });
        openLinkPanelId = null;
      }
    });
    actions.append(delAll);
    panel.append(actions);
    return panel;
  }

  const SCENARIO_PREVIEW_W = 300;
  const SCENARIO_PREVIEW_H = 188;

  function pageScenarioMessages() {
    const pageId = activePage()?.id;
    if (!pageId) {
      return [];
    }
    const state = scenarioState && scenarioState.pageId === pageId ? scenarioState : scenarioByPage.get(pageId);
    return state?.messages || [];
  }

  /** @param {ScenarioChip[]} messages */
  function scenarioStructureKey(messages) {
    return messages
      .map((chip) => {
        const kids = (chip.children || [])
          .map((child) =>
            [child.id, child.title || '', child.order ?? '', child.hasFile ? 1 : 0].join('\u001f'),
          )
          .join(',');
        return [
          chip.id,
          chip.isGroup ? 1 : 0,
          chip.title || '',
          chip.color || '',
          chip.locked ? 1 : 0,
          chip.hasFile ? 1 : 0,
          chip.md ? 1 : 0,
          kids,
        ].join('\u001e');
      })
      .join('\u001d');
  }

  function syncScenarioCollapsed() {
    root.querySelectorAll('.link-node[data-scenario-id]').forEach((node) => {
      if (!(node instanceof HTMLElement) || !node.dataset.scenarioId) {
        return;
      }
      const collapsed = isCollapsed(node.dataset.scenarioId);
      node.classList.toggle('is-collapsed', collapsed);
      const tri = node.querySelector(':scope .link-chip-tri');
      if (tri) {
        tri.classList.toggle('is-collapsed', collapsed);
      }
      const preview = node.querySelector(':scope .scenario-preview-wrap');
      if (preview instanceof HTMLElement) {
        preview.hidden = collapsed;
      }
      const kids = node.querySelector(':scope .link-children');
      if (kids instanceof HTMLElement) {
        kids.hidden = collapsed;
      }
    });
  }

  function paintScenariosPage() {
    mountScenarioFormPanel();
    const pageId = activePage()?.id || '';
    const cached =
      scenarioState && scenarioState.pageId === pageId
        ? scenarioState
        : scenarioByPage.get(pageId);
    const state = cached || { pageId, loading: true, messages: [] };
    const messages = state.messages || [];
    const settled = !!cached && state.loading !== true;
    if (pageId && !settled && !scenarioAutoLoad.has(pageId)) {
      scenarioAutoLoad.add(pageId);
      vscode.postMessage({ type: 'scenarioReload', pageId });
    }
    const key = scenarioStructureKey(messages) + (settled ? '|ready' : '|wait');
    const tree = root.querySelector(':scope > .links-tree');
    const emptyNode = root.querySelector(':scope > .empty');
    if (
      key === scenariosStructureKey &&
      (tree || emptyNode) &&
      root.classList.contains('scenarios-page') &&
      openScenarioGroupPanelId === null
    ) {
      syncScenarioCollapsed();
      setCollapseButton();
      mountScenarioGroupPanel();
      return;
    }
    scenariosStructureKey = key;
    dismissLinkPreview();
    closeScenarioOverlay();
    const folds = captureFolds();
    foldToken += 1;
    isFolding = false;
    setCollapseButton();
    root.textContent = '';
    root.removeAttribute('data-syn3-context');
    root.className = 'map-page links-page scenarios-page';
    clearDropHighlights();
    if (state.error && settled) {
      root.removeAttribute('aria-busy');
      const box = el('div', 'review-error');
      box.append(el('div', 'review-error-text', state.error));
      const retry = el('button', 'review-btn', t('reviewRetry'));
      retry.type = 'button';
      retry.addEventListener('click', () => {
        scenarioAutoLoad.delete(pageId);
        vscode.postMessage({ type: 'scenarioReload', pageId });
      });
      box.append(retry);
      root.append(box);
      return;
    }
    if (messages.length === 0) {
      // Empty channel (hello only): show CTA instead of a stuck page skeleton.
      if (!settled) {
        root.setAttribute('aria-busy', 'true');
      } else {
        root.removeAttribute('aria-busy');
      }
      root.append(el('div', 'empty', t('scenarioEmpty')));
      return;
    }
    root.removeAttribute('aria-busy');
    const roots = messages.slice().sort((a, b) => {
      const ao = a.order ?? 0;
      const bo = b.order ?? 0;
      return ao - bo || a.id.localeCompare(b.id);
    });
    const nextTree = el('div', 'links-tree');
    roots.forEach((chip, index) => {
      const next = roots[index + 1];
      nextTree.append(
        renderScenarioNode(chip, null, index > 0, next ? next.color || 'var(--vscode-foreground)' : ''),
      );
    });
    nextTree.append(renderScenarioTail(roots[roots.length - 1]));
    root.append(nextTree);
    mountScenarioGroupPanel();
    playFolds(folds);
  }

  /**
   * @param {ScenarioChip | ScenarioChildChip} chip
   * @param {string | null} groupId
   * @param {boolean} leadingGap
   * @param {string} [nextColor]
   */
  function renderScenarioNode(chip, groupId, leadingGap, nextColor) {
    const isGroup = !!chip.isGroup;
    const childList = isGroup ? chip.children || [] : [];
    const canFoldChildren = isGroup && childList.length > 0;
    const canFoldPreview = !isGroup && !!(chip.md && chip.hasFile);
    const canFold = canFoldChildren || canFoldPreview;
    const collapsed = canFold && isCollapsed(chip.id);
    const locked = !!chip.locked;
    const depth = groupId ? 1 : 0;
    const row = el(
      'div',
      'link-node depth-' +
        depth +
        (leadingGap ? ' has-gap' : '') +
        (collapsed ? ' is-collapsed' : '') +
        (locked ? ' is-locked' : '') +
        (depth ? ' is-component' : ' is-layout'),
    );
    row.dataset.scenarioId = chip.id;
    if (groupId) {
      row.dataset.scenarioGroup = groupId;
    }
    const parentGroup = groupId ? pageScenarioMessages().find((item) => item.id === groupId) : null;
    row.style.setProperty(
      '--link-color',
      chip.color || parentGroup?.color || 'var(--vscode-foreground)',
    );
    row.append(linkElbow((leadingGap ? LINK_ROW_GAP : 0) + linkChipHalf(depth), nextColor));

    const body = el('div', 'link-body');
    const chipWrap = el('div', 'link-chip-wrap scenario-chip-wrap');
    const chipBtn = el('button', 'link-chip scenario-chip');
    chipBtn.type = 'button';
    const label = el('span', 'link-chip-label scenario-chip-label', chip.title || t('scenarioDefaultTitle'));
    label.title = chip.title || '';
    chipBtn.append(label);
    if (canFold) {
      const tri = el('span', 'link-chip-tri' + (collapsed ? ' is-collapsed' : ''));
      tri.append(linkCaretIcon());
      tri.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (locked) {
          flashLock(chip.id, chipWrap);
          return;
        }
        toggleScenarioCollapsed(chip.id);
      });
      tri.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      chipBtn.append(tri);
    }
    label.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isGroup) {
        openScenarioGroupPanelId = chip.id;
        focusScenarioGroupNameOnOpen = true;
        paintScenariosPage();
        return;
      }
      if (locked) {
        return;
      }
      beginScenarioRename(label, chip.id);
    });
    chipWrap.append(chipBtn);
    if (!isGroup && !(chip.md && chip.hasFile)) {
      const formBtn = el('button', 'scenario-form-btn');
      formBtn.type = 'button';
      formBtn.title = t('formScenario');
      formBtn.setAttribute('aria-label', t('formScenario'));
      formBtn.append(reviewSparkleIcon());
      formBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openScenarioSparkMenu(event.clientX, event.clientY, chip);
      });
      chipWrap.append(formBtn);
    }
    if (isGroup) {
      const side = el('div', 'link-side scenario-group-side');
      const lock = el('button', 'lock-btn' + (locked ? ' is-locked' : ''));
      lock.type = 'button';
      lock.title = locked ? t('scenarioUnlock') : t('lockGroup');
      lock.setAttribute('aria-label', lock.title);
      lock.setAttribute('aria-pressed', locked ? 'true' : 'false');
      lock.append(locked ? lockClosedIcon() : lockOpenIcon());
      lock.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!locked) {
          return;
        }
        unlockScenarioGroup(chip.id);
      });
      side.append(lock);
      if (childList.length) {
        side.append(el('span', 'count', String(childList.length)));
      }
      chipWrap.append(side);
    }
    body.append(chipWrap);
    if (!isGroup && chip.md && chip.hasFile) {
      const previewWrap = el('div', 'scenario-preview-wrap');
      previewWrap.hidden = collapsed;
      const preview = el('button', 'scenario-preview');
      preview.type = 'button';
      preview.setAttribute('aria-label', t('openScenarioScheme'));
      const svg = buildScenarioMermaidSvg(chip.md);
      if (svg) {
        preview.append(svg);
      }
      preview.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openScenarioOverlay(chip.id, chip.md || '');
      });
      chipBtn.addEventListener('click', (event) => {
        if (event.detail > 1) {
          return;
        }
        const target = event.target;
        if (target instanceof Element && target.closest('.link-chip-tri, .scenario-preview, .scenario-form-btn')) {
          return;
        }
        openScenarioOverlay(chip.id, chip.md || '');
      });
      previewWrap.append(preview);
      body.append(previewWrap);
    }

    if (!locked && !isGroup) {
      chipBtn.draggable = true;
      chipBtn.addEventListener('dragstart', (event) => {
        beginDrag(
          event,
          {
            kind: 'scenario',
            id: chip.id,
            groupId: groupId || '',
            title: chip.title,
          },
          'copyMove',
          chip.title || '',
        );
        chipBtn.classList.add('dragging');
        revealScenarioTail();
      });
      chipBtn.addEventListener('dragend', () => {
        chipBtn.classList.remove('dragging');
        endDrag();
      });
    }

    row.addEventListener('dragover', (event) => {
      const payload = readPayload(event);
      if (!payload || payload.kind !== 'scenario' || payload.id === chip.id) {
        return;
      }
      if (isGroup) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
        showScenarioRowCue(row, scenarioDropEdge(event, row));
        return;
      }
      if (!groupId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      showScenarioRowCue(row, scenarioDropEdge(event, row));
    });
    row.addEventListener('drop', (event) => {
      const payload = readPayload(event);
      if (!payload || payload.kind !== 'scenario' || payload.id === chip.id) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const edge = scenarioDropEdge(event, row);
      clearScenarioDropCue();
      applyScenarioRowDrop(payload, chip, groupId, isGroup, edge);
    });

    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openScenarioContextMenu(event.clientX, event.clientY, chip, groupId);
    });

    chipBtn.addEventListener('dblclick', (event) => {
      if (!isGroup) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openScenarioGroupPanelId = chip.id;
      focusScenarioGroupNameOnOpen = true;
      paintScenariosPage();
    });

    if (isGroup && childList.length > 0) {
      const kids = el('div', 'link-children');
      kids.hidden = collapsed;
      const clip = el('div', 'link-children-clip');
      const slide = el('div', 'link-children-slide');
      const foldRail = el('button', 'link-fold-rail');
      foldRail.type = 'button';
      foldRail.title = t('toolbarCollapse');
      foldRail.addEventListener('click', (event) => {
        event.stopPropagation();
        if (locked) {
          flashLock(chip.id, chipWrap);
          return;
        }
        toggleScenarioCollapsed(chip.id);
      });
      const ordered = childList.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      ordered.forEach((child, index) => {
        const next = ordered[index + 1];
        slide.append(
          renderScenarioNode(
            { ...child, locked },
            chip.id,
            true,
            next ? chip.color || 'var(--vscode-foreground)' : '',
          ),
        );
      });
      clip.append(slide);
      kids.append(foldRail, clip);
      body.append(kids);
    }
    row.append(body);
    return row;
  }

  /** @param {string} md */
  function buildScenarioMermaidSvg(md) {
    const body = extractMermaidSource(md);
    if (!body) {
      return null;
    }
    const participants = [];
    const messages = [];
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('%%') || /^sequenceDiagram/i.test(trimmed)) {
        continue;
      }
      const part = /^(?:participant|actor)\s+([^\s:]+)/i.exec(trimmed);
      if (part) {
        const name = part[1].replace(/["']/g, '').trim();
        if (name && !participants.includes(name)) {
          participants.push(name);
        }
        continue;
      }
      const arrow = /^([^-]+?)\s*(->>|-->>)\s*([^:]+?)(?::\s*(.*))?$/.exec(trimmed);
      if (arrow) {
        const from = arrow[1].trim();
        const to = arrow[3].trim();
        if (!participants.includes(from)) {
          participants.push(from);
        }
        if (!participants.includes(to)) {
          participants.push(to);
        }
        messages.push({ from, to, dashed: arrow[2] === '-->>' });
      }
    }
    if (!participants.length) {
      return null;
    }
    const w = SCENARIO_PREVIEW_W;
    const h = SCENARIO_PREVIEW_H;
    const pad = 12;
    const boxW = Math.max(48, (w - pad * 2) / Math.max(1, participants.length) - 8);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'scenario-mermaid-thumb');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('aria-hidden', 'true');
  const colX = (index) => pad + index * ((w - pad * 2) / Math.max(1, participants.length - 1 || 1));
    participants.forEach((name, index) => {
      const x = participants.length === 1 ? w / 2 - boxW / 2 : colX(index) - boxW / 2;
      const box = document.createElementNS(SVG_NS, 'rect');
      box.setAttribute('x', String(Math.max(pad, x)));
      box.setAttribute('y', '16');
      box.setAttribute('width', String(boxW));
      box.setAttribute('height', '28');
      box.setAttribute('rx', '6');
      box.setAttribute('fill', 'color-mix(in srgb, var(--vscode-foreground) 8%, transparent)');
      box.setAttribute('stroke', 'currentColor');
      box.setAttribute('stroke-opacity', '0.35');
      svg.append(box);
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(Math.max(pad, x) + boxW / 2));
      text.setAttribute('y', '34');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', 'currentColor');
      text.setAttribute('font-size', '11');
      const short = name.length > 10 ? name.slice(0, 9) + '…' : name;
      text.textContent = short;
      svg.append(text);
      const stem = document.createElementNS(SVG_NS, 'line');
      const cx = Math.max(pad, x) + boxW / 2;
      stem.setAttribute('x1', String(cx));
      stem.setAttribute('x2', String(cx));
      stem.setAttribute('y1', '44');
      stem.setAttribute('y2', String(h - 12));
      stem.setAttribute('stroke', 'currentColor');
      stem.setAttribute('stroke-opacity', '0.2');
      svg.append(stem);
    });
    const idx = (name) => participants.indexOf(name);
    const arrowId = 'scenario-arrow-' + Math.random().toString(36).slice(2, 9);
    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', arrowId);
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX', '5');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const head = document.createElementNS(SVG_NS, 'path');
    head.setAttribute('d', 'M0,0 L6,3 L0,6 Z');
    head.setAttribute('fill', 'currentColor');
    marker.append(head);
    defs.append(marker);
    svg.prepend(defs);
    messages.slice(0, 14).forEach((msg, line) => {
      const y = 56 + line * 9;
      const x1 = idx(msg.from) < 0 ? w / 2 : colX(idx(msg.from));
      const x2 = idx(msg.to) < 0 ? w / 2 : colX(idx(msg.to));
      const path = document.createElementNS(SVG_NS, 'path');
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      path.setAttribute('d', `M${left} ${y} H${right}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.2');
      if (msg.dashed) {
        path.setAttribute('stroke-dasharray', '4 3');
      }
      path.setAttribute('marker-end', 'url(#' + arrowId + ')');
      svg.append(path);
    });
    return svg;
  }

  /** @param {string} md */
  function extractMermaidSource(md) {
    const match = /```\s*mermaid\s*\n([\s\S]*?)```/i.exec(String(md || ''));
    return match ? match[1] : '';
  }

  /** @param {HTMLElement} label @param {string} messageId */
  function beginScenarioRename(label, messageId) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'scenario-rename-input';
    input.value = label.textContent || '';
    input.style.width = Math.max(80, label.offsetWidth + 16) + 'px';
    label.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const title = input.value.trim();
      const pageId = activePage()?.id;
      if (pageId && title) {
        vscode.postMessage({ type: 'scenarioRename', pageId, messageId, title });
      }
      paintScenariosPage();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        paintScenariosPage();
      }
    });
    input.addEventListener('blur', () => {
      commit();
    });
  }

  /** @param {string} id */
  function toggleScenarioCollapsed(id) {
    const page = activePage();
    if (!page) {
      return;
    }
    const next = { ...(page.collapsed || {}) };
    if (next[id]) {
      delete next[id];
    } else {
      next[id] = true;
    }
    vscode.postMessage({
      type: 'setCollapsed',
      pageId: page.id,
      collapsed: next,
      allTopCollapsed: allTopCollapsed(),
    });
    page.collapsed = next;
    paintScenariosPage();
  }

  function setAllScenarioCollapsed(collapsed) {
    const page = activePage();
    if (!page) {
      return;
    }
    const next = { ...(page.collapsed || {}) };
    for (const chip of collapsibleTopGroups()) {
      if (collapsed) {
        next[chip.id] = true;
      } else {
        delete next[chip.id];
      }
    }
    vscode.postMessage({
      type: 'setCollapsed',
      pageId: page.id,
      collapsed: next,
      allTopCollapsed: allTopCollapsed(),
    });
    page.collapsed = next;
    paintScenariosPage();
  }

  /** @param {string} groupId */
  function unlockScenarioGroup(groupId) {
    const pageId = activePage()?.id;
    if (!pageId) {
      return;
    }
    vscode.postMessage({
      type: 'scenarioUpdateGroup',
      pageId,
      groupId,
      status: 'open',
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {ScenarioChip | ScenarioChildChip} chip
   * @param {string | null} groupId
   */
  function openScenarioContextMenu(x, y, chip, groupId) {
    cancelMenuClose('context');
    closeToolbarMenus();
    const pageId = activePage()?.id || '';
    const isGroup = !!chip.isGroup;
    const locked = !!chip.locked;
    /** @type {HTMLElement[]} */
    const items = [];
    if (isGroup) {
      const createBtn = menuActionChoice(t('createScenario'), {});
      createBtn.disabled = locked;
      createBtn.addEventListener('click', () => {
        closeContextMenu();
        if (!createBtn.disabled && pageId) {
          vscode.postMessage({ type: 'scenarioCreate', pageId, groupId: chip.id });
        }
      });
      items.push(createBtn);
      const settingsBtn = menuAction(t('menuSettings'));
      settingsBtn.addEventListener('click', () => {
        closeContextMenu();
        openScenarioGroupPanelId = chip.id;
        focusScenarioGroupNameOnOpen = true;
        paintScenariosPage();
      });
      items.push(settingsBtn);
    } else if (!chip.hasFile) {
      const formBtn = menuAction(t('formScenario'));
      formBtn.disabled = !!scenarioFormBusy;
      formBtn.addEventListener('click', () => {
        closeContextMenu();
        if (!formBtn.disabled && pageId) {
          vscode.postMessage({ type: 'scenarioForm', pageId, messageId: chip.id });
        }
      });
      items.push(formBtn);
    }
    const copyBtn = menuAction(t('menuCopyLink'));
    copyBtn.addEventListener('click', () => {
      closeContextMenu();
      const url = scenarioEntityLink(chip.id, isGroup ? undefined : groupId || undefined);
      if (url) {
        vscode.postMessage({ type: 'clipboardWrite', text: url });
      }
    });
    items.push(copyBtn);
    const delBtn = menuAction(t('menuDelete'));
    delBtn.disabled = locked && isGroup;
    delBtn.addEventListener('click', () => {
      closeContextMenu();
      if (pageId && (!locked || !isGroup)) {
        vscode.postMessage({ type: 'scenarioDelete', pageId, messageId: chip.id });
      }
    });
    items.push(delBtn);
    if (isGroup && locked) {
      const unlockBtn = menuAction(t('scenarioUnlock'));
      unlockBtn.addEventListener('click', () => {
        closeContextMenu();
        unlockScenarioGroup(chip.id);
      });
      items.push(unlockBtn);
    }
    openMenuState = { kind: 'context', viewExpanded: false, ctx: { scenarioId: chip.id }, x, y };
    const scroller = ensureMenuChrome(contextMenu).scroller;
    scroller.replaceChildren(...items);
    updateMenuScrollbar(contextMenu);
    contextMenu.hidden = false;
    positionMenu(contextMenu, { left: x, top: y, preferBelow: true });
  }

  /**
   * @param {string} messageId
   * @param {string | undefined} groupId
   */
  function scenarioEntityLink(messageId, groupId) {
    const pageId = uiState.activePageId;
    if (!pageId) {
      return '';
    }
    if (groupId) {
      return pageId + '://scenario/' + groupId + '/' + messageId;
    }
    const chip = pageScenarioMessages().find((item) => item.id === messageId);
    if (chip?.isGroup) {
      return pageId + '://group/' + messageId;
    }
    return pageId + '://scenario/' + messageId;
  }

  /**
   * @param {DragEvent} event
   * @param {HTMLElement} row
   */
  function scenarioDropEdge(event, row) {
    return linkDropEdge(event, row);
  }

  function scenarioSlotEl() {
    if (!scenarioDropSlotEl) {
      scenarioDropSlotEl = el('div', 'link-drop-slot');
      scenarioDropSlotEl.setAttribute('aria-hidden', 'true');
    }
    return scenarioDropSlotEl;
  }

  function clearScenarioDropCue() {
    hideDropEdge();
    if (scenarioDropSlotEl && scenarioDropSlotEl.isConnected) {
      scenarioDropSlotEl.remove();
    }
    scenarioCue = null;
    root.querySelectorAll('.link-node.link-drop-into').forEach((node) => {
      node.classList.remove('link-drop-into');
    });
    root.querySelectorAll('.link-drop-tail.is-active').forEach((node) => {
      node.classList.remove('is-active');
    });
  }

  /**
   * @param {HTMLElement} row
   * @param {'before' | 'after' | 'into'} edge
   */
  function showScenarioRowCue(row, edge) {
    const same = scenarioCue && scenarioCue.kind === 'row' && scenarioCue.row === row && scenarioCue.edge === edge;
    if (!same) {
      clearScenarioDropCue();
      scenarioCue = { kind: 'row', row, edge };
      if (edge === 'into') {
        row.classList.add('link-drop-into');
      }
    }
    if (edge === 'into') {
      return;
    }
    showDropEdge(row, edge);
    const slot = scenarioSlotEl();
    const rect = row.getBoundingClientRect();
    slot.style.left = rect.left + 'px';
    slot.style.width = Math.max(rect.width, 0) + 'px';
    slot.style.top = (edge === 'before' ? rect.top - 24 : rect.bottom) + 'px';
    if (!slot.isConnected) {
      document.body.append(slot);
    }
  }

  /**
   * @param {*} payload
   * @param {*} target
   * @param {string | null} targetGroupId
   * @param {boolean} targetIsGroup
   * @param {'before' | 'after' | 'into'} edge
   */
  function applyScenarioRowDrop(payload, target, targetGroupId, targetIsGroup, edge) {
    const pageId = activePage()?.id;
    if (!pageId || payload.isGroup) {
      return;
    }
    const sourceGroup = payload.groupId || '';
    const destGroup = targetIsGroup && edge === 'into' ? target.id : targetGroupId || '';
    if (!destGroup && !sourceGroup && edge !== 'into') {
      return;
    }
    if (sourceGroup === destGroup && destGroup) {
      const group = pageScenarioMessages().find((item) => item.id === destGroup);
      const ids = (group?.children || []).map((child) => child.id);
      const from = ids.indexOf(payload.id);
      let to = ids.indexOf(target.id);
      if (from < 0 || to < 0) {
        return;
      }
      if (edge === 'after') {
        to += 1;
      }
      if (from < to) {
        to -= 1;
      }
      ids.splice(from, 1);
      ids.splice(to, 0, payload.id);
      vscode.postMessage({ type: 'scenarioReorder', pageId, groupId: destGroup, orderedIds: ids });
      return;
    }
    pendingScenarioDrop = {
      id: payload.id,
      groupId: sourceGroup,
      targetGroupId: destGroup || undefined,
    };
    pendingLinkDrop = null;
    pendingChipDrop = null;
    dialogKind = 'drop';
    choiceDismiss = null;
    dropDialog.hidden = false;
    dropDialog.replaceChildren();
    const panel = el('div', 'drop-dialog-panel');
    const actions = el('div', 'drop-dialog-actions');
    const moveBtn = el('button', 'drop-dialog-btn');
    moveBtn.type = 'button';
    moveBtn.textContent = t('dropMove');
    moveBtn.addEventListener('click', () => {
      const pending = pendingScenarioDrop;
      closeDropDialog();
      pendingScenarioDrop = null;
      if (pending && pageId) {
        vscode.postMessage({
          type: 'scenarioTransfer',
          pageId,
          messageId: pending.id,
          targetGroupId: pending.targetGroupId,
          copy: false,
        });
      }
    });
    const copyBtn = el('button', 'drop-dialog-btn');
    copyBtn.type = 'button';
    copyBtn.textContent = t('dropCopy');
    copyBtn.addEventListener('click', () => {
      const pending = pendingScenarioDrop;
      closeDropDialog();
      pendingScenarioDrop = null;
      if (pending && pageId) {
        vscode.postMessage({
          type: 'scenarioTransfer',
          pageId,
          messageId: pending.id,
          targetGroupId: pending.targetGroupId,
          copy: true,
        });
      }
    });
    actions.append(moveBtn, copyBtn);
    panel.append(actions);
    dropDialog.append(panel);
    moveBtn.focus();
  }

  /** @param {*} lastRoot */
  function renderScenarioTail(lastRoot) {
    const tail = el('div', 'link-drop-tail');
    tail.hidden = true;
    tail.addEventListener('dragover', (event) => {
      const payload = readPayload(event);
      if (!payload || payload.kind !== 'scenario' || !payload.groupId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      clearScenarioDropCue();
      tail.classList.add('is-active');
    });
    tail.addEventListener('drop', (event) => {
      const payload = readPayload(event);
      if (!payload || payload.kind !== 'scenario' || !payload.groupId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      clearScenarioDropCue();
      const pageId = activePage()?.id;
      if (!pageId) {
        return;
      }
      pendingScenarioDrop = { id: payload.id, groupId: payload.groupId, targetGroupId: undefined };
      pendingLinkDrop = null;
      pendingChipDrop = null;
      dialogKind = 'drop';
      choiceDismiss = null;
      dropDialog.hidden = false;
      dropDialog.replaceChildren();
      const panel = el('div', 'drop-dialog-panel');
      const actions = el('div', 'drop-dialog-actions');
      const moveBtn = el('button', 'drop-dialog-btn');
      moveBtn.type = 'button';
      moveBtn.textContent = t('dropMove');
      moveBtn.addEventListener('click', () => {
        const pending = pendingScenarioDrop;
        closeDropDialog();
        pendingScenarioDrop = null;
        if (pending) {
          vscode.postMessage({
            type: 'scenarioTransfer',
            pageId,
            messageId: pending.id,
            targetGroupId: pending.targetGroupId,
            copy: false,
          });
        }
      });
      const copyBtn = el('button', 'drop-dialog-btn');
      copyBtn.type = 'button';
      copyBtn.textContent = t('dropCopy');
      copyBtn.addEventListener('click', () => {
        const pending = pendingScenarioDrop;
        closeDropDialog();
        pendingScenarioDrop = null;
        if (pending) {
          vscode.postMessage({
            type: 'scenarioTransfer',
            pageId,
            messageId: pending.id,
            targetGroupId: pending.targetGroupId,
            copy: true,
          });
        }
      });
      actions.append(moveBtn, copyBtn);
      panel.append(actions);
      dropDialog.append(panel);
      moveBtn.focus();
    });
    return tail;
  }

  function revealScenarioTail() {
    const tail = root.querySelector('.link-drop-tail');
    if (tail instanceof HTMLElement) {
      tail.hidden = false;
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {ScenarioChip | ScenarioChildChip} chip
   */
  function openScenarioSparkMenu(x, y, chip) {
    cancelMenuClose('context');
    closeToolbarMenus();
    const pageId = activePage()?.id || '';
    const formBtn = menuAction(t('formScenario'));
    formBtn.disabled = !!scenarioFormBusy;
    formBtn.addEventListener('click', () => {
      closeContextMenu();
      if (!formBtn.disabled && pageId) {
        vscode.postMessage({ type: 'scenarioForm', pageId, messageId: chip.id });
      }
    });
    openMenuState = { kind: 'context', viewExpanded: false, ctx: { scenarioId: chip.id }, x, y };
    const scroller = ensureMenuChrome(contextMenu).scroller;
    scroller.replaceChildren(formBtn);
    updateMenuScrollbar(contextMenu);
    contextMenu.hidden = false;
    positionMenu(contextMenu, { left: x, top: y, preferBelow: true });
  }

  /**
   * @param {boolean} cancel
   */
  function closeScenarioFormPanel(cancel) {
    const session = scenarioFormQuestions;
    scenarioFormQuestions = null;
    scenarioFormPicks = {};
    document.querySelectorAll('.scenario-form-panel-backdrop').forEach((node) => node.remove());
    if (cancel && session) {
      vscode.postMessage({
        type: 'scenarioFormCancel',
        pageId: session.pageId,
        messageId: session.messageId,
      });
    }
  }

  function mountScenarioFormPanel() {
    const existing = document.querySelector('.scenario-form-panel-backdrop');
    const session = scenarioFormQuestions;
    const page = activePage();
    if (!session || page?.kind !== 'scenarios' || page.id !== session.pageId) {
      if (existing) {
        existing.remove();
      }
      return;
    }
    if (existing instanceof HTMLElement && existing.dataset.messageId === session.messageId) {
      return;
    }
    if (existing) {
      existing.remove();
    }
    const chip = pageScenarioMessages().find((item) => item.id === session.messageId);
    const backdrop = el('div', 'link-panel-backdrop scenario-form-panel-backdrop');
    backdrop.dataset.messageId = session.messageId;
    let pressedBackdrop = false;
    backdrop.addEventListener('mousedown', (event) => {
      pressedBackdrop = event.target === backdrop;
    });
    backdrop.addEventListener('click', (event) => {
      if (pressedBackdrop && event.target === backdrop) {
        closeScenarioFormPanel(true);
      }
    });
    const panel = el('aside', 'link-panel scenario-form-panel');
    panel.append(el('div', 'review-mr-people-title', chip?.title || t('formScenario')));
    const questions = Array.isArray(session.questions) ? session.questions : [];
    for (const question of questions) {
      const block = el('fieldset', 'scenario-form-q');
      const legend = el('legend', 'scenario-form-q-prompt', question.prompt || '');
      block.append(legend);
      const options = Array.isArray(question.options) ? question.options : [];
      for (const option of options) {
        const label = el('label', 'scenario-form-option');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'scenario-form-' + question.id;
        input.value = option.id;
        input.checked = scenarioFormPicks[question.id] === option.id;
        input.addEventListener('change', () => {
          if (input.checked) {
            scenarioFormPicks[question.id] = option.id;
            syncRun();
          }
        });
        label.append(input, el('span', '', option.label || option.id));
        block.append(label);
      }
      panel.append(block);
    }
    const actions = el('div', 'link-panel-actions');
    const run = el('button', 'link-panel-primary', t('formScenario'));
    run.type = 'button';
    const syncRun = () => {
      run.disabled = questions.some((question) => !scenarioFormPicks[question.id]);
    };
    syncRun();
    run.addEventListener('click', () => {
      if (run.disabled) {
        return;
      }
      const answers = questions.map((question) => ({
        id: question.id,
        optionId: scenarioFormPicks[question.id],
      }));
      const pageId = session.pageId;
      const messageId = session.messageId;
      closeScenarioFormPanel(false);
      vscode.postMessage({ type: 'scenarioFormAnswer', pageId, messageId, answers });
    });
    actions.append(run);
    panel.append(actions);
    backdrop.append(panel);
    document.body.append(backdrop);
  }

  function mountScenarioGroupPanel() {
    if (!openScenarioGroupPanelId) {
      document.querySelectorAll('.scenario-group-panel-backdrop').forEach((node) => node.remove());
      return;
    }
    const chip = pageScenarioMessages().find((item) => item.id === openScenarioGroupPanelId);
    if (!chip || !chip.isGroup) {
      openScenarioGroupPanelId = null;
      return;
    }
    const locked = !!chip.locked;
    document.querySelectorAll('.scenario-group-panel-backdrop').forEach((node) => node.remove());
    const backdrop = el('div', 'link-panel-backdrop scenario-group-panel-backdrop');
    let pressedBackdrop = false;
    backdrop.addEventListener('mousedown', (event) => {
      pressedBackdrop = event.target === backdrop;
    });
    backdrop.addEventListener('click', (event) => {
      if (pressedBackdrop && event.target === backdrop) {
        openScenarioGroupPanelId = null;
        paintScenariosPage();
      }
    });
    const panel = el('aside', 'link-panel' + (locked ? ' is-locked' : ''));
    const nameRow = el('div', 'link-panel-name-row');
    const nameInput = el('input', 'link-panel-input');
    nameInput.type = 'text';
    nameInput.value = chip.title || '';
    nameInput.disabled = locked;
    const lockBtn = el('button', 'lock-btn' + (locked ? ' is-locked' : ''));
    lockBtn.type = 'button';
    lockBtn.title = locked ? t('scenarioUnlock') : t('lockGroup');
    lockBtn.append(locked ? lockClosedIcon() : lockOpenIcon());
    lockBtn.addEventListener('click', () => {
      if (locked) {
        unlockScenarioGroup(chip.id);
      } else {
        vscode.postMessage({
          type: 'scenarioUpdateGroup',
          pageId: activePage()?.id || '',
          groupId: chip.id,
          status: 'lock',
        });
      }
    });
    nameRow.append(nameInput, lockBtn);
    panel.append(nameRow);
    const aliasLabel = el('label', 'link-panel-field');
    aliasLabel.append(document.createTextNode(t('groupAlias')));
    const aliasInput = el('input', 'link-panel-input');
    aliasInput.type = 'text';
    aliasInput.value = chip.alias || '';
    aliasInput.disabled = locked;
    aliasLabel.append(aliasInput);
    panel.append(aliasLabel);
    const descField = el('div', 'link-panel-field');
    const descInput = el('textarea', 'link-panel-input');
    descInput.rows = 3;
    descInput.value = chip.description || '';
    descInput.disabled = locked;
    descField.append(el('span', 'link-color-caption', t('groupDescription')), descInput);
    panel.append(descField);
    const colorField = el('div', 'link-panel-field link-panel-color');
    const well = el('button', 'link-color-well' + (!chip.color ? ' is-empty' : ''));
    well.type = 'button';
    well.disabled = locked;
    if (chip.color) {
      well.style.setProperty('--swatch', chip.color);
    }
    well.addEventListener('click', () => {
      if (locked) {
        return;
      }
      openColorsPanel({
        kind: 'scenario-group',
        id: chip.id,
        currentHex: chip.color || '',
        allowNone: false,
        locked: false,
      });
    });
    colorField.append(el('span', 'link-color-caption', t('changeColor')), well);
    panel.append(colorField);
    const pageId = activePage()?.id || '';
    const save = (partial) => {
      if (locked || !pageId) {
        return;
      }
      vscode.postMessage({ type: 'scenarioUpdateGroup', pageId, groupId: chip.id, ...partial });
    };
    nameInput.addEventListener('change', () => {
      if (nameInput.value.trim()) {
        save({ title: nameInput.value.trim() });
      }
    });
    aliasInput.addEventListener('change', () => save({ alias: aliasInput.value.trim() }));
    descInput.addEventListener('change', () => save({ description: descInput.value.trim() }));
    backdrop.append(panel);
    document.body.append(backdrop);
    if (focusScenarioGroupNameOnOpen) {
      focusScenarioGroupNameOnOpen = false;
      nameInput.focus();
      nameInput.select();
    }
  }

  /** @param {string} messageId @param {string} md */
  function openScenarioOverlay(messageId, md) {
    if (!md) {
      return;
    }
    closeScenarioOverlay();
    scenarioOverlayMessageId = messageId;
    const backdrop = el('div', 'scenario-overlay-backdrop');
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        closeScenarioOverlay();
      }
    });
    const panel = el('div', 'scenario-overlay-panel');
    const screen = el('div', 'scenario-overlay-screen');
    const svg = buildScenarioMermaidSvg(md);
    const inner = document.createElementNS(SVG_NS, 'svg');
    inner.setAttribute('class', 'scenario-overlay-svg');
    if (svg) {
      inner.setAttribute('viewBox', svg.getAttribute('viewBox') || '0 0 300 188');
      while (svg.firstChild) {
        if (svg.firstChild.tagName !== 'defs') {
          inner.append(svg.firstChild);
        } else {
          svg.removeChild(svg.firstChild);
        }
      }
    }
    screen.append(inner);
    bindScenarioOverlayPan(screen, inner);
    panel.append(screen);
    backdrop.append(panel);
    document.body.append(backdrop);
    scenarioOverlayEl = backdrop;
    document.addEventListener(
      'keydown',
      scenarioOverlayEsc,
      true,
    );
  }

  function scenarioOverlayEsc(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeScenarioOverlay();
    }
  }

  function closeScenarioOverlay() {
    if (scenarioOverlayEl) {
      scenarioOverlayEl.remove();
      scenarioOverlayEl = null;
    }
    scenarioOverlayMessageId = null;
    document.removeEventListener('keydown', scenarioOverlayEsc, true);
  }

  /**
   * @param {HTMLElement} screen
   * @param {SVGSVGElement} inner
   */
  function bindScenarioOverlayPan(screen, inner) {
    let scale = 1;
    let x = 0;
    let y = 0;
    const apply = () => {
      inner.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    };
    apply();
    screen.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const rect = screen.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const next = scale * Math.exp(-event.deltaY * 0.0016);
        const clamped = Math.min(8, Math.max(0.4, next));
        const k = clamped / scale;
        x = mx - (mx - x) * k;
        y = my - (my - y) * k;
        scale = clamped;
        apply();
      },
      { passive: false },
    );
    screen.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      screen.setPointerCapture(event.pointerId);
      screen.classList.add('is-panning');
      const sx = event.clientX;
      const sy = event.clientY;
      const ox = x;
      const oy = y;
      const move = (ev) => {
        x = ox + (ev.clientX - sx);
        y = oy + (ev.clientY - sy);
        apply();
      };
      const up = () => {
        screen.removeEventListener('pointermove', move);
        screen.removeEventListener('pointerup', up);
        screen.removeEventListener('pointercancel', up);
        screen.classList.remove('is-panning');
      };
      screen.addEventListener('pointermove', move);
      screen.addEventListener('pointerup', up);
      screen.addEventListener('pointercancel', up);
    });
  }

  /**
   * @param {{
   *   mode: 'create' | 'edit',
   *   pageId?: string,
   *   name?: string,
   *   description?: string,
   *   channelId?: string,
   *   hasDiscord?: boolean,
   *   scenarioSkillPath?: string,
   *   scenarioModel?: string,
   *   scenarioPrintThinking?: boolean,
   *   scenarioPrintTools?: boolean
   * }} opts
   */
  function openScenarioPagePanel(opts) {
    closeScenarioPagePanel();
    const editing = opts.mode === 'edit';
    const panel = el('div', 'review-mr-panel review-create-page-panel');
    panel.id = 'scenario-page-panel';
    panel.append(
      el(
        'div',
        'review-mr-people-title',
        t(editing ? 'pageSettingsTitle' : 'scenarioCreatePageTitle'),
      ),
    );
    const nameInput = document.createElement('input');
    nameInput.className = 'review-mr-title';
    nameInput.value = opts.name || '';
    panel.append(nameInput);
    const pageDesc = pageDescriptionField(opts.description || '');
    panel.append(pageDesc.label);
    const channelLabel = el('label', 'review-mr-field', t('labelChannelDiscord'));
    const channelInput = document.createElement('input');
    channelInput.className = 'review-mr-title';
    channelInput.value = opts.channelId || '';
    channelLabel.append(channelInput);
    panel.append(channelLabel);
    if (opts.hasDiscord) {
      panel.append(el('div', 'review-token-hint', t('reviewFieldDiscordToken') + ': ' + t('reviewTokenSaved')));
    } else {
      const discordLabel = el('label', 'review-mr-field', t('reviewFieldDiscordToken'));
      const discordInput = document.createElement('input');
      discordInput.className = 'review-mr-title';
      discordInput.type = 'password';
      discordLabel.append(discordInput);
      panel.append(discordLabel);
    }
    /**
     * @param {string} labelKey
     * @param {string} value
     * @param {boolean} [model]
     */
    function scenarioTextField(labelKey, value, model) {
      const label = el('label', 'review-mr-field', t(labelKey));
      const input = document.createElement('input');
      input.className = 'review-mr-title' + (model ? ' review-model-input' : '');
      input.type = 'text';
      input.spellcheck = false;
      input.value = value;
      if (model) {
        input.autocapitalize = 'none';
        input.autocomplete = 'off';
        input.placeholder = 'grok-4.7-high-fast';
        input.addEventListener('input', () => {
          const next = input.value.toLowerCase();
          if (next === input.value) {
            return;
          }
          const start = input.selectionStart;
          const end = input.selectionEnd;
          input.value = next;
          if (start !== null && end !== null) {
            input.setSelectionRange(start, end);
          }
        });
      }
      label.append(input);
      panel.append(label);
      return input;
    }

    /**
     * @param {string} labelKey
     * @param {boolean} checked
     */
    function scenarioFlag(labelKey, checked) {
      const label = el('label', 'review-terminal-flag');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      label.append(input, el('span', '', t(labelKey)));
      panel.append(label);
      return input;
    }

    const skillInput = scenarioTextField('labelScenarioSkillPath', opts.scenarioSkillPath || '');
    const modelInput = scenarioTextField('labelScenarioModel', opts.scenarioModel || '', true);
    const thinking = scenarioFlag('labelScenarioPrintThinking', !!opts.scenarioPrintThinking);
    const tools = scenarioFlag('labelScenarioPrintTools', opts.scenarioPrintTools !== false);

    const skillIcons = {
      download:
        'M3 19H21V21H3V19ZM13 13.1716L19.0711 7.1005L20.4853 8.51472L12 17L3.51472 8.51472L4.92893 7.1005L11 13.1716V2H13V13.1716Z',
      copy:
        'M6.99979 7V3C6.99979 2.44772 7.4475 2 7.99979 2H20.9998C21.5521 2 21.9998 2.44772 21.9998 3V16C21.9998 16.5523 21.5521 17 20.9998 17H17V20.9925C17 21.5489 16.551 22 15.9925 22H3.00728C2.45086 22 2 21.5511 2 20.9925L2.00276 8.00748C2.00288 7.45107 2.4518 7 3.01025 7H6.99979ZM8.99979 7H15.9927C16.549 7 17 7.44892 17 8.00748V15H19.9998V4H8.99979V7ZM4.00255 9L4.00021 20H15V9H4.00255Z',
    };
    const promptCard = el('div', 'review-doc-card');
    const promptOpen = el('button', 'review-doc-open', t('scenarioPromptExample'));
    promptOpen.type = 'button';
    promptOpen.addEventListener('click', () => {
      vscode.postMessage({ type: 'scenarioSkillFile', action: 'open' });
    });
    const promptIconRow = el('div', 'review-skill-icons');
    for (const kind of ['download', 'copy']) {
      const button = el('button', 'review-skill-icon');
      button.type = 'button';
      const label = t(kind === 'download' ? 'reviewSkillDownload' : 'reviewSkillCopy');
      button.title = label;
      button.setAttribute('aria-label', label);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('d', skillIcons[kind]);
      svg.append(path);
      button.append(svg);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        vscode.postMessage({
          type: 'scenarioSkillFile',
          action: kind === 'download' ? 'save' : 'copy',
        });
      });
      promptIconRow.append(button);
    }
    promptCard.append(promptOpen, promptIconRow);
    const promptDocs = el('div', 'review-settings-docs');
    promptDocs.append(promptCard);
    const promptCopied = el('p', 'review-skill-copied');
    promptCopied.id = 'scenario-skill-copied';
    promptCopied.hidden = true;
    promptCopied.setAttribute('aria-live', 'polite');
    panel.append(promptDocs, promptCopied);

    const error = el('div', 'review-panel-error');
    error.hidden = true;
    panel.append(error);

    /**
     * @param {boolean} report
     */
    function readScenarioForm(report) {
      const name = nameInput.value.trim();
      const channelId = channelInput.value.trim();
      const fail = (key, input) => {
        if (report) {
          error.textContent = t(key);
          error.hidden = false;
          input.focus();
        }
        return null;
      };
      if (!name) {
        return fail('profileNameEmpty', nameInput);
      }
      if (!/^\d{5,}$/.test(channelId)) {
        return fail(channelId ? 'projectChannelInvalid' : 'projectChannelEmpty', channelInput);
      }
      if (report) {
        error.hidden = true;
        error.textContent = '';
      }
      const discordInput = panel.querySelector('input[type="password"]');
      return {
        name,
        description: clipGroupDescriptionInput(pageDesc.input.value).trim(),
        channelId,
        discordToken: discordInput instanceof HTMLInputElement ? discordInput.value.trim() : '',
        scenarioSkillPath: skillInput.value.trim(),
        scenarioModel: modelInput.value.trim().toLowerCase(),
        scenarioPrintThinking: thinking.checked,
        scenarioPrintTools: tools.checked,
      };
    }

    /**
     * @param {NonNullable<ReturnType<typeof readScenarioForm>>} fields
     */
    function postScenarioForm(fields) {
      vscode.postMessage({
        type: 'scenarioSavePage',
        pageId: editing ? opts.pageId : undefined,
        name: fields.name,
        description: fields.description || undefined,
        channelId: fields.channelId,
        discordToken: fields.discordToken || undefined,
        scenarioSkillPath: fields.scenarioSkillPath,
        scenarioModel: fields.scenarioModel,
        scenarioPrintThinking: fields.scenarioPrintThinking,
        scenarioPrintTools: fields.scenarioPrintTools,
      });
    }

    /** Writes a valid edit form. Reports field errors only when asked. */
    let flushScenarioEdit = () => {};
    if (editing) {
      const initial = readScenarioForm(false);
      let savedSig = initial ? JSON.stringify(initial) : '';
      /**
       * @param {boolean} report
       */
      const saveEditing = (report) => {
        const fields = readScenarioForm(report);
        if (!fields) {
          return false;
        }
        const sig = JSON.stringify(fields);
        if (sig !== savedSig) {
          savedSig = sig;
          postScenarioForm(fields);
        }
        return true;
      };
      flushScenarioEdit = () => saveEditing(false);
      for (const input of [nameInput, pageDesc.input, channelInput, skillInput, modelInput, thinking, tools]) {
        input.addEventListener('change', () => saveEditing(true));
      }
      const discordLive = panel.querySelector('input[type="password"]');
      if (discordLive instanceof HTMLInputElement) {
        discordLive.addEventListener('change', () => saveEditing(true));
      }
      bindSettingsCommitKey(panel, () => {
        if (saveEditing(true)) {
          closeScenarioPagePanel();
        }
      });
    } else {
      const actions = el('div', 'review-mr-actions');
      const cancel = el('button', 'review-btn', t('reviewCreatePageCancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', () => {
        if (panel.classList.contains('is-busy')) {
          return;
        }
        closeScenarioPagePanel();
      });
      const submit = el('button', 'review-btn is-primary', t('reviewCreatePageSubmit'));
      submit.type = 'button';
      const submitCreate = () => {
        if (panel.classList.contains('is-busy')) {
          return;
        }
        const fields = readScenarioForm(true);
        if (!fields) {
          return;
        }
        setPanelBusy(panel, true);
        postScenarioForm(fields);
      };
      submit.addEventListener('click', submitCreate);
      bindSettingsCommitKey(panel, submitCreate);
      actions.append(cancel, submit);
      panel.append(actions);
    }
    mountSettingsOverlay(panel, () => {
      if (panel.classList.contains('is-busy')) {
        return;
      }
      flushScenarioEdit();
      closeScenarioPagePanel();
    });
    nameInput.focus();
  }

  function closeScenarioPagePanel() {
    removeOverlay('scenario-page-panel');
  }

  function currentReviewFilters() {
    const filters = reviewState && reviewState.filters;
    return {
      checkout: !!(filters && filters.checkout),
      general: !filters || filters.general !== false,
      discussions: !filters || filters.discussions !== false,
    };
  }

  /** @param {HTMLButtonElement | null} button @param {boolean} on */
  function setReviewFilterPressed(button, on) {
    if (!button) {
      return;
    }
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function syncReviewFilters() {
    const onReview = activePage()?.kind === 'review';
    if (reviewFilters) {
      reviewFilters.hidden = !onReview;
    }
    const flags = currentReviewFilters();
    setReviewFilterPressed(reviewFilterCheckout, flags.checkout);
    setReviewFilterPressed(reviewFilterGeneral, flags.general);
    setReviewFilterPressed(reviewFilterDiscussions, flags.discussions);
    syncReviewTalk();
  }

  /** @param {'checkout' | 'general' | 'discussions'} key */
  function postReviewFilter(key) {
    const page = activePage();
    if (!page || page.kind !== 'review' || reviewState?.loading) {
      return;
    }
    const flags = currentReviewFilters();
    flags[key] = !flags[key];
    setReviewFilterPressed(
      key === 'checkout' ? reviewFilterCheckout : key === 'general' ? reviewFilterGeneral : reviewFilterDiscussions,
      flags[key],
    );
    vscode.postMessage({
      type: 'reviewSetFilters',
      pageId: page.id,
      checkout: flags.checkout,
      general: flags.general,
      discussions: flags.discussions,
    });
  }

  function paintPage() {
    syncToolbarView();
    syncReviewFilters();
    removeLinkPanelBackdrop();
    hideGroupDescTip();
    if (isProblemsPageOpen()) {
      closeGroupPanel(false);
      paintProblemsPage();
      return;
    }
    if (isDebugPageOpen()) {
      closeGroupPanel(false);
      paintDebugPage();
      return;
    }
    const page = activePage();
    if (page?.kind !== 'review' && reviewFileView) {
      reviewFileView = null;
      mountReviewFile();
    }
    if (page?.kind !== 'review' && reviewFixesView) {
      reviewFixesView = null;
      mountReviewFixes();
    }
    if (page?.kind === 'review') {
      closeGroupPanel(false);
      paintReviewPage();
      return;
    }
    if (isLinkMapKind(page?.kind)) {
      if (openGroupPanel?.mode === 'create') {
        // Keep create draft if host asked for it on this surface.
      } else if (openGroupPanel) {
        closeGroupPanel(false);
      }
      paintLinksPage();
      if (openGroupPanel) {
        mountGroupPanel();
      }
      return;
    }
    if (page?.kind === 'scenarios') {
      closeGroupPanel(false);
      closeLinkPanel();
      paintScenariosPage();
      return;
    }
    const folds = captureFolds();
    foldToken += 1;
    isFolding = false;
    setCollapseButton();
    root.textContent = '';
    root.removeAttribute('data-syn3-context');
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
      if (openGroupPanel) {
        mountGroupPanel();
      }
      return;
    }

    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    const noteMap = notesById();
    const draftSet = new Set(pageDrafts[uiState.activePageId] || []);
    let draftLineDrawn = false;
    for (const card of cards) {
      if (draftSet.has(card.id) && !draftLineDrawn) {
        const divider = el('div', 'cards-draft-divider', t('draftDivider'));
        root.append(divider);
        draftLineDrawn = true;
      }
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
    applyChangeMarks();
    applyProblemMarks();
    playFolds(folds);
    layoutFoldRails();
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
    if (openGroupPanel) {
      mountGroupPanel();
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
    if (skipNextFolds) {
      skipNextFolds = false;
      return [];
    }
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
      layoutFoldRails();
      flushDeferredRender();
      if (entityAlignPending() && !isSliding) {
        applyEntityFlash(true);
      }
    }, FOLD_MS + 80);
  }

  /**
   * Invisible column under the chevron → bottom of the card; click toggles fold.
   * @param {HTMLElement} section
   * @param {string} foldId
   * @param {HTMLElement} header
   * @param {boolean} locked
   */
  function attachFoldRail(section, foldId, header, locked) {
    const rail = el('div', 'fold-rail');
    rail.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });
    rail.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (locked) {
        flashLock(foldId, header);
        return;
      }
      toggleCollapsed(foldId);
    });
    section.prepend(rail);
  }

  /** Place each fold-rail just below the chevron / first line, to the card bottom. */
  function layoutFoldRails() {
    requestAnimationFrame(() => {
      root.querySelectorAll('section.group > .fold-rail').forEach((rail) => {
        if (!(rail instanceof HTMLElement)) {
          return;
        }
        const section = rail.parentElement;
        if (!(section instanceof HTMLElement)) {
          return;
        }
        const header = section.querySelector(':scope > .group-header');
        if (!(header instanceof HTMLElement)) {
          return;
        }
        const sectionBox = section.getBoundingClientRect();
        const headerBox = header.getBoundingClientRect();
        const chevron = header.querySelector(':scope > .chevron');
        // Notes keep body text inside the header — start under the first-line/chevron band.
        // Groups: under the whole header row.
        let top;
        if (section.classList.contains('note-card') && chevron instanceof HTMLElement) {
          top = Math.max(0, chevron.getBoundingClientRect().bottom - sectionBox.top);
        } else {
          top = Math.max(0, headerBox.bottom - sectionBox.top);
        }
        rail.style.top = top + 'px';
        rail.hidden = top >= sectionBox.height - 4;
      });
    });
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

  /**
   * Same editor the page menu uses: host fills Discord channel and bot status.
   * @param {{ id: string, kind?: string }} page
   */
  function openPageChipSettings(page) {
    if (page.kind === 'review') {
      vscode.postMessage({ type: 'reviewOpenPageSettings', pageId: page.id });
      return;
    }
    if (page.kind === 'scenarios') {
      vscode.postMessage({ type: 'pageOpenSettings', pageId: page.id });
      return;
    }
    vscode.postMessage({ type: 'pageOpenSettings', pageId: page.id });
  }

  /** Page chips in strip order. The problems tab and the batch-send button are excluded. */
  function pageStripChips() {
    if (!pager) {
      return [];
    }
    return [...pager.querySelectorAll('.pager-chip[data-page-id]')];
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{ index: number, chip: HTMLElement, before: boolean } | null}
   */
  function pageInsertAt(clientX, clientY) {
    const chips = pageStripChips();
    if (!chips.length) {
      return null;
    }
    let nearest = chips[0];
    let nearestDist = Infinity;
    for (const chip of chips) {
      const rect = chip.getBoundingClientRect();
      const dist = Math.abs(clientY - (rect.top + rect.height / 2));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = chip;
      }
    }
    const rowTop = nearest.getBoundingClientRect().top;
    const row = chips.filter((chip) => Math.abs(chip.getBoundingClientRect().top - rowTop) < 6);
    for (const chip of row) {
      const rect = chip.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        return { index: chips.indexOf(chip), chip, before: true };
      }
    }
    const last = row[row.length - 1];
    return { index: chips.indexOf(last) + 1, chip: last, before: false };
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  function placePageDropCaret(clientX, clientY) {
    if (!pager) {
      return;
    }
    const slot = pageInsertAt(clientX, clientY);
    if (!slot) {
      pager.querySelector('.pager-drop-caret')?.remove();
      return;
    }
    let caret = pager.querySelector('.pager-drop-caret');
    if (!(caret instanceof HTMLElement)) {
      caret = el('span', 'pager-drop-caret');
      caret.setAttribute('aria-hidden', 'true');
      pager.append(caret);
    }
    const chips = pageStripChips();
    const rect = slot.chip.getBoundingClientRect();
    const host = pager.getBoundingClientRect();
    let x = slot.before ? rect.left : rect.right;
    if (slot.before) {
      const index = chips.indexOf(slot.chip);
      const prev = index > 0 ? chips[index - 1] : null;
      const prevRect = prev?.getBoundingClientRect();
      if (prevRect && Math.abs(prevRect.top - rect.top) < 6) {
        x = (prevRect.right + rect.left) / 2;
      }
    }
    caret.style.left = x - host.left + 'px';
    caret.style.top = rect.top - host.top + 'px';
    caret.style.height = rect.height + 'px';
  }

  function clearPageDropCaret() {
    pager?.querySelector('.pager-drop-caret')?.remove();
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  function commitPageDrop(clientX, clientY) {
    const from = pageDragId;
    const slot = pageInsertAt(clientX, clientY);
    if (!from || !slot || pageSkeletonKind()) {
      return;
    }
    const ordered = pages().map((item) => item.id);
    const fromIndex = ordered.indexOf(from);
    let toIndex = slot.index;
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    if (toIndex === fromIndex || toIndex === fromIndex + 1) {
      return;
    }
    ordered.splice(fromIndex, 1);
    if (fromIndex < toIndex) {
      toIndex -= 1;
    }
    ordered.splice(toIndex, 0, from);
    vscode.postMessage({ type: 'reorderPages', orderedIds: ordered });
  }

  function bindPagerDrag() {
    if (!pager || pager.dataset.pageDragBound) {
      return;
    }
    pager.dataset.pageDragBound = '1';
    pager.addEventListener('dragover', (event) => {
      if (!pageDragId || pageSkeletonKind()) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      placePageDropCaret(event.clientX, event.clientY);
    });
    pager.addEventListener('drop', (event) => {
      if (!pageDragId || pageSkeletonKind()) {
        return;
      }
      event.preventDefault();
      commitPageDrop(event.clientX, event.clientY);
      clearPageDropCaret();
    });
    pager.addEventListener('dragleave', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && pager.contains(next)) {
        return;
      }
      clearPageDropCaret();
    });
  }

  function renderPager() {
    if (!pager) {
      return;
    }
    syncToolbarLockBeforePager();
    bindPagerDrag();
    armScrollKeep();
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      pager.contains(focused) &&
      !focused.closest('.pager-history')
    ) {
      focused.blur();
    }
    for (const child of [...pager.children]) {
      if (!(child instanceof HTMLElement) || !child.classList.contains('pager-history')) {
        child.remove();
      }
    }
    const list = pages();
    const problemsTab = showProblemsTab();
    if (!problemsTab) {
      problemsPageOpen = false;
    }
    // Debug is always in the strip, even with no Syn3 pages.
    pager.hidden = false;
    const problemsOpen = isProblemsPageOpen();
    const debugOpen = isDebugPageOpen();
    for (const page of list) {
      const chip = el(
        'button',
        'pager-chip' +
          (page.id === uiState.activePageId && !problemsOpen && !debugOpen ? ' active' : ''),
      );
      chip.type = 'button';
      chip.draggable = true;
      chip.dataset.pageId = page.id;
      chip.title =
        page.kind === 'links'
          ? page.name + ' (' + t('pageKindLinks') + ')'
          : page.kind === 'figma'
            ? page.name + ' (' + t('pageKindFigma') + ')'
            : page.kind === 'review'
            ? page.name + ' (' + t('pageKindReview') + ')'
            : page.kind === 'scenarios'
              ? page.name + ' (' + t('pageKindScenarios') + ')'
              : page.kind === 'notes'
                ? page.name + ' (' + t('pageKindNotes') + ')'
                : page.name + ' (' + t('pageKindFiles') + ')';
      const chipLabel = el('span', 'pager-chip-label', page.name);
      chip.append(chipLabel);
      if (pagesFixed) {
        const badge = el('span', 'pager-chip-lock');
        const icon = lockClosedIcon();
        // Codicon lock is not centered in the 16×16 box (ink sits right and low).
        icon.setAttribute('viewBox', '2.5 1.75 13.5 13.5');
        badge.append(icon);
        chip.append(badge);
      }
      // draggable chips drop `click` in the webview (a child label is enough).
      // A still press switches the page; a real drag still reorders.
      trackPress(chip, (event) => {
        if (pageSkeletonKind() && page.id === uiState.activePageId) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const now = Date.now();
        const again = pageChipClick.id === page.id && now - pageChipClick.at < 500;
        pageChipClick = again ? { id: '', at: 0 } : { id: page.id, at: now };
        setActivePage(page.id);
        if (!again) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openPageChipSettings(page);
      });
      chip.addEventListener('dragstart', (event) => {
        if (pageSkeletonKind()) {
          event.preventDefault();
          return;
        }
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
        clearPageDropCaret();
      });
      pager.append(chip);
    }
    const spacer = el('span', 'pager-spacer');
    spacer.setAttribute('aria-hidden', 'true');
    const aux = el('div', 'pager-aux');
    const debugChip = el(
      'button',
      'pager-chip debug-tab' + (debugOpen ? ' active' : ''),
      t('tabDebug'),
    );
    debugChip.type = 'button';
    debugChip.title = t('tabDebug');
    debugChip.addEventListener('click', () => openDebugPage());
    aux.append(debugChip);
    if (problemsTab) {
      const chip = el(
        'button',
        'pager-chip problems-tab' + (problemsOpen ? ' active' : ''),
        t('tabProblems'),
      );
      chip.type = 'button';
      chip.title = t('tabProblems');
      chip.addEventListener('click', () => openProblemsPage());
      aux.append(chip);
    }
    pager.append(spacer, aux);
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
    const isWorking =
      data?.focus?.kind === 'marker' && data?.focus?.id === group.id;
    const section = el(
      'section',
      'group columns-' +
        columns +
        (collapsed ? ' collapsed' : '') +
        (locked ? ' locked' : '') +
        (group.depth ? ' nested node' : '') +
        (isEmpty ? ' empty-group' : '') +
        (isNotesPage ? ' notes-page' : '') +
        (isWorking ? ' is-working' : ''),
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
      openColorsPanel({
        kind: 'marker',
        id: group.id,
        currentHex: group.color || toHex(getComputedStyle(bar).backgroundColor) || '',
        allowNone: true,
      });
    });
    header.append(el('span', 'chevron', isEmpty ? '' : '▾'), bar);
    header.append(
      typeIconEl('group', {
        locked,
        badgeCount: Array.isArray(group.icons) ? group.icons.length : 0,
        onAdd: () => {
          vscode.postMessage({
            type: 'runCommand',
            command: 'syn3.addIcon',
            arg: { markerId: group.id },
          });
        },
        onLocked: () => flashLock(group.id, header),
      }),
    );
    header.append(
      badgeIconsEl(group.icons, {
        locked,
        onChange: (index) => {
          vscode.postMessage({
            type: 'runCommand',
            command: 'syn3.removeIcon',
            arg: { markerId: group.id, index },
          });
        },
        onLocked: () => flashLock(group.id, header),
      }),
    );
    const labelWrap = el('span', 'group-text' + (group.alias ? ' has-alias' : ''));
    const labelEl = appendNameSlots(labelWrap, 'label', group.label, group.alias);
    header.append(labelWrap);
    header.append(lockButton(group));
    header.append(
      el(
        'span',
        'count',
        String(group.items.length + classList.length + noteChildIds.length + childIds.length),
      ),
    );
    bindGroupDescriptionTip(labelEl, group.description);
    const skipHeaderChrome = (target) =>
      target instanceof Element &&
      (target.closest('.lock-btn') ||
        target.closest('.bar') ||
        target.closest('.type-icon') ||
        target.closest('.badge-icons'));
    header.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || skipHeaderChrome(event.target)) {
        return;
      }
      holdGroupClick(group.id);
    });
    trackPress(header, (event) => {
      if (skipHeaderChrome(event.target)) {
        return;
      }
      scheduleGroupFold(group.id);
    });
    if (!isEmpty) {
      attachFoldRail(section, group.id, header, locked);
    }
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
    const button = header.querySelector(':scope > .lock-btn, :scope > .link-side > .lock-btn');
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

  /**
   * Blink the review lock for 3s. Repeat clicks on that parent are dropped.
   * @param {string} messageId
   */
  function flashReviewLock(messageId) {
    const now = Date.now();
    const until = lockDenyUntil.get(messageId) ?? 0;
    if (now < until) {
      return;
    }
    const mark = root.querySelector(
      '.review-lock[data-review-lock="' + CSS.escape(messageId) + '"]',
    );
    if (!(mark instanceof HTMLElement)) {
      return;
    }
    const ends = now + LOCK_DENY_MS;
    lockDenyUntil.set(messageId, ends);
    mark.dataset.denyToken = String(ends);
    mark.classList.add('is-denied');
    setTimeout(() => {
      if (lockDenyUntil.get(messageId) === ends) {
        lockDenyUntil.delete(messageId);
      }
      if (mark.dataset.denyToken === String(ends)) {
        delete mark.dataset.denyToken;
        mark.classList.remove('is-denied');
      }
    }, LOCK_DENY_MS);
  }

  /**
   * Closed-lock glyph in front of a fixed review parent name.
   * A click writes `lock: false` on that Discord parent.
   * @param {string} messageId
   * @param {string} pageId
   */
  function reviewLockMark(messageId, pageId) {
    const mark = el('span', 'review-lock');
    mark.dataset.reviewLock = messageId;
    mark.title = t('reviewUnlock');
    mark.setAttribute('role', 'button');
    mark.setAttribute('aria-label', mark.title);
    mark.append(lockClosedIcon());
    mark.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      vscode.postMessage({
        type: 'reviewSetLock',
        pageId,
        messageId,
        locked: false,
      });
    });
    mark.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const parent = (reviewState?.messages || []).find((item) => item.id === messageId);
      if (parent?.isMr) {
        openReviewContextMenu(event.clientX, event.clientY, pageId, messageId);
      } else {
        openReviewMessageContextMenu(event.clientX, event.clientY, pageId, messageId);
      }
    });
    return mark;
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
  /**
   * Markdown link or bare URL. Groups: 1=label, 2=md-url, 3=bare-url.
   * http(s) and entity links (`page://group/…`, `page://note/…`).
   */
  const NOTE_LINK_RE =
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+|[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:group|note)\/[^)\s]+)\)|(https?:\/\/[^\s<>"']+|[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:group|note)\/[^\s<>"')\]]+)/g;

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

  /**
   * @param {{ silent?: boolean }} [opts]
   */
  function restoreNoteSelection(opts) {
    if (!savedNoteSelection || !activeNoteEdit) {
      return;
    }
    if (!opts?.silent) {
      activeNoteEdit.input.focus();
    }
    const sel = window.getSelection();
    sel?.removeAllRanges();
    try {
      sel?.addRange(savedNoteSelection);
    } catch {
      savedNoteSelection = null;
    }
  }

  /** @type {Node | null} */
  let markCaretNode = null;
  let markCaretOffset = -1;

  function rememberMarkCaret() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      markCaretNode = null;
      markCaretOffset = -1;
      return;
    }
    const range = sel.getRangeAt(0);
    markCaretNode = range.startContainer;
    markCaretOffset = range.startOffset;
  }

  document.addEventListener('selectionchange', () => {
    if (markSyncDepth || linkifyBusy || !activeNoteEdit) {
      return;
    }
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !activeNoteEdit.input.contains(sel.anchorNode)) {
      return;
    }
    const range = sel.getRangeAt(0);
    if (!range.collapsed) {
      rememberMarkCaret();
      return;
    }
    if (range.startContainer === markCaretNode && range.startOffset === markCaretOffset) {
      return;
    }
    rememberMarkCaret();
    pendingNoteMarks.bold = null;
    pendingNoteMarks.color = null;
    formattingReleased = false;
    updateFormatMenuState();
  });

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
        .replace(
          /\[([^\]]+)\]\((https?:\/\/[^)\s]+|[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:group|note)\/[^)\s]+)\)/g,
          '$1',
        )
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
        markBrokenEntityLink(link, mdUrl);
        fragment.append(link);
        last = match.index + match[0].length;
      } else if (bareUrl) {
        const link = el('a', 'note-link', bareUrl);
        link.href = bareUrl;
        link.rel = 'noopener noreferrer';
        markBrokenEntityLink(link, bareUrl);
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
      const wrap = el('span', 'note-color');
      setNoteColor(wrap, run.color);
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
      return [{ text: (node.textContent || '').replace(/\u200B/g, '') }];
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
      const label = (elNode.textContent || '').replace(/\u200B/g, '');
      if (!href || !label) {
        return [];
      }
      /** @type {NoteRun} */
      const run = { text: label !== href ? '[' + label + '](' + href + ')' : href };
      const inner = uniformMarksWithin(elNode);
      if (inner.b) {
        run.b = true;
      }
      if (inner.color) {
        run.color = inner.color;
      }
      if (inner.quote) {
        run.quote = true;
      }
      return [run];
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
    const color = elNode.dataset.color || colorAttr || elNode.style?.color;
    if (color) {
      const hex = normalizeHex(color);
      if (hex) {
        marks.color = hex;
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

  /**
   * @param {HTMLElement} input
   * @param {boolean} editing
   */
  function bindNoteLinks(input, editing) {
    input.querySelectorAll('a.note-link').forEach((node) => {
      if (!(node instanceof HTMLAnchorElement)) {
        return;
      }
      node.addEventListener('click', (event) => {
        event.preventDefault();
        if (editing || input.classList.contains('is-editing')) {
          return;
        }
        // Preview open is deferred with the note click: double-click edits
        // at this point, a drag selects text, a single click opens the URL.
      });
      if (!editing && (figmaLinkPreviewEnabled || !isFigmaPreviewUrl(node.href))) {
        let previewGen = linkPreviewGen;
        node.addEventListener('mouseenter', () => {
          previewGen = linkPreviewGen;
          if (!node.isConnected) {
            return;
          }
          showLinkPreview(node);
        });
        node.addEventListener('mouseleave', () => {
          if (previewGen !== linkPreviewGen || !node.isConnected) {
            return;
          }
          scheduleHideLinkPreview();
        });
      }
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
    input.replaceChildren(renderNoteDoc(doc, { linkify: true, editing }));
    input.contentEditable = editing ? 'true' : 'false';
    input.classList.toggle('is-editing', editing);
    input.spellcheck = editing;
    refreshNoteEmptyClass(input);
    bindNoteLinks(input, editing);
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

  /** @param {Range} range */
  function selectRange(range) {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  /**
   * @param {HTMLElement} input
   * @param {{ x: number, y: number } | null | undefined} point
   * @returns {{ x: number, y: number } | null}
   */
  function pointerForNoteEdit(input, point) {
    const saved = notePointer;
    notePointer = null;
    if (point) {
      return point;
    }
    if (saved && saved.input === input && Date.now() - saved.at < 800) {
      return saved;
    }
    return null;
  }

  /** @param {HTMLElement} input @returns {HTMLElement[]} */
  function noteContentBlocks(input) {
    /** @type {HTMLElement[]} */
    const blocks = [];
    for (const node of input.children) {
      if (
        node instanceof HTMLElement &&
        (node.classList.contains('note-p') || node.classList.contains('note-code'))
      ) {
        blocks.push(node);
      }
    }
    return blocks;
  }

  /**
   * @param {HTMLElement} input
   * @param {number} y
   * @returns {HTMLElement | null}
   */
  function noteBlockAtClientY(input, y) {
    const blocks = noteContentBlocks(input);
    /** @type {HTMLElement | null} */
    let closest = null;
    let closestDy = Infinity;
    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) {
        continue;
      }
      if (y >= rect.top && y <= rect.bottom) {
        return block;
      }
      const dy = y < rect.top ? rect.top - y : y - rect.bottom;
      if (dy < closestDy) {
        closestDy = dy;
        closest = block;
      }
    }
    return closest;
  }

  /** @param {HTMLElement} block @returns {HTMLElement} */
  function noteCodeBody(block) {
    const body = block.querySelector(':scope > .note-code-body');
    return body instanceof HTMLElement ? body : block;
  }

  /**
   * @param {HTMLElement} root
   * @param {number} x
   * @param {number} y
   * @returns {Range | null}
   */
  function caretRangeFromClientPoint(root, x, y) {
    const doc = root.ownerDocument;
    if (typeof doc.caretRangeFromPoint === 'function') {
      const range = doc.caretRangeFromPoint(x, y);
      if (range && root.contains(range.startContainer)) {
        const collapsed = range.cloneRange();
        collapsed.collapse(true);
        return collapsed;
      }
    }
    if (typeof doc.caretPositionFromPoint === 'function') {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos?.offsetNode && root.contains(pos.offsetNode)) {
        const range = doc.createRange();
        try {
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
          return range;
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  /** @param {Range} range @param {number} y */
  function caretHitsClientY(range, y) {
    for (const rect of range.getClientRects()) {
      if (rect.height > 0 && y >= rect.top - 2 && y <= rect.bottom + 2) {
        return true;
      }
    }
    return false;
  }

  /**
   * Caret in `block` at the click. Preview tokens and edit `<br>` lines share
   * the same raw characters, so a hit on the preview maps onto the edit DOM.
   * @param {HTMLElement} block
   * @param {number} x
   * @param {number} y
   * @returns {Range | null}
   */
  function caretRangeOnBlock(block, x, y) {
    const direct = caretRangeFromClientPoint(block, x, y);
    if (direct && caretHitsClientY(direct, y)) {
      return direct;
    }
    const probe = block.ownerDocument.createRange();
    probe.selectNodeContents(noteCodeBody(block));
    /** @type {DOMRect | null} */
    let best = null;
    let bestDy = Infinity;
    let bestDx = Infinity;
    for (const rect of probe.getClientRects()) {
      if (rect.height <= 0) {
        continue;
      }
      const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      if (dy < bestDy - 0.5 || (Math.abs(dy - bestDy) <= 0.5 && dx < bestDx)) {
        bestDy = dy;
        bestDx = dx;
        best = rect;
      }
    }
    if (!best) {
      return direct;
    }
    const midY = (best.top + best.bottom) / 2;
    const cx = Math.min(Math.max(x, best.left + 0.5), Math.max(best.left + 0.5, best.right - 0.5));
    const snapped = caretRangeFromClientPoint(block, cx, midY);
    if (snapped && caretHitsClientY(snapped, midY)) {
      return snapped;
    }
    return snapped || direct;
  }

  /**
   * @param {Node} node
   * @returns {number}
   */
  function visibleTextLength(node) {
    if (!node) {
      return 0;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || '').length;
    }
    if (node.nodeType === Node.ELEMENT_NODE && /** @type {HTMLElement} */ (node).tagName === 'BR') {
      return 0;
    }
    let total = 0;
    for (const child of node.childNodes) {
      total += visibleTextLength(child);
    }
    return total;
  }

  /**
   * Raw character offset of `caret` inside `container`.
   * Code blocks count newlines; paragraph caret-sink `<br>`s do not.
   * @param {HTMLElement} container
   * @param {Range} caret
   * @param {boolean} countBreaks
   */
  function rawOffsetBefore(container, caret, countBreaks) {
    if (!container.contains(caret.startContainer)) {
      return 0;
    }
    const probe = container.ownerDocument.createRange();
    try {
      probe.selectNodeContents(container);
      probe.setEnd(caret.startContainer, caret.startOffset);
    } catch {
      return 0;
    }
    const wrap = container.ownerDocument.createElement('div');
    wrap.append(probe.cloneContents());
    if (countBreaks) {
      return plainTextFromNode(wrap).length;
    }
    return visibleTextLength(wrap);
  }

  /**
   * Same markdown `runsFromNode` writes for a link.
   * @param {HTMLAnchorElement} anchor
   * @returns {{ markdown: boolean, len: number, label: string }}
   */
  function anchorMarkdown(anchor) {
    const href = anchor.getAttribute('href') || '';
    const label = anchor.textContent || '';
    if (href && label && label !== href) {
      return { markdown: true, len: ('[' + label + '](' + href + ')').length, label };
    }
    const text = href || label;
    return { markdown: false, len: text.length, label: text };
  }

  /**
   * Offset in the paragraph's raw text (links expanded to markdown).
   * @param {HTMLElement} para
   * @param {Range} caret
   */
  function rawOffsetInParagraph(para, caret) {
    /** @type {{ done: boolean, offset: number }} */
    const state = { done: false, offset: 0 };
    /** @param {Node} node */
    const walk = (node) => {
      if (state.done) {
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (caret.startContainer === node) {
          state.offset += Math.max(0, Math.min(caret.startOffset, text.length));
          state.done = true;
          return;
        }
        state.offset += text.length;
        return;
      }
      if (!(node instanceof HTMLElement)) {
        return;
      }
      if (node.tagName === 'BR') {
        if (caret.startContainer === node) {
          state.done = true;
        }
        return;
      }
      if (node instanceof HTMLAnchorElement) {
        const info = anchorMarkdown(node);
        if (caret.startContainer === node) {
          if (caret.startOffset <= 0) {
            state.offset += info.markdown ? 1 : 0;
          } else {
            state.offset += info.len;
          }
          state.done = true;
          return;
        }
        if (node.contains(caret.startContainer)) {
          const local = rawOffsetBefore(node, caret, false);
          if (info.markdown) {
            state.offset += local >= info.label.length ? info.len : 1 + local;
          } else {
            state.offset += local;
          }
          state.done = true;
          return;
        }
        state.offset += info.len;
        return;
      }
      if (caret.startContainer === node) {
        const children = node.childNodes;
        const index = Math.min(caret.startOffset, children.length);
        for (let i = 0; i < index; i++) {
          const child = children[i];
          if (child) {
            walk(child);
          }
        }
        state.done = true;
        return;
      }
      for (const child of node.childNodes) {
        walk(child);
      }
    };
    walk(para);
    return state.offset;
  }

  /**
   * Where the click landed in the preview, as an edit-mode raw offset.
   * Preview links and highlight tokens are not the editing DOM.
   * @param {HTMLElement} input
   * @param {number} x
   * @param {number} y
   * @returns {{ blockIndex: number, offset: number } | null}
   */
  function resolveNoteCaret(input, x, y) {
    const block = noteBlockAtClientY(input, y);
    if (!(block instanceof HTMLElement)) {
      return null;
    }
    const range = caretRangeOnBlock(block, x, y);
    if (!range || !block.contains(range.startContainer)) {
      return null;
    }
    const blockIndex = noteContentBlocks(input).indexOf(block);
    if (blockIndex < 0) {
      return null;
    }
    const offset = block.classList.contains('note-code')
      ? rawOffsetBefore(noteCodeBody(block), range, true)
      : rawOffsetInParagraph(block, range);
    return { blockIndex, offset };
  }

  /**
   * @param {HTMLElement} root
   * @param {number} offset
   * @param {boolean} countBreaks
   */
  function placeCaretByRawOffset(root, offset, countBreaks) {
    let remaining = Math.max(0, offset);
    const doc = root.ownerDocument;
    const range = doc.createRange();
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          return NodeFilter.FILTER_ACCEPT;
        }
        if (node instanceof HTMLElement && node.tagName === 'BR') {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });
    /** @type {Text | null} */
    let lastText = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = /** @type {Text} */ (node);
        const len = textNode.textContent?.length || 0;
        lastText = textNode;
        if (remaining <= len) {
          range.setStart(textNode, remaining);
          range.collapse(true);
          selectRange(range);
          return true;
        }
        remaining -= len;
        continue;
      }
      if (!countBreaks) {
        continue;
      }
      if (remaining <= 0) {
        range.setStartBefore(node);
        range.collapse(true);
        selectRange(range);
        return true;
      }
      remaining -= 1;
    }
    if (lastText) {
      range.setStart(lastText, lastText.textContent?.length || 0);
      range.collapse(true);
      selectRange(range);
      return true;
    }
    range.selectNodeContents(root);
    range.collapse(true);
    selectRange(range);
    return true;
  }

  /**
   * @param {HTMLElement} input
   * @param {number} blockIndex
   * @param {number} offset
   */
  function placeCaretAtNoteOffset(input, blockIndex, offset) {
    const block = noteContentBlocks(input)[blockIndex];
    if (!(block instanceof HTMLElement)) {
      return false;
    }
    if (block.classList.contains('note-code')) {
      return placeCaretByRawOffset(noteCodeBody(block), offset, true);
    }
    return placeCaretByRawOffset(block, offset, false);
  }

  /**
   * Focus can park the caret at offset 0 after we set it. Re-apply next frame.
   * @param {HTMLElement} input
   * @param {{ blockIndex: number, offset: number }} caret
   */
  function placeNoteCaretLater(input, caret) {
    placeCaretAtNoteOffset(input, caret.blockIndex, caret.offset);
    const blockIndex = caret.blockIndex;
    const offset = caret.offset;
    requestAnimationFrame(() => {
      if (activeNoteEdit?.input !== input || !input.isConnected) {
        return;
      }
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed) {
        return;
      }
      placeCaretAtNoteOffset(input, blockIndex, offset);
    });
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

  /** @param {EventTarget | null} target */
  function noteInputFromTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    const input = target.closest('.note-input');
    return input instanceof HTMLElement ? input : null;
  }

  /** @param {EventTarget | null} target */
  function noteFieldLinkUrl(target) {
    if (!(target instanceof Element)) {
      return '';
    }
    const link = target.closest('a.note-link');
    if (!(link instanceof HTMLAnchorElement)) {
      return '';
    }
    return link.getAttribute('href') || link.href || '';
  }

  /** @param {string} noteId */
  function noteInputById(noteId) {
    if (!noteId) {
      return null;
    }
    const node = root.querySelector(
      '.note-card[data-note-id="' + CSS.escape(noteId) + '"] .note-input',
    );
    return node instanceof HTMLElement ? node : null;
  }

  function clearNoteClickTimer() {
    if (noteClickGesture?.timer) {
      window.clearTimeout(noteClickGesture.timer);
      noteClickGesture.timer = 0;
    }
  }

  /**
   * Distance from the press that started this gesture.
   * @param {PointerEvent} event
   */
  function notePressTravel(event) {
    const gesture = noteClickGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return 0;
    }
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    return dx * dx + dy * dy;
  }

  /**
   * A press that travelled past the slop is a drag. A short slip stays a click,
   * otherwise a shaky click never folds the card.
   * @param {PointerEvent} event
   */
  function notePressIsDrag(event) {
    const gesture = noteClickGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return false;
    }
    if (gesture.phase !== 'down' && gesture.phase !== 'second') {
      return gesture.moved;
    }
    if (notePressTravel(event) >= NOTE_DRAG_PX * NOTE_DRAG_PX) {
      gesture.moved = true;
    }
    return gesture.moved;
  }

  /**
   * Skip the immediate working-focus on note text. A drag must not focus,
   * and a click waits so the double-click is not lost to a re-render.
   * Locked text still focuses on a real click; a drag on it does not.
   * @param {PointerEvent} event
   */
  function deferNoteTextFocus(event) {
    if (notePressIsDrag(event)) {
      return true;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return false;
    }
    const field = target.closest('.note-input');
    if (!(field instanceof HTMLElement) || field.dataset.locked === '1') {
      return false;
    }
    return true;
  }

  /** @param {string} noteId */
  function markNoteWorking(noteId) {
    if (!noteId) {
      return;
    }
    if (data) {
      data.focus = { kind: 'note', id: noteId };
    }
    vscode.postMessage({ type: 'setFocus', kind: 'note', id: noteId });
  }

  /** @param {NoteClickGesture} gesture */
  function applyNoteSingleClick(gesture) {
    if (gesture.moved || gesture.locked) {
      return;
    }
    if (activeNoteEdit?.noteId === gesture.noteId) {
      return;
    }
    markNoteWorking(gesture.noteId);
    if (gesture.linkUrl) {
      if (isCollapsed(gesture.noteId)) {
        toggleCollapsed(gesture.noteId);
      }
      if (!followEntityUrl(gesture.linkUrl, { noteId: gesture.noteId, url: gesture.linkUrl })) {
        vscode.postMessage({ type: 'openExternal', url: gesture.linkUrl });
      }
      return;
    }
    const input = gesture.input.isConnected ? gesture.input : noteInputById(gesture.noteId);
    if (input && !isNoteFirstLineClick(input, gesture.y)) {
      return;
    }
    toggleCollapsed(gesture.noteId);
  }

  /**
   * Fold only from a click on the first visible line of note text.
   * @param {HTMLElement} input
   * @param {number} clientY
   */
  function isNoteFirstLineClick(input, clientY) {
    const card = input.closest('.note-card');
    if (card instanceof HTMLElement && card.classList.contains('collapsed')) {
      return true;
    }
    const rect = input.getBoundingClientRect();
    if (clientY < rect.top || clientY > rect.bottom) {
      return false;
    }
    const header = input.closest('.note-header');
    let firstLine = 0;
    if (header instanceof HTMLElement) {
      firstLine = parseFloat(getComputedStyle(header).getPropertyValue('--note-first-line')) || 0;
    }
    if (!firstLine) {
      firstLine = parseFloat(getComputedStyle(input).lineHeight) || rect.height;
    }
    return clientY <= rect.top + firstLine;
  }

  /**
   * @param {HTMLElement} input
   * @param {{ x: number, y: number }} point
   */
  function openNoteAtClick(input, point) {
    noteDoubleEditAt = Date.now();
    const noteId = input.dataset.noteId || '';
    const alreadyWorking = !!(data?.focus?.kind === 'note' && data.focus.id === noteId);
    const wasCollapsed = !!(noteId && isCollapsed(noteId));
    markNoteWorking(noteId);
    beginNoteEdit(input, point);
    if (!noteId || alreadyWorking) {
      return;
    }
    // setFocus repaints. Keep this edit across that paint, then drop the hold
    // so a later repaint does not reopen a stale editor.
    if (wasCollapsed) {
      if (pendingEditAfterExpandId === noteId) {
        pendingEditAfterExpandPaints += 1;
      }
    } else if (activeNoteEdit?.noteId === noteId) {
      pendingEditAfterExpandId = noteId;
      pendingEditAfterExpandPaints = 1;
    }
    const armedAt = noteDoubleEditAt;
    window.setTimeout(() => {
      if (noteDoubleEditAt !== armedAt || pendingEditAfterExpandId !== noteId) {
        return;
      }
      if (activeNoteEdit?.input?.isConnected) {
        pendingEditAfterExpandId = '';
        pendingEditAfterExpandPaints = 0;
      }
    }, 1500);
  }

  /**
   * Park a note click that already landed. The caller is inside another
   * pointerdown; folding now would destroy that press's target.
   */
  function queueWaitingNoteClick() {
    const pending = noteClickGesture;
    if (!pending || pending.phase !== 'waiting') {
      return;
    }
    clearNoteClickTimer();
    noteClickGesture = null;
    if (pending.moved || pending.locked) {
      return;
    }
    queuedNoteClick = pending;
  }

  /** Run a parked note click after the interrupting press has toggled. */
  function flushQueuedNoteClick() {
    const pending = queuedNoteClick;
    if (!pending) {
      return;
    }
    queuedNoteClick = null;
    applyNoteSingleClick(pending);
  }

  /** @param {PointerEvent} event */
  function onNoteFieldPointerDown(event) {
    if (event.button !== 0 || document.body.classList.contains('is-dragging')) {
      return;
    }
    const input = noteInputFromTarget(event.target);
    if (!input) {
      queueWaitingNoteClick();
      return;
    }
    notePressWasDrag = false;
    const locked = input.dataset.locked === '1';
    if (activeNoteEdit?.input === input) {
      if (noteClickGesture?.noteId === (input.dataset.noteId || '')) {
        clearNoteClickTimer();
        noteClickGesture = null;
      }
      notePointer = null;
      return;
    }
    const now = Date.now();
    const linkUrl = noteFieldLinkUrl(event.target);
    const pending = noteClickGesture;
    if (
      pending &&
      !locked &&
      pending.noteId === (input.dataset.noteId || '') &&
      pending.phase === 'waiting' &&
      !pending.moved &&
      now - pending.upAt < NOTE_CLICK_MS
    ) {
      clearNoteClickTimer();
      pending.phase = 'second';
      pending.input = input;
      pending.x = event.clientX;
      pending.y = event.clientY;
      pending.linkUrl = linkUrl;
      pending.pointerId = event.pointerId;
      pending.moved = false;
      notePointer = { input, x: event.clientX, y: event.clientY, at: now };
      return;
    }
    if (pending?.phase === 'waiting') {
      clearNoteClickTimer();
      noteClickGesture = null;
      if (!pending.moved && !pending.locked) {
        queuedNoteClick = pending;
      }
    } else if (pending) {
      clearNoteClickTimer();
      noteClickGesture = null;
    }
    const live = input.isConnected ? input : noteInputById(input.dataset.noteId || '');
    const field = live && live.isConnected ? live : input;
    noteClickGesture = {
      noteId: field.dataset.noteId || '',
      input: field,
      x: event.clientX,
      y: event.clientY,
      linkUrl,
      moved: false,
      locked: field.dataset.locked === '1',
      phase: 'down',
      upAt: 0,
      timer: 0,
      pointerId: event.pointerId,
    };
    if (!noteClickGesture.locked) {
      notePointer = { input: field, x: event.clientX, y: event.clientY, at: now };
    }
  }

  /** @param {PointerEvent} event */
  function onNoteFieldPointerMove(event) {
    const gesture = noteClickGesture;
    if (!gesture || gesture.phase === 'waiting' || event.pointerId !== gesture.pointerId) {
      return;
    }
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (dx * dx + dy * dy >= NOTE_DRAG_PX * NOTE_DRAG_PX) {
      gesture.moved = true;
    }
  }

  /** @param {PointerEvent} event */
  function finishNoteFieldPress(event) {
    if (event.button !== 0) {
      return;
    }
    const gesture = noteClickGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    if (gesture.phase === 'waiting') {
      return;
    }
    if (notePressIsDrag(event)) {
      notePressWasDrag = true;
      clearNoteClickTimer();
      noteClickGesture = null;
      notePointer = null;
      return;
    }
    if (gesture.locked) {
      noteClickGesture = null;
      return;
    }
    const input = gesture.input.isConnected ? gesture.input : noteInputById(gesture.noteId);
    if (gesture.phase === 'second') {
      noteClickGesture = null;
      if (input) {
        openNoteAtClick(input, { x: event.clientX, y: event.clientY });
      }
      return;
    }
    gesture.phase = 'waiting';
    gesture.upAt = Date.now();
    const linkUrl = noteFieldLinkUrl(event.target);
    if (linkUrl) {
      gesture.linkUrl = linkUrl;
    }
    gesture.timer = window.setTimeout(() => {
      if (noteClickGesture !== gesture) {
        return;
      }
      noteClickGesture = null;
      applyNoteSingleClick(gesture);
    }, NOTE_CLICK_MS);
  }

  /** @param {PointerEvent} event */
  function onNoteFieldPointerCancel(event) {
    const gesture = noteClickGesture;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.phase === 'waiting') {
      return;
    }
    clearNoteClickTimer();
    noteClickGesture = null;
  }

  document.addEventListener('pointerdown', onNoteFieldPointerDown, true);
  document.addEventListener('pointermove', onNoteFieldPointerMove, true);
  document.addEventListener('pointerup', finishNoteFieldPress, true);
  document.addEventListener('pointerup', () => {
    flushQueuedNoteClick();
  });
  document.addEventListener('pointercancel', onNoteFieldPointerCancel, true);
  document.addEventListener(
    'dblclick',
    (event) => {
      if (Date.now() - noteDoubleEditAt > 400) {
        return;
      }
      const input = noteInputFromTarget(event.target);
      if (!input || input.dataset.locked === '1') {
        return;
      }
      event.preventDefault();
    },
    true,
  );

  /**
   * @param {HTMLElement} input
   * @param {{ x: number, y: number } | null} [point]
   */
  function beginNoteEdit(input, point) {
    if (input.dataset.locked === '1') {
      return;
    }
    cancelNoteBlurEnd();
    const noteId = input.dataset.noteId || '';
    const at = pointerForNoteEdit(input, point);
    // Editing must expand for real — is-note-editing only hides the clamp while focused.
    if (noteId && isCollapsed(noteId)) {
      if (at) {
        const caret = resolveNoteCaret(input, at.x, at.y);
        pendingNoteCaret = caret ? { noteId, blockIndex: caret.blockIndex, offset: caret.offset } : null;
      }
      pendingEditAfterExpandId = noteId;
      // Local toggle render + follow-up host state push both rebuild the DOM.
      pendingEditAfterExpandPaints = 2;
      toggleCollapsed(noteId);
      return;
    }
    // Resolve against the preview first: painting replaces it with raw text.
    const caret = at ? resolveNoteCaret(input, at.x, at.y) : null;
    if (caret && noteId) {
      pendingNoteCaret = { noteId, blockIndex: caret.blockIndex, offset: caret.offset };
    } else if (at) {
      pendingNoteCaret = null;
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
    pendingNoteMarks = { bold: null, quote: false, color: null };
    formattingReleased = false;
    liveTextColorSpans = null;
    setNoteEditingChrome(input, true);
    setFormatToolbarVisible(true);
    updateFormatMenuState();
    if (caret) {
      input.focus({ preventScroll: true });
      placeNoteCaretLater(input, caret);
    } else {
      input.focus();
    }
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
    pendingNoteCaret = null;
    notePointer = null;
    pendingNoteMarks = { bold: null, quote: false, color: null };
    formattingReleased = false;
    liveTextColorSpans = null;
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
      const boldOn = formattingReleased
        ? false
        : pendingNoteMarks.bold === null
          ? queryInlineMark('bold')
          : pendingNoteMarks.bold;
      boldBtn.classList.toggle('is-active', boldOn);
    }
    if (quoteBtn instanceof HTMLElement) {
      const quoteOn = formattingReleased ? false : pendingNoteMarks.quote || queryInlineMark('quote');
      quoteBtn.classList.toggle('is-active', quoteOn);
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
    formattingReleased = false;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
      const on = pendingNoteMarks.bold === null ? queryInlineMark('bold') : pendingNoteMarks.bold;
      pendingNoteMarks.bold = !on;
      updateFormatMenuState();
      rememberMarkCaret();
      return;
    }
    markSyncDepth += 1;
    try {
      applyBoldToRange(sel.getRangeAt(0));
    } finally {
      markSyncDepth -= 1;
    }
    pendingNoteMarks.bold = null;
    updateFormatMenuState();
    rememberMarkCaret();
  }

  function toggleQuoteFormat() {
    if (!activeNoteEdit) {
      return;
    }
    formattingReleased = false;
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
      ejectTrailingBreaks(wrap);
    }
    updateFormatMenuState();
  }

  /** A caret <br> wrapped into a quote must not keep the caret from the quote's end. */
  function ejectTrailingBreaks(mark) {
    if (!mark.isConnected) {
      return;
    }
    while (mark.lastChild && mark.lastChild.nodeName === 'BR') {
      const br = mark.lastChild;
      mark.after(br);
    }
    if (!(mark.textContent || '').replace(/\u200B/g, '') && !mark.querySelector('img, a')) {
      unwrapElement(mark);
    }
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

  /**
   * @param {Node | null | undefined} node
   * @returns {HTMLElement | null}
   */
  function elementFromNode(node) {
    if (!node) {
      return null;
    }
    return node.nodeType === Node.ELEMENT_NODE ? /** @type {HTMLElement} */ (node) : node.parentElement;
  }

  /**
   * @param {Node | null | undefined} node
   * @param {(el: HTMLElement) => boolean} pred
   * @returns {HTMLElement | null}
   */
  function closestMark(node, pred) {
    let el = elementFromNode(node);
    const root = activeNoteEdit?.input;
    while (el) {
      if (el.classList.contains('note-code')) {
        return null;
      }
      if (pred(el)) {
        return el;
      }
      if (el.classList.contains('note-input') || (root && el === root)) {
        return null;
      }
      el = el.parentElement;
    }
    return null;
  }

  /** @param {HTMLElement} el */
  function isQuoteEl(el) {
    return el.classList.contains('note-quote');
  }

  /** @param {HTMLElement} el */
  function isBoldEl(el) {
    return el.tagName === 'B' || el.tagName === 'STRONG';
  }

  /** @param {HTMLElement} el */
  function isColorEl(el) {
    if (el.classList.contains('note-input') || el.classList.contains('note-p') || el.classList.contains('note-code')) {
      return false;
    }
    return el.classList.contains('note-color') || el.tagName === 'FONT' || !!el.style.color;
  }

  /**
   * @param {string | null | undefined} color
   * @returns {string | null}
   */
  function normalizeHex(color) {
    if (!color || typeof color !== 'string') {
      return null;
    }
    const parsed = splitHexAlpha(color);
    if (parsed) {
      return hexWithAlpha(parsed.rgb, parsed.alpha);
    }
    const hex = toHex(color);
    return hex ? hex.toLowerCase() : null;
  }

  /**
   * @param {HTMLElement} span
   * @param {string} color
   */
  function setNoteColor(span, color) {
    const hex = normalizeHex(color) || color;
    span.classList.add('note-color');
    if (hex) {
      span.dataset.color = hex;
    }
    span.style.color = hex;
  }

  /**
   * Marks shared by every text node inside `root` (link labels).
   * @param {HTMLElement} root
   * @returns {{ b?: true, color?: string, quote?: true }}
   */
  function uniformMarksWithin(root) {
    /** @type {Text[]} */
    const texts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    /** @type {Node | null} */
    let current = walker.nextNode();
    while (current) {
      if ((current.textContent || '').replace(/\u200B/g, '')) {
        texts.push(/** @type {Text} */ (current));
      }
      current = walker.nextNode();
    }
    /** @type {{ b?: true, color?: string, quote?: true }} */
    const out = {};
    if (!texts.length) {
      return out;
    }
    if (texts.every((text) => closestMark(text, isBoldEl))) {
      out.b = true;
    }
    if (texts.every((text) => closestMark(text, (el) => el.classList.contains('note-quote')))) {
      out.quote = true;
    }
    const colors = texts.map((text) => {
      const mark = closestMark(text, isColorEl);
      if (!mark) {
        return '';
      }
      return mark.dataset.color || normalizeHex(mark.getAttribute('color') || mark.style.color) || '';
    });
    if (colors[0] && colors.every((item) => item === colors[0])) {
      out.color = colors[0];
    }
    return out;
  }

  /**
   * @param {Range} range
   * @returns {Array<{ text: Text, start: number, end: number }>}
   */
  function selectedTextSlices(range) {
    const root =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentNode;
    /** @type {Array<{ text: Text, start: number, end: number }>} */
    const slices = [];
    if (!root) {
      return slices;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    /** @type {Node | null} */
    let current = walker.nextNode();
    while (current) {
      const text = /** @type {Text} */ (current);
      current = walker.nextNode();
      if (!text.length || closestNoteCode(text)) {
        continue;
      }
      let hit = false;
      try {
        hit = range.intersectsNode(text);
      } catch {
        hit = false;
      }
      if (!hit) {
        continue;
      }
      let start = 0;
      let end = text.length;
      if (text === range.startContainer) {
        start = range.startOffset;
      }
      if (text === range.endContainer) {
        end = range.endOffset;
      }
      if (start < end) {
        slices.push({ text, start, end });
      }
    }
    return slices;
  }

  /**
   * @param {Text} text
   * @param {number} start
   * @param {number} end
   * @returns {Text}
   */
  function isolateSlice(text, start, end) {
    let node = text;
    if (end < node.length) {
      node.splitText(end);
    }
    if (start > 0) {
      node = node.splitText(start);
    }
    return node;
  }

  /**
   * Split `element` so `child` (a direct child) sits in its own clone of `element`.
   * @param {HTMLElement} element
   * @param {Node} child
   * @returns {HTMLElement}
   */
  function splitElementAroundChild(element, child) {
    const left = /** @type {HTMLElement} */ (element.cloneNode(false));
    const right = /** @type {HTMLElement} */ (element.cloneNode(false));
    const kids = Array.from(element.childNodes);
    const index = kids.indexOf(child);
    for (let i = 0; i < index; i++) {
      left.append(kids[i]);
    }
    for (let i = index + 1; i < kids.length; i++) {
      right.append(kids[i]);
    }
    if (left.childNodes.length) {
      element.before(left);
    }
    if (right.childNodes.length) {
      element.after(right);
    }
    return element;
  }

  /**
   * Pull `textNode` out of `mark`, keeping intermediate wrappers (color, quote).
   * @param {Text} textNode
   * @param {HTMLElement} mark
   */
  function peelTextFromMark(textNode, mark) {
    let node = /** @type {Node} */ (textNode);
    while (node.parentElement && node.parentElement !== mark) {
      splitElementAroundChild(node.parentElement, node);
      const parent = node.parentElement;
      if (!parent) {
        return;
      }
      node = parent;
    }
    if (node.parentElement === mark) {
      const middle = splitElementAroundChild(mark, node);
      unwrapElement(middle);
    }
  }

  /**
   * @param {Range} range
   */
  function applyBoldToRange(range) {
    const slices = selectedTextSlices(range);
    if (!slices.length) {
      return;
    }
    const turnOff = slices.every(({ text }) => closestMark(text, isBoldEl));
    /** @type {Text[]} */
    const mids = [];
    for (let i = slices.length - 1; i >= 0; i--) {
      const slice = slices[i];
      const mid = isolateSlice(slice.text, slice.start, slice.end);
      if (turnOff) {
        const bold = closestMark(mid, isBoldEl);
        if (bold) {
          peelTextFromMark(mid, bold);
        }
      } else if (!closestMark(mid, isBoldEl)) {
        const wrap = document.createElement('b');
        mid.replaceWith(wrap);
        wrap.append(mid);
      }
      mids.push(mid);
    }
    mids.reverse();
    const first = mids[0];
    const last = mids[mids.length - 1];
    if (!first || !last || !first.isConnected || !last.isConnected) {
      return;
    }
    const next = document.createRange();
    next.setStart(first, 0);
    next.setEnd(last, last.length);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(next);
  }

  /**
   * @param {Range} range
   * @param {string} color
   * @returns {HTMLElement[]}
   */
  function applyColorToRange(range, color) {
    const hex = normalizeHex(color) || color;
    const slices = selectedTextSlices(range);
    /** @type {HTMLElement[]} */
    const spans = [];
    /** @type {Text[]} */
    const mids = [];
    for (let i = slices.length - 1; i >= 0; i--) {
      const slice = slices[i];
      const mid = isolateSlice(slice.text, slice.start, slice.end);
      const existing = closestMark(mid, isColorEl);
      /** @type {HTMLElement} */
      let span;
      if (
        existing &&
        (existing.dataset.color || normalizeHex(existing.style.color) || '') === hex &&
        existing.textContent === mid.textContent
      ) {
        setNoteColor(existing, hex);
        span = existing;
      } else {
        if (existing) {
          peelTextFromMark(mid, existing);
        }
        span = document.createElement('span');
        setNoteColor(span, hex);
        mid.replaceWith(span);
        span.append(mid);
      }
      spans.push(span);
      mids.push(mid);
    }
    spans.reverse();
    mids.reverse();
    const first = mids[0];
    const last = mids[mids.length - 1];
    if (first && last && first.isConnected && last.isConnected) {
      const next = document.createRange();
      next.setStart(first, 0);
      next.setEnd(last, last.length);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(next);
      savedNoteSelection = next.cloneRange();
    }
    return spans;
  }

  /**
   * @returns {{ bold: boolean, color: string | null, quote: boolean }}
   */
  function marksAtCaret() {
    const sel = window.getSelection();
    const node = sel?.anchorNode || null;
    const colorEl = closestMark(node, isColorEl);
    const color = colorEl
      ? colorEl.dataset.color || normalizeHex(colorEl.getAttribute('color') || colorEl.style.color)
      : null;
    return {
      bold: !!closestMark(node, isBoldEl),
      color,
      quote: !!closestMark(node, (el) => el.classList.contains('note-quote')),
    };
  }

  /**
   * @returns {{ bold: boolean, color: string | null, quote: boolean }}
   */
  function wantedMarks() {
    const have = marksAtCaret();
    if (formattingReleased) {
      return {
        bold: false,
        color: null,
        quote: false,
      };
    }
    return {
      bold: pendingNoteMarks.bold === null ? have.bold : pendingNoteMarks.bold,
      color: pendingNoteMarks.color ? pendingNoteMarks.color : have.color,
      quote: pendingNoteMarks.quote || have.quote,
    };
  }

  /**
   * @param {(el: HTMLElement) => boolean} pred
   */
  function peelCollapsedMark(pred) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      return;
    }
    const range = sel.getRangeAt(0);
    const mark = closestMark(range.startContainer, pred);
    if (!mark) {
      return;
    }
    const after = document.createRange();
    after.selectNodeContents(mark);
    try {
      after.setStart(range.startContainer, range.startOffset);
    } catch {
      return;
    }
    const frag = after.extractContents();
    const fragText = (frag.textContent || '').replace(/\u200B/g, '');
    const hasAtom = !!frag.querySelector?.('img, a');
    if (fragText || hasAtom) {
      const right = /** @type {HTMLElement} */ (mark.cloneNode(false));
      right.append(frag);
      mark.after(right);
    } else if (frag.childNodes.length) {
      mark.after(frag);
    }
    const caret = document.createRange();
    const parent = mark.parentNode;
    const markText = (mark.textContent || '').replace(/\u200B/g, '');
    if (!markText && !mark.querySelector('br, img, a')) {
      const next = mark.nextSibling;
      mark.remove();
      if (next && next.parentNode) {
        caret.setStartBefore(next);
      } else if (parent) {
        caret.setStart(parent, parent.childNodes.length);
      } else {
        return;
      }
    } else {
      caret.setStartAfter(mark);
    }
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
  }

  /**
   * @param {string} data
   * @param {{ bold: boolean, color: string | null, quote: boolean }} want
   */
  function insertMarkedText(data, want) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    let have = marksAtCaret();
    if (have.bold && !want.bold) {
      peelCollapsedMark(isBoldEl);
    }
    have = marksAtCaret();
    if (have.color && have.color !== want.color) {
      peelCollapsedMark(isColorEl);
    }
    have = marksAtCaret();
    if (have.quote && !want.quote) {
      peelCollapsedMark((el) => el.classList.contains('note-quote'));
    }
    have = marksAtCaret();
    const textNode = document.createTextNode(data);
    let node = /** @type {Node} */ (textNode);
    if (want.quote && !have.quote) {
      const wrap = el('span', 'note-quote');
      wrap.append(node);
      node = wrap;
    }
    if (want.color && have.color !== want.color) {
      const wrap = document.createElement('span');
      setNoteColor(wrap, want.color);
      wrap.append(node);
      node = wrap;
    }
    if (want.bold && !have.bold) {
      const wrap = document.createElement('b');
      wrap.append(node);
      node = wrap;
    }
    const live = sel.getRangeAt(0);
    live.insertNode(node);
    const caret = document.createRange();
    caret.setStart(textNode, textNode.length);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
  }

  /**
   * @param {Range} range
   * @param {'start' | 'end'} side
   * @param {(el: HTMLElement) => boolean} pred
   * @returns {HTMLElement | null}
   */
  function markAtEdge(range, side, pred) {
    const mark = closestMark(range.startContainer, pred);
    if (!mark || !mark.contains(range.startContainer)) {
      return null;
    }
    const probe = document.createRange();
    probe.selectNodeContents(mark);
    try {
      if (side === 'end') {
        probe.setStart(range.startContainer, range.startOffset);
      } else {
        probe.setEnd(range.startContainer, range.startOffset);
      }
    } catch {
      return null;
    }
    const holder = document.createElement('div');
    holder.append(probe.cloneContents());
    // A trailing caret <br> is not more quote text. The caret is still at the end.
    const leftover = plainTextFromNode(holder).replace(/\u200B/g, '').replace(/\n+$/g, '');
    if (leftover !== '') {
      return null;
    }
    return mark;
  }

  /**
   * @param {Range} range
   * @returns {string}
   */
  function charBeforeCaret(range) {
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      let index = range.startOffset;
      while (index > 0 && text[index - 1] === '\u200B') {
        index -= 1;
      }
      if (index > 0) {
        return text[index - 1];
      }
    }
    let current =
      node.nodeType === Node.TEXT_NODE
        ? node.previousSibling
        : node.nodeType === Node.ELEMENT_NODE
          ? /** @type {HTMLElement} */ (node).childNodes[range.startOffset - 1] || null
          : null;
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        const text = (current.textContent || '').replace(/\u200B/g, '');
        if (text) {
          return text[text.length - 1];
        }
      } else if (current instanceof HTMLElement) {
        if (current.tagName === 'BR') {
          return '\n';
        }
        const text = (current.textContent || '').replace(/\u200B/g, '');
        if (text) {
          return text[text.length - 1];
        }
      }
      current = current.previousSibling;
    }
    return '';
  }

  /** @param {string} ch */
  function isPlainSpace(ch) {
    return ch === ' ' || ch === '\u00a0';
  }

  /**
   * Trailing double-space leaves the mark. For a quote, the signaling space is removed too.
   * @returns {boolean}
   */
  function secondSpaceLeavesFormatting() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) {
      return false;
    }
    const range = sel.getRangeAt(0);
    if (closestNoteCode(range.startContainer)) {
      return false;
    }
    const have = marksAtCaret();
    if (!have.bold && !have.color && !have.quote) {
      return !!markSwallowedAfter(range);
    }
    if (!isPlainSpace(charBeforeCaret(range))) {
      return false;
    }
    if (have.bold && !markAtEdge(range, 'end', isBoldEl)) {
      return false;
    }
    if (have.color && !markAtEdge(range, 'end', isColorEl)) {
      return false;
    }
    if (have.quote && !markAtEdge(range, 'end', isQuoteEl)) {
      return false;
    }
    return true;
  }

  /**
   * Caret sitting in the padding just after an inline mark. Typing there still lands inside it.
   * @param {Range} range
   * @returns {HTMLElement | null}
   */
  function markSwallowedAfter(range) {
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      return null;
    }
    const prev = elementImmediatelyBefore(range);
    if (!prev || !isFormattingHost(prev)) {
      return null;
    }
    const text = plainTextFromNode(prev).replace(/\u200B/g, '').replace(/\n+$/g, '');
    return isPlainSpace(text[text.length - 1] || '') ? prev : null;
  }

  /**
   * @param {Range} range
   * @returns {HTMLElement | null}
   */
  function elementImmediatelyBefore(range) {
    const node = range.startContainer;
    if (node.nodeType !== Node.ELEMENT_NODE || range.startOffset <= 0) {
      return null;
    }
    let prev = node.childNodes[range.startOffset - 1] || null;
    while (prev && prev.nodeType === Node.TEXT_NODE && !(prev.textContent || '').replace(/\u200B/g, '')) {
      prev = prev.previousSibling;
    }
    return prev instanceof HTMLElement && prev.tagName !== 'BR' ? prev : null;
  }

  /** @param {HTMLElement} el */
  function isFormattingHost(el) {
    return isQuoteEl(el) || isBoldEl(el) || isColorEl(el);
  }

  /**
   * Pad so the next typed character stays outside a padded inline mark.
   * A caret placed with setStartAfter is still "inside" for Chromium when the span has padding.
   * @param {HTMLElement} mark
   */
  function parkCaretAfter(mark) {
    const sel = window.getSelection();
    if (!sel || !mark.isConnected) {
      return;
    }
    let next = mark.nextSibling;
    if (!(next && next.nodeType === Node.TEXT_NODE && (next.textContent || '').startsWith('\u200B'))) {
      const holder = document.createTextNode('\u200B');
      mark.after(holder);
      next = holder;
    }
    const caret = document.createRange();
    caret.setStart(next, 1);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
  }

  /**
   * Quote involved in this exit, if the trailing space belongs to one.
   * @param {Range} range
   * @param {HTMLElement | null} outer
   * @returns {HTMLElement | null}
   */
  function quoteMarkForExit(range, outer) {
    const inside = closestMark(range.startContainer, isQuoteEl);
    if (inside) {
      return inside;
    }
    if (!outer) {
      return null;
    }
    if (isQuoteEl(outer)) {
      return outer;
    }
    const nested = outer.querySelector('.note-quote');
    return nested instanceof HTMLElement ? nested : null;
  }

  /**
   * The first space only signaled "leave the quote". Drop that one character.
   * @param {HTMLElement} root
   */
  function stripOneTrailingSpace(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    /** @type {Text[]} */
    const texts = [];
    /** @type {Node | null} */
    let current = walker.nextNode();
    while (current) {
      texts.push(/** @type {Text} */ (current));
      current = walker.nextNode();
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const text = texts[i];
      const value = text.textContent || '';
      let end = value.length;
      while (end > 0 && value[end - 1] === '\u200B') {
        end -= 1;
      }
      if (end === 0) {
        continue;
      }
      if (!isPlainSpace(value[end - 1] || '')) {
        return;
      }
      const caretInside = !!root.contains(window.getSelection()?.anchorNode || null);
      text.textContent = value.slice(0, end - 1) + value.slice(end);
      if (caretInside) {
        const sel = window.getSelection();
        const caret = document.createRange();
        caret.setStart(text, Math.min(end - 1, text.length));
        caret.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(caret);
      }
      return;
    }
  }

  /** @param {HTMLElement} mark */
  function removeMarkIfNoText(mark) {
    if (!mark.isConnected) {
      return;
    }
    if ((mark.textContent || '').replace(/\u200B/g, '') || mark.querySelector('img, a')) {
      return;
    }
    const parent = mark.parentNode;
    if (!parent) {
      return;
    }
    const next = mark.nextSibling;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    mark.remove();
    const sel = window.getSelection();
    const caret = document.createRange();
    if (next && next.parentNode) {
      caret.setStartBefore(next);
    } else {
      caret.setStart(parent, parent.childNodes.length);
    }
    caret.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(caret);
  }

  /** Drop bold, color, and quote around the caret. A quote exit also drops the signaling space. */
  function leaveBoldAndColor() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      return;
    }
    const range = sel.getRangeAt(0);
    /** @type {HTMLElement | null} */
    let outer = markSwallowedAfter(range);
    if (!outer) {
      const quote = closestMark(range.startContainer, isQuoteEl);
      const color = closestMark(range.startContainer, isColorEl);
      const bold = closestMark(range.startContainer, isBoldEl);
      /** @type {HTMLElement[]} */
      const found = [];
      if (quote) {
        found.push(quote);
      }
      if (color) {
        found.push(color);
      }
      if (bold) {
        found.push(bold);
      }
      if (found.length) {
        outer = found[0];
        for (const mark of found) {
          if (mark.contains(outer)) {
            outer = mark;
          }
        }
      }
    }
    if (!outer) {
      return;
    }
    const quote = quoteMarkForExit(range, outer);
    if (quote) {
      stripOneTrailingSpace(quote);
      removeMarkIfNoText(quote);
    }
    const live = window.getSelection()?.getRangeAt(0) || range;
    if (outer.isConnected && outer.contains(live.startContainer)) {
      for (let step = 0; step < 4; step++) {
        const node = window.getSelection()?.anchorNode || null;
        if (!node || !outer.contains(node)) {
          break;
        }
        const quote = closestMark(node, isQuoteEl);
        const color = closestMark(node, isColorEl);
        const bold = closestMark(node, isBoldEl);
        /** @type {HTMLElement[]} */
        const marks = [];
        if (quote) {
          marks.push(quote);
        }
        if (color) {
          marks.push(color);
        }
        if (bold) {
          marks.push(bold);
        }
        if (!marks.length) {
          break;
        }
        let inner = marks[0];
        for (const mark of marks) {
          if (inner.contains(mark)) {
            inner = mark;
          }
        }
        if (isQuoteEl(inner)) {
          peelCollapsedMark(isQuoteEl);
        } else if (isColorEl(inner)) {
          peelCollapsedMark(isColorEl);
        } else {
          peelCollapsedMark(isBoldEl);
        }
      }
    }
    parkCaretAfter(outer);
  }

  /**
   * Arrow at a bold/color edge inserts one plain space and leaves that mark.
   * @param {'left' | 'right'} direction
   * @returns {boolean}
   */
  function exitMarkEdge(direction) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) {
      return false;
    }
    const range = sel.getRangeAt(0);
    if (closestMark(range.startContainer, (el) => el.classList.contains('note-code'))) {
      return false;
    }
    const side = direction === 'right' ? 'end' : 'start';
    const bold = markAtEdge(range, side, isBoldEl);
    const color = markAtEdge(range, side, isColorEl);
    /** @type {HTMLElement[]} */
    const exits = [];
    if (bold) {
      exits.push(bold);
    }
    if (color) {
      exits.push(color);
    }
    if (!exits.length) {
      return false;
    }
    let outer = exits[0];
    for (const mark of exits) {
      if (mark.contains(outer)) {
        outer = mark;
      }
    }
    const space = document.createTextNode(' ');
    if (direction === 'right') {
      outer.after(space);
    } else {
      outer.before(space);
    }
    const caret = document.createRange();
    if (direction === 'right') {
      caret.setStartAfter(space);
    } else {
      caret.setStartBefore(space);
    }
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    pendingNoteMarks.bold = null;
    pendingNoteMarks.color = null;
    return true;
  }

  /** @param {HTMLElement} link */
  function visibleLinkLabel(link) {
    return (link.textContent || '').replace(/\u200B/g, '');
  }

  /**
   * @param {HTMLAnchorElement} link
   */
  function setEmptyLinkCaret(link) {
    link.textContent = '\u200B';
    const caret = document.createRange();
    caret.selectNodeContents(link);
    caret.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(caret);
  }

  /**
   * @param {HTMLAnchorElement} link
   */
  function removeLinkKeepCaret(link) {
    const parent = link.parentNode;
    if (!parent) {
      return;
    }
    const index = Array.from(parent.childNodes).indexOf(link);
    link.remove();
    const caret = document.createRange();
    caret.setStart(parent, Math.max(0, index));
    caret.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(caret);
  }

  /**
   * @param {Node} node
   * @param {number} offset
   * @returns {Node | null}
   */
  function nodeBeforeCaret(node, offset) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.slice(0, offset).replace(/\u200B/g, '').length > 0) {
        return null;
      }
      return node.previousSibling || elementBefore(node);
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = /** @type {HTMLElement} */ (node);
      if (offset > 0) {
        return el.childNodes[offset - 1] || null;
      }
      return elementBefore(el);
    }
    return null;
  }

  /**
   * @param {Node} node
   * @returns {Node | null}
   */
  function elementBefore(node) {
    if (node.previousSibling) {
      return node.previousSibling;
    }
    const parent = node.parentElement;
    if (!parent || parent.classList.contains('note-input') || parent.classList.contains('note-p') || parent.classList.contains('note-code')) {
      return null;
    }
    return parent.previousSibling;
  }

  /**
   * @param {Node | null} node
   * @returns {HTMLAnchorElement | null}
   */
  function linkWalkingBack(node) {
    let current = node;
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        if ((current.textContent || '').replace(/\u200B/g, '').length > 0) {
          return null;
        }
      } else if (current instanceof HTMLAnchorElement && current.classList.contains('note-link')) {
        return current;
      } else if (current instanceof HTMLElement) {
        if (current.classList.contains('note-p') || current.classList.contains('note-code') || current.classList.contains('note-input')) {
          return null;
        }
        if (current.lastChild) {
          const inner = linkWalkingBack(current.lastChild);
          if (inner || (current.textContent || '').replace(/\u200B/g, '').length > 0) {
            return inner;
          }
        }
      }
      current = current.previousSibling;
    }
    return null;
  }

  /**
   * @param {Range} range
   * @returns {HTMLAnchorElement | null}
   */
  function linkImmediatelyBeforeCaret(range) {
    if (!range.collapsed) {
      return null;
    }
    return linkWalkingBack(nodeBeforeCaret(range.startContainer, range.startOffset));
  }

  /**
   * @param {HTMLAnchorElement} link
   * @param {Range} range
   */
  function caretDeletesLastLinkChar(link, range) {
    const label = visibleLinkLabel(link);
    if (label.length !== 1 || !range.collapsed || !link.contains(range.startContainer)) {
      return false;
    }
    const before = document.createRange();
    before.selectNodeContents(link);
    try {
      before.setEnd(range.startContainer, range.startOffset);
    } catch {
      return false;
    }
    return before.toString().replace(/\u200B/g, '').length === 1;
  }

  /**
   * @param {string} label
   * @param {string} href
   * @returns {HTMLAnchorElement}
   */
  function makeNoteLink(label, href) {
    const link = document.createElement('a');
    link.className = 'note-link';
    link.setAttribute('href', href);
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    markBrokenEntityLink(link, href);
    return link;
  }

  /**
   * Turn finished markdown / delimited bare URLs in the editing field into chips.
   * A bare URL the caret is still sitting on stays plain so the address can be typed.
   * @param {HTMLElement} input
   */
  function linkifyNoteField(input) {
    if (linkifyBusy || !input.classList.contains('is-editing')) {
      return;
    }
    linkifyBusy = true;
    /** @type {HTMLElement | null} */
    let marker = null;
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && sel.isCollapsed && input.contains(sel.anchorNode)) {
        marker = document.createElement('span');
        marker.dataset.caret = '1';
        sel.getRangeAt(0).insertNode(marker);
      }
      /** @type {Text[]} */
      const nodes = [];
      const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
      /** @type {Node | null} */
      let current = walker.nextNode();
      while (current) {
        const text = /** @type {Text} */ (current);
        current = walker.nextNode();
        if (text.parentElement?.closest('a, .note-code, [data-caret]')) {
          continue;
        }
        nodes.push(text);
      }
      for (const textNode of nodes) {
        linkifyTextNode(textNode);
      }
    } finally {
      if (marker && marker.isConnected) {
        const caret = document.createRange();
        caret.setStartAfter(marker);
        caret.collapse(true);
        const live = window.getSelection();
        live?.removeAllRanges();
        live?.addRange(caret);
        marker.remove();
        rememberMarkCaret();
      }
      linkifyBusy = false;
    }
  }

  /**
   * @param {Text} textNode
   */
  function linkifyTextNode(textNode) {
    if (!textNode.isConnected) {
      return;
    }
    const text = textNode.textContent || '';
    const pattern = new RegExp(NOTE_LINK_RE.source, 'g');
    /** @type {RegExpExecArray[]} */
    const matches = [];
    let match;
    while ((match = pattern.exec(text))) {
      const isMarkdown = !!(match[1] && match[2]);
      const end = match.index + match[0].length;
      if (!isMarkdown) {
        const next = text[end];
        if (next && /\s/.test(next)) {
          matches.push(match);
        } else if (end < text.length) {
          matches.push(match);
        } else if (!(textNode.nextSibling instanceof HTMLElement && textNode.nextSibling.dataset.caret === '1')) {
          matches.push(match);
        }
      } else {
        matches.push(match);
      }
    }
    if (!matches.length) {
      return;
    }
    let node = textNode;
    for (let i = matches.length - 1; i >= 0; i--) {
      const item = matches[i];
      if (!node.isConnected) {
        return;
      }
      const start = item.index;
      const end = item.index + item[0].length;
      if (end > (node.textContent || '').length) {
        return;
      }
      const label = item[1] || item[3] || '';
      const href = item[2] || item[3] || '';
      if (!label || !href) {
        continue;
      }
      const tail = node.splitText(end);
      const head = node;
      const matched = head.splitText(start);
      matched.replaceWith(makeNoteLink(label, href));
      node = head;
      void tail;
    }
  }

  /**
   * @param {KeyboardEvent} event
   * @param {HTMLElement} input
   * @returns {boolean}
   */
  function handleNoteMarkKey(event, input) {
    if (event.isComposing || event.altKey || event.metaKey || event.ctrlKey) {
      return false;
    }
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !input.contains(sel.anchorNode)) {
      return false;
    }
    const range = sel.getRangeAt(0);
    if (event.key === 'Backspace') {
      if (!range.collapsed) {
        const host =
          range.startContainer.nodeType === Node.ELEMENT_NODE
            ? /** @type {HTMLElement} */ (range.startContainer)
            : range.startContainer.parentElement;
        const link = host?.closest('a.note-link');
        if (
          link instanceof HTMLAnchorElement &&
          input.contains(link) &&
          link.contains(range.endContainer) &&
          plainTextFromRange(range).replace(/\u200B/g, '') === visibleLinkLabel(link) &&
          visibleLinkLabel(link)
        ) {
          event.preventDefault();
          setEmptyLinkCaret(link);
          return true;
        }
        return false;
      }
      const inside = elementFromNode(range.startContainer)?.closest('a.note-link');
      if (inside instanceof HTMLAnchorElement && input.contains(inside)) {
        const label = visibleLinkLabel(inside);
        if (!label) {
          event.preventDefault();
          removeLinkKeepCaret(inside);
          return true;
        }
        if (caretDeletesLastLinkChar(inside, range)) {
          event.preventDefault();
          setEmptyLinkCaret(inside);
          return true;
        }
        return false;
      }
      const before = linkImmediatelyBeforeCaret(range);
      if (before && input.contains(before)) {
        event.preventDefault();
        removeLinkKeepCaret(before);
        return true;
      }
      return false;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return false;
    }
    if (!range.collapsed || event.shiftKey) {
      return false;
    }
    const exited = exitMarkEdge(event.key === 'ArrowRight' ? 'right' : 'left');
    if (!exited) {
      return false;
    }
    event.preventDefault();
    rememberMarkCaret();
    updateFormatMenuState();
    return true;
  }

  function applyTextColor(color) {
    if (!activeNoteEdit) {
      return;
    }
    formattingReleased = false;
    const hex = normalizeHex(color) || color;
    if (liveTextColorSpans && liveTextColorSpans.length) {
      for (const span of liveTextColorSpans) {
        if (span.isConnected) {
          setNoteColor(span, hex);
        }
      }
      return;
    }
    restoreNoteSelection({ silent: true });
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
      pendingNoteMarks.color = hex;
      rememberMarkCaret();
      return;
    }
    markSyncDepth += 1;
    try {
      liveTextColorSpans = applyColorToRange(sel.getRangeAt(0), hex);
    } finally {
      markSyncDepth -= 1;
    }
    pendingNoteMarks.color = null;
    rememberMarkCaret();
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
    liveTextColorSpans = null;
    const at = marksAtCaret();
    const current = pendingNoteMarks.color || at.color || '#4daafc';
    openColorsPanel({
      kind: 'text',
      currentHex: current,
      allowNone: false,
    });
  }

  /**
   * @param {HTMLElement} link Anchor in a note, or a chip with `data-preview-url`.
   */
  function dismissLinkPreview() {
    linkPreviewGen += 1;
    if (linkPreviewHideTimer) {
      clearTimeout(linkPreviewHideTimer);
      linkPreviewHideTimer = null;
    }
    hideLinkPreview();
  }

  function showLinkPreview(link) {
    if (!link.isConnected) {
      return;
    }
    if (linkPreviewHideTimer) {
      clearTimeout(linkPreviewHideTimer);
      linkPreviewHideTimer = null;
    }
    const url = link instanceof HTMLAnchorElement ? link.href : link.dataset.previewUrl || '';
    if (!url || (!figmaLinkPreviewEnabled && isFigmaPreviewUrl(url))) {
      return;
    }
    linkPreviewUrl = url;
    linkPreviewShownGen = linkPreviewGen;
    ensureLinkPreviewEl();
    if (!linkPreviewEl) {
      return;
    }
    const fromChip = !(link instanceof HTMLAnchorElement);
    const figma = isFigmaPreviewUrl(url);
    const narrow = window.innerWidth < 100;
    linkPreviewEl.classList.toggle('is-narrow', narrow);
    linkPreviewEl.classList.toggle('is-link-chip', fromChip);
    linkPreviewEl.classList.toggle('is-figma', figma);
    linkPreviewEl.style.width = figma ? `${Math.round(figmaPreviewWidth())}px` : '';
    const rect = link.getBoundingClientRect();
    const limit = figma
      ? figmaPreviewHeight()
      : fromChip
        ? Math.min(260, window.innerHeight - 16)
        : 128;
    linkPreviewEl.style.top = Math.max(8, Math.min(window.innerHeight - limit, rect.bottom + 4)) + 'px';
    linkPreviewEl.hidden = false;
    const scroll = /** @type {HTMLElement} */ (linkPreviewEl.querySelector('.note-link-preview-scroll'));
    scroll.replaceChildren(buildLinkPreviewSkeleton(figma));
    updateLinkPreviewScrollbar();
    const requestId = String(++linkPreviewRequest);
    linkPreviewPendingId = requestId;
    if (linkPreviewLoaderEl) {
      linkPreviewLoaderRequestId = requestId;
    }
    vscode.postMessage({ type: 'previewLink', url, requestId });
  }

  function scheduleHideLinkPreview() {
    const gen = linkPreviewGen;
    if (linkPreviewHideTimer) {
      clearTimeout(linkPreviewHideTimer);
    }
    linkPreviewHideTimer = setTimeout(() => {
      linkPreviewHideTimer = null;
      if (gen !== linkPreviewGen) {
        return;
      }
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
    const preview = el('div', 'note-link-preview');
    linkPreviewEl = preview;
    preview.hidden = true;
    const scroll = el('div', 'note-link-preview-scroll');
    const bar = el('div', 'note-link-preview-bar');
    bar.hidden = true;
    const thumb = el('div', 'note-link-preview-thumb');
    bar.append(thumb);
    preview.append(scroll, bar);
    preview.addEventListener('mouseenter', () => {
      if (linkPreviewHideTimer) {
        clearTimeout(linkPreviewHideTimer);
        linkPreviewHideTimer = null;
      }
    });
    preview.addEventListener('mouseleave', () => {
      if (preview.hidden || linkPreviewShownGen !== linkPreviewGen || linkPreviewPanning) {
        return;
      }
      scheduleHideLinkPreview();
    });
    scroll.addEventListener('scroll', updateLinkPreviewScrollbar, { passive: true });
    document.body.append(linkPreviewEl);
  }

  /**
   * @param {HTMLElement} loader
   */
  function armLinkPreviewLoader(loader) {
    if (linkPreviewLoaderEl === loader) {
      return;
    }
    clearLinkPreviewLoader();
    linkPreviewLoaderRequestId = null;
    linkPreviewLoaderEl = loader;
    linkPreviewLoaderTimer = window.setTimeout(() => {
      linkPreviewLoaderTimer = 0;
      if (linkPreviewLoaderEl !== loader || !loader.isConnected) {
        return;
      }
      loader.replaceChildren(reviewProgressIcon());
      loader.hidden = false;
    }, 180);
  }

  /** @param {HTMLElement} [only] */
  function clearLinkPreviewLoader(only) {
    if (only && linkPreviewLoaderEl && linkPreviewLoaderEl !== only) {
      return;
    }
    if (linkPreviewLoaderTimer) {
      window.clearTimeout(linkPreviewLoaderTimer);
      linkPreviewLoaderTimer = 0;
    }
    if (linkPreviewLoaderEl) {
      linkPreviewLoaderEl.hidden = true;
      linkPreviewLoaderEl.replaceChildren();
      linkPreviewLoaderEl = null;
    }
    linkPreviewLoaderRequestId = null;
  }

  /** 16:9 card: full webview width, never wider than 600px or taller than the webview. */
  function figmaPreviewWidth() {
    const byWidth = Math.min(600, Math.max(120, window.innerWidth - 16));
    const byHeight = Math.max(120, ((window.innerHeight - 16) * 16) / 9);
    return Math.min(byWidth, byHeight);
  }

  function figmaPreviewHeight() {
    return (figmaPreviewWidth() * 9) / 16;
  }

  /**
   * Fit a frame into the 16:9 card.
   * A wider frame shows whole. A taller frame opens on the top, centered:
   * the upper half covers the card when that half is wide enough, otherwise
   * the top band that fills the card width.
   * @param {number} iw
   * @param {number} ih
   * @param {number} width
   * @param {number} height
   */
  function figmaPreviewFit(iw, ih, width, height) {
    const contain = Math.min(width / iw, height / ih);
    const topHalf = Math.max(width / iw, height / (ih * 0.5));
    const tall = ih / iw > height / width;
    const scale = tall ? topHalf : contain;
    return clampFigmaPreviewPan(
      {
        iw,
        ih,
        scale,
        x: (width - iw * scale) / 2,
        y: tall ? 0 : (height - ih * scale) / 2,
        min: contain,
        max: Math.max(scale, contain * 12, 1),
      },
      width,
      height,
    );
  }

  /**
   * @param {{ iw: number, ih: number, scale: number, x: number, y: number, min: number, max: number }} view
   * @param {number} width
   * @param {number} height
   */
  function clampFigmaPreviewPan(view, width, height) {
    const dw = view.iw * view.scale;
    const dh = view.ih * view.scale;
    let x = view.x;
    let y = view.y;
    if (dw <= width + 0.5) {
      x = (width - dw) / 2;
    } else {
      x = Math.min(0, Math.max(width - dw, x));
    }
    if (dh <= height + 0.5) {
      y = (height - dh) / 2;
    } else {
      y = Math.min(0, Math.max(height - dh, y));
    }
    return { ...view, x, y };
  }

  /**
   * Wheel zooms toward the cursor. A held button pans the frame.
   * @param {HTMLElement} screen
   * @param {HTMLImageElement} img
   */
  function bindFigmaPreviewScreen(screen, img) {
    /** @type {{ iw: number, ih: number, scale: number, x: number, y: number, min: number, max: number } | null} */
    let view = null;
    const apply = () => {
      if (!view) {
        return;
      }
      img.style.width = `${view.iw}px`;
      img.style.height = `${view.ih}px`;
      img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    };
    const fit = () => {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const width = screen.clientWidth;
      const height = screen.clientHeight;
      if (!iw || !ih || width < 2 || height < 2) {
        return;
      }
      view = figmaPreviewFit(iw, ih, width, height);
      apply();
    };
    const ready = () => {
      requestAnimationFrame(() => {
        fit();
        if (!view) {
          requestAnimationFrame(fit);
        }
      });
    };
    img.draggable = false;
    if (img.complete && img.naturalWidth) {
      ready();
    } else {
      img.addEventListener('load', ready, { once: true });
    }
    screen.addEventListener(
      'wheel',
      (event) => {
        if (!view) {
          return;
        }
        event.preventDefault();
        const width = screen.clientWidth;
        const height = screen.clientHeight;
        const rect = screen.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
        const next = view.scale * Math.exp(-event.deltaY * unit * 0.0016);
        const scale = Math.min(view.max, Math.max(view.min, next));
        const k = scale / view.scale;
        view = clampFigmaPreviewPan(
          {
            ...view,
            scale,
            x: mx - (mx - view.x) * k,
            y: my - (my - view.y) * k,
          },
          width,
          height,
        );
        apply();
      },
      { passive: false },
    );
    screen.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !view || linkPreviewPanning) {
        return;
      }
      event.preventDefault();
      screen.setPointerCapture(event.pointerId);
      screen.classList.add('is-panning');
      linkPreviewPanning = true;
      if (linkPreviewHideTimer) {
        clearTimeout(linkPreviewHideTimer);
        linkPreviewHideTimer = null;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = view.x;
      const originY = view.y;
      const move = (ev) => {
        if (!view) {
          return;
        }
        view = clampFigmaPreviewPan(
          {
            ...view,
            x: originX + (ev.clientX - startX),
            y: originY + (ev.clientY - startY),
          },
          screen.clientWidth,
          screen.clientHeight,
        );
        apply();
      };
      const up = () => {
        screen.removeEventListener('pointermove', move);
        screen.removeEventListener('pointerup', up);
        screen.removeEventListener('pointercancel', up);
        screen.classList.remove('is-panning');
        linkPreviewPanning = false;
        requestAnimationFrame(() => {
          const preview = linkPreviewEl;
          if (!preview || preview.hidden || linkPreviewPanning) {
            return;
          }
          if (!preview.matches(':hover')) {
            scheduleHideLinkPreview();
          }
        });
      };
      screen.addEventListener('pointermove', move);
      screen.addEventListener('pointerup', up);
      screen.addEventListener('pointercancel', up);
    });
  }

  /** @param {string} url */
  function isFigmaPreviewUrl(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === 'figma.com' || host.endsWith('.figma.com');
    } catch {
      return false;
    }
  }

  /** @param {boolean} [figma] */
  function buildLinkPreviewSkeleton(figma) {
    const frag = document.createDocumentFragment();
    frag.append(el('div', 'note-link-preview-skel-image' + (figma ? ' is-screen' : '')));
    if (!figma) {
      const lines = el('div', 'note-link-preview-skel-lines');
      lines.append(el('div', 'note-link-preview-skel-line'), el('div', 'note-link-preview-skel-line'));
      frag.append(lines);
    }
    return frag;
  }

  /**
   * @param {{ requestId: string, url: string, image?: string, description?: string, empty?: boolean }} message
   */
  function onPreviewLinkResult(message) {
    if (linkPreviewLoaderRequestId && message.requestId === linkPreviewLoaderRequestId) {
      clearLinkPreviewLoader();
    }
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
      if (linkPreviewEl.classList.contains('is-figma')) {
        img.classList.add('is-screen');
        const screen = el('div', 'note-link-preview-screen');
        screen.append(img);
        scroll.append(screen);
        bindFigmaPreviewScreen(screen, img);
      } else {
        scroll.append(img);
      }
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
    if (parseEntityLink(trimmed)) {
      return true;
    }
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
    const isWorking = data?.focus?.kind === 'note' && data?.focus?.id === note.id;
    const section = el(
      'section',
      'group note-card' +
        (collapsed ? ' collapsed' : '') +
        (locked ? ' locked' : '') +
        (nested ? ' nested node' : '') +
        (isWorking ? ' is-working' : ''),
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
      openColorsPanel({
        kind: 'note',
        id: note.id,
        currentHex: note.color || toHex(getComputedStyle(bar).backgroundColor) || '',
        allowNone: true,
      });
    });
    header.append(bar);
    const noteIcons = Array.isArray(note.icons) ? note.icons : [];
    header.append(
      typeIconEl('note', {
        locked,
        badgeCount: noteIcons.length,
        onAdd: () => {
          vscode.postMessage({
            type: 'runCommand',
            command: 'syn3.addIcon',
            arg: { noteId: note.id },
          });
        },
        onLocked: () => flashLock(note.id, header),
      }),
    );
    if (noteIcons.length > 0) {
      header.classList.add('has-note-badges');
    }
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
      if (handleNoteMarkKey(event, input)) {
        refreshNoteEmptyClass(input);
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
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed) {
        return;
      }
      if (closestNoteCode(sel.anchorNode)) {
        return;
      }
      if (event.data === ' ' && secondSpaceLeavesFormatting()) {
        event.preventDefault();
        markSyncDepth += 1;
        try {
          leaveBoldAndColor();
          formattingReleased = true;
          pendingNoteMarks.bold = null;
          pendingNoteMarks.color = null;
          pendingNoteMarks.quote = false;
        } finally {
          markSyncDepth -= 1;
        }
        rememberMarkCaret();
        updateFormatMenuState();
        return;
      }
      const have = marksAtCaret();
      const want = wantedMarks();
      if (want.bold === have.bold && (want.color || null) === (have.color || null) && want.quote === have.quote) {
        return;
      }
      event.preventDefault();
      markSyncDepth += 1;
      try {
        insertMarkedText(event.data, want);
      } finally {
        markSyncDepth -= 1;
      }
      linkifyNoteField(input);
      refreshNoteEmptyClass(input);
      rememberMarkCaret();
    });
    input.addEventListener('input', () => {
      if (activeNoteEdit?.input === input) {
        linkifyNoteField(input);
      }
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
      if (notePressWasDrag) {
        return;
      }
      if (locked) {
        flashLock(note.id, header);
        return;
      }
      if (event.target instanceof Element && event.target.closest('a.note-link')) {
        event.preventDefault();
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
    if (noteIcons.length > 0) {
      field.append(
        badgeIconsEl(noteIcons, {
          locked,
          onChange: (index) => {
            vscode.postMessage({
              type: 'runCommand',
              command: 'syn3.removeIcon',
              arg: { noteId: note.id, index },
            });
          },
          onLocked: () => flashLock(note.id, header),
        }),
      );
    }
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
      if (
        target instanceof Element &&
        (target.closest('.note-input') ||
          target.closest('.bar') ||
          target.closest('.type-icon') ||
          target.closest('.badge-icons'))
      ) {
        return;
      }
      if (!canFold) {
        return;
      }
      toggleCollapsed(note.id);
    });
    if (canFold) {
      attachFoldRail(section, note.id, header, locked);
    }
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
    appendNameSlots(textWrap, 'name', name, item.alias);
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
    appendNameSlots(textWrap, 'name', cls.name, cls.alias);
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
    let pressAt = 0;
    let x = 0;
    let y = 0;
    /** Squared pointer travel. dragstart coordinates are not trustworthy. */
    let travel = 0;

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
      pressAt = Date.now();
      moved = false;
      dragged = false;
      activated = false;
      travel = 0;
      x = event.clientX;
      y = event.clientY;
    });

    node.addEventListener('pointermove', (event) => {
      if (!tracking || event.buttons === 0) {
        return;
      }
      const dx = event.clientX - x;
      const dy = event.clientY - y;
      const dist = dx * dx + dy * dy;
      if (dist > travel) {
        travel = dist;
      }
      // A 1px slip on a draggable header used to cancel the fold.
      if (!moved && dist >= 36) {
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
      // Focus moving into the webview cancels the pointer, then still delivers
      // click. Leave pressStarted so that click can activate.
      tracking = false;
    });

    node.addEventListener(
      'dragstart',
      (event) => {
        const dx = event.clientX - x;
        const dy = event.clientY - y;
        // dragstart clientX/clientY stay on the press point (or are 0) in the
        // webview, so a real move looked like no move and the header never grabbed.
        // Trust pointer travel. A focus-click still fires dragstart with none.
        const reported = dx * dx + dy * dy;
        const coordsLive = event.clientX !== 0 || event.clientY !== 0;
        if (travel < 4 && !(coordsLive && reported >= 4)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        // Browser fires dragstart once; cancelling it here used to kill header
        // drags before the 6px click threshold. Mark the gesture so pointerup
        // does not fold, and let the element's own dragstart call beginDrag.
        dragged = true;
        moved = true;
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
      if (!pressStarted || Date.now() - pressAt > 600) {
        pressStarted = false;
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
      (locked ? '\nLocked' : '\n' + t('dragHint'));
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
        { kind: 'item', relPath: item.relPath, from: groupId, isDir: !!item.isDir },
        'move',
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
    if (problemPanelState && dirPopover.contains(problemPanelState.anchor)) {
      closeProblemPanel();
    }
    dirPopoverState = null;
    dirPopover.hidden = true;
    dirPopover.classList.remove('loading');
    dirPopover.replaceChildren();
  }

  function fillDirPopover(message) {
    if (problemPanelState && dirPopover.contains(problemPanelState.anchor)) {
      closeProblemPanel();
    }
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
      row.dataset.rel = entry.relPath || '';
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
    applyDirPopoverChangeMarks();
    applyProblemMarks();
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
      (locked ? '\nLocked' : '\n' + t('dragHint'));
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
        'move',
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
      applyDecision(event, section, header, group, decision, payload);
    });

    section.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = readPayload(event);
      const decision = decideDrop(event, section, group, payload);
      const slot = dropSlotState && dropSlotState.groupId === group.id ? { ...dropSlotState } : null;
      clearDropHighlights();
      hideDropHint();
      clearExpandForDrop();
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
        handleItemOrExternalDrop(event, group, payload, slot);
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
      if (payload && (payload.kind === 'item' || payload.kind === 'class') && isLocked(payload.from)) {
        return {
          action: 'item',
          mode: 'blocked',
          hint: 'Group is locked',
          blocked: true,
        };
      }
      return {
        action: 'item',
        mode: 'target',
        hint: '→ "' + group.label + '"',
        chip: !!(payload && (payload.kind === 'item' || payload.kind === 'class')),
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

  /**
   * @param {DragEvent} event
   * @param {HTMLElement} section
   * @param {HTMLElement} header
   * @param {*} group
   * @param {*} decision
   * @param {*} [payload]
   */
  function applyDecision(event, section, header, group, decision, payload) {
    moveDropHint(event.clientX, event.clientY);
    if (!decision) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
      clearDropHighlights();
      clearExpandForDrop();
      showDropHint('', true);
      return;
    }
    if (decision.blocked) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
      clearDropSlot();
      clearExpandForDrop();
      setDropHighlight(section, 'blocked', header);
      showDropHint(decision.hint, true);
      return;
    }
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    setDropHighlight(section, decision.mode, header);
    showDropHint(decision.hint, false);

    if (decision.action === 'item') {
      if (isCollapsed(group.id)) {
        scheduleExpandForDrop(group.id);
        clearDropSlot();
      } else if (decision.chip && payload) {
        clearExpandForDrop();
        const slot = computeChipSlot(event, section, group, payload);
        if (slot) {
          ensureDropSlot(section, group, slot.blockKind, slot.index, payload);
        } else {
          clearDropSlot();
        }
      } else {
        clearExpandForDrop();
        clearDropSlot();
      }
    } else {
      clearDropSlot();
      clearExpandForDrop();
    }
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
    clearExpandForDrop();
    hideDropHint();
    hideLinkTail();
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

  /**
   * @param {DragEvent} event
   * @param {*} group
   * @param {*} payload
   * @param {{ groupId: string, blockKind: string, index: number } | null} slot
   */
  function handleItemOrExternalDrop(event, group, payload, slot) {
    const to = group.id;
    if (payload && (payload.kind === 'item' || payload.kind === 'class')) {
      const blockKind =
        (slot && slot.blockKind) ||
        chipBlockKind(payload);
      const index = slot ? slot.index : blockLength(group, blockKind);
      const pending = {
        kind: payload.kind,
        relPath: payload.relPath,
        classId: payload.classId,
        from: payload.from,
        to,
        isDir: !!payload.isDir,
        blockKind,
        index,
      };
      if (payload.from === to) {
        commitChipDrop(pending, false);
        return;
      }
      if (chipAlreadyInGroup(payload, group)) {
        openDropExistsDialog();
        return;
      }
      openDropChooseDialog(pending);
      return;
    }
    const uris = readUris(event);
    if (uris.length > 0) {
      vscode.postMessage({ type: 'dropUris', uris, to });
    }
  }

  /** @param {*} payload */
  function chipBlockKind(payload) {
    if (payload.kind === 'class') {
      return 'classes';
    }
    return payload.isDir ? 'dirs' : 'files';
  }

  /** @param {*} payload @param {*} group */
  function chipAlreadyInGroup(payload, group) {
    if (payload.kind === 'class') {
      return (group.classes || []).some((cls) => cls.id === payload.classId);
    }
    return (group.items || []).some((item) => item.relPath === payload.relPath);
  }

  /** @param {*} group @param {string} blockKind */
  function blockIds(group, blockKind) {
    if (blockKind === 'dirs') {
      return (group.items || []).filter((item) => item.isDir).map((item) => item.relPath);
    }
    if (blockKind === 'files') {
      return (group.items || []).filter((item) => !item.isDir).map((item) => item.relPath);
    }
    return (group.classes || []).map((cls) => cls.id);
  }

  /** @param {*} group @param {string} blockKind */
  function blockLength(group, blockKind) {
    return blockIds(group, blockKind).length;
  }

  /** @param {*} pending */
  function buildBlockOrder(pending) {
    const group = (data?.groups || []).find((g) => g.id === pending.to);
    if (!group) {
      return [];
    }
    const dragKey = pending.kind === 'class' ? pending.classId : pending.relPath;
    const list = blockIds(group, pending.blockKind).filter((id) => id !== dragKey);
    const at = Math.max(0, Math.min(pending.index, list.length));
    list.splice(at, 0, dragKey);
    return list;
  }

  /**
   * @param {*} pending
   * @param {boolean} copy
   */
  function commitChipDrop(pending, copy) {
    const blockOrder = buildBlockOrder(pending);
    if (pending.kind === 'class') {
      vscode.postMessage({
        type: 'moveClass',
        classId: pending.classId,
        from: pending.from,
        to: pending.to,
        copy,
        blockOrder,
      });
      return;
    }
    vscode.postMessage({
      type: 'moveItem',
      relPath: pending.relPath,
      from: pending.from,
      to: pending.to,
      copy,
      blockOrder,
    });
  }

  /**
   * Insert index for a chip over a group card.
   * @param {DragEvent} event
   * @param {HTMLElement} section
   * @param {*} group
   * @param {*} payload
   * @returns {{ blockKind: string, index: number } | null}
   */
  function computeChipSlot(event, section, group, payload) {
    const blockKind = chipBlockKind(payload);
    const dragKey = payload.kind === 'class' ? payload.classId : payload.relPath;
    const fromSame = payload.from === group.id;
    const without = blockIds(group, blockKind).filter((id) => !(fromSame && id === dragKey));

    const children = section.querySelector(':scope > .children');
    const ownBlock =
      children instanceof HTMLElement
        ? children.querySelector(':scope > .block-' + blockKind)
        : null;

    if (ownBlock instanceof HTMLElement) {
      const items = [...ownBlock.querySelectorAll(':scope > .item:not(.drop-slot)')].filter(
        (node) => {
          if (!(node instanceof HTMLElement)) {
            return false;
          }
          if (!fromSame) {
            return true;
          }
          if (payload.kind === 'class') {
            return node.dataset.classId !== dragKey;
          }
          return node.dataset.rel !== dragKey;
        },
      );
      const blockRect = ownBlock.getBoundingClientRect();
      if (event.clientY < blockRect.top) {
        return { blockKind, index: 0 };
      }
      if (event.clientY > blockRect.bottom) {
        return { blockKind, index: without.length };
      }
      for (let i = 0; i < items.length; i++) {
        const node = items[i];
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        const rect = node.getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) {
          return { blockKind, index: i };
        }
      }
      return { blockKind, index: without.length };
    }

    // No own block yet: foreign blocks above → index 0, otherwise end (0).
    if (children instanceof HTMLElement) {
      const order = ['dirs', 'files', 'classes'];
      const ownPos = order.indexOf(blockKind);
      for (let i = 0; i < order.length; i++) {
        if (i === ownPos) {
          continue;
        }
        const other = children.querySelector(':scope > .block-' + order[i]);
        if (!(other instanceof HTMLElement)) {
          continue;
        }
        const rect = other.getBoundingClientRect();
        if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
          return { blockKind, index: i < ownPos ? without.length : 0 };
        }
      }
    }
    return { blockKind, index: without.length };
  }

  /**
   * @param {HTMLElement} section
   * @param {*} group
   * @param {string} blockKind
   * @param {number} index
   * @param {*} payload
   */
  function ensureDropSlot(section, group, blockKind, index, payload) {
    if (
      dropSlotState &&
      dropSlotState.groupId === group.id &&
      dropSlotState.blockKind === blockKind &&
      dropSlotState.index === index &&
      dropSlotEl &&
      dropSlotEl.isConnected
    ) {
      return;
    }
    clearDropSlot();
    dropSlotState = { groupId: group.id, blockKind, index };

    let children = section.querySelector(':scope > .children');
    if (!(children instanceof HTMLElement)) {
      children = el('div', 'children');
      section.append(children);
    }
    let block = children.querySelector(':scope > .block-' + blockKind);
    if (!(block instanceof HTMLElement)) {
      block = el('div', 'node block block-' + blockKind);
      insertBlockInOrder(children, block, blockKind);
    }

    const dragKey = payload.kind === 'class' ? payload.classId : payload.relPath;
    const fromSame = payload.from === group.id;
    const items = [...block.querySelectorAll(':scope > .item:not(.drop-slot)')].filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      if (!fromSame) {
        return true;
      }
      if (payload.kind === 'class') {
        return node.dataset.classId !== dragKey;
      }
      return node.dataset.rel !== dragKey;
    });

    const slot = el('div', 'item drop-slot');
    slot.setAttribute('aria-hidden', 'true');
    const at = Math.max(0, Math.min(index, items.length));
    if (at >= items.length) {
      block.append(slot);
    } else {
      block.insertBefore(slot, items[at]);
    }
    dropSlotEl = slot;
  }

  /**
   * @param {HTMLElement} children
   * @param {HTMLElement} block
   * @param {string} blockKind
   */
  function insertBlockInOrder(children, block, blockKind) {
    const order = ['dirs', 'files', 'classes'];
    const pos = order.indexOf(blockKind);
    for (let i = pos + 1; i < order.length; i++) {
      const later = children.querySelector(':scope > .block-' + order[i]);
      if (later) {
        children.insertBefore(block, later);
        return;
      }
    }
    const firstCard = children.querySelector(':scope > section.group, :scope > .note-card');
    if (firstCard) {
      children.insertBefore(block, firstCard);
      return;
    }
    children.append(block);
  }

  function clearDropSlot() {
    if (dropSlotEl && dropSlotEl.isConnected) {
      const block = dropSlotEl.parentElement;
      dropSlotEl.remove();
      if (block && block.childElementCount === 0 && block.classList.contains('block')) {
        block.remove();
      }
    }
    dropSlotEl = null;
    dropSlotState = null;
  }

  function openDropChooseDialog(pending) {
    pendingChipDrop = pending;
    dialogKind = 'drop';
    choiceDismiss = null;
    dropDialog.hidden = false;
    dropDialog.replaceChildren();
    const panel = el('div', 'drop-dialog-panel');
    const actions = el('div', 'drop-dialog-actions');
    const moveBtn = el('button', 'drop-dialog-btn');
    moveBtn.type = 'button';
    moveBtn.textContent = t('dropMove');
    moveBtn.addEventListener('click', () => {
      const current = pendingChipDrop;
      closeDropDialog();
      if (current) {
        commitChipDrop(current, false);
      }
    });
    const copyBtn = el('button', 'drop-dialog-btn');
    copyBtn.type = 'button';
    copyBtn.textContent = t('dropCopy');
    copyBtn.addEventListener('click', () => {
      const current = pendingChipDrop;
      closeDropDialog();
      if (current) {
        commitChipDrop(current, true);
      }
    });
    actions.append(moveBtn, copyBtn);
    panel.append(actions);
    dropDialog.append(panel);
    moveBtn.focus();
  }

  function openDropExistsDialog() {
    pendingChipDrop = null;
    dialogKind = 'drop';
    choiceDismiss = null;
    dropDialog.hidden = false;
    dropDialog.replaceChildren();
    const panel = el('div', 'drop-dialog-panel');
    panel.append(el('div', 'drop-dialog-message', t('dropAlreadyExists')));
    const actions = el('div', 'drop-dialog-actions');
    const okBtn = el('button', 'drop-dialog-btn');
    okBtn.type = 'button';
    okBtn.textContent = t('dropOk');
    okBtn.addEventListener('click', () => closeDropDialog());
    actions.append(okBtn);
    panel.append(actions);
    dropDialog.append(panel);
    okBtn.focus();
  }

  function closeDropDialog() {
    pendingLinkDrop = null;
    pendingChipDrop = null;
    dialogKind = '';
    choiceDismiss = null;
    dropDialog.hidden = true;
    dropDialog.replaceChildren();
  }

  /**
   * @param {string} message
   * @param {Array<{ label: string, onClick: () => void }>} buttons
   * @param {() => void} [onDismiss]
   */
  function openChoiceDialog(message, buttons, onDismiss) {
    dialogKind = 'choice';
    choiceDismiss = onDismiss || null;
    dropDialog.hidden = false;
    dropDialog.replaceChildren();
    const panel = el('div', 'drop-dialog-panel');
    panel.append(el('div', 'drop-dialog-message', message));
    const actions = el('div', 'drop-dialog-actions');
    for (const button of buttons) {
      const node = el('button', 'drop-dialog-btn');
      node.type = 'button';
      node.textContent = button.label;
      node.addEventListener('click', () => {
        choiceDismiss = null;
        dialogKind = '';
        dropDialog.hidden = true;
        dropDialog.replaceChildren();
        button.onClick();
      });
      actions.append(node);
    }
    panel.append(actions);
    dropDialog.append(panel);
    const first = actions.querySelector('button');
    if (first instanceof HTMLButtonElement) {
      first.focus();
    }
  }

  function dismissChoiceDialog() {
    const dismiss = choiceDismiss;
    choiceDismiss = null;
    dialogKind = '';
    dropDialog.hidden = true;
    dropDialog.replaceChildren();
    if (dismiss) {
      dismiss();
    }
  }

  dropDialog.addEventListener('click', (event) => {
    if (event.target !== dropDialog) {
      return;
    }
    if (dialogKind === 'choice') {
      dismissChoiceDialog();
      return;
    }
    closeDropDialog();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || dropDialog.hidden) {
      return;
    }
    event.preventDefault();
    if (dialogKind === 'choice') {
      dismissChoiceDialog();
      return;
    }
    closeDropDialog();
  });

  /** @type {{ noteId?: string, linkId?: string, url: string } | null} */
  let entityLinkSource = null;
  /**
   * @typedef {{ kind: 'group' | 'note', id: string, locked?: boolean }} EntityChainNode
   * @typedef {{ pageId: string, chain: EntityChainNode[], choice: 'yes' | 'no' | null, alignTop: boolean }} EntityReveal
   */
  /** @type {EntityReveal | null} */
  let entityReveal = null;
  /** @type {EntityChainNode[] | null} */
  let flashNodes = null;
  let flashUntil = 0;
  /** Page switch: pin the landing row just under the toolbar. */
  let flashAlignTop = false;
  let entityAlignPageId = '';
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let entityFlashTimer = 0;

  /** @param {string | undefined} raw */
  function parseEntityLink(raw) {
    const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(group|note|scenario)\/([^?\s#]+)$/.exec(
      String(raw || '').trim(),
    );
    if (!match) {
      return null;
    }
    const ids = match[3].split('/').filter((id) => id && !/[\s/?#]/.test(id));
    if (!ids.length || ids.join('/').length !== match[3].length) {
      return null;
    }
    return {
      pageId: match[1],
      kind: /** @type {'group' | 'note' | 'scenario'} */ (match[2]),
      ids,
      leaf: ids[ids.length - 1],
    };
  }

  /**
   * @param {'group' | 'note'} kind
   * @param {string} id
   */
  function entityExists(kind, id) {
    const bag = data?.entities;
    if (!bag) {
      return true;
    }
    const list = kind === 'group' ? bag.groups : bag.notes;
    return Array.isArray(list) && list.includes(id);
  }

  /** @param {string | undefined} url */
  function entityLinkIsBroken(url) {
    const parsed = parseEntityLink(url);
    if (!parsed || !data?.entities) {
      return false;
    }
    return !entityExists(parsed.kind, parsed.leaf);
  }

  /**
   * @param {HTMLAnchorElement} link
   * @param {string} href
   */
  function markBrokenEntityLink(link, href) {
    if (entityLinkIsBroken(href)) {
      link.classList.add('is-broken');
    }
  }

  /** @param {number | undefined} epoch */
  function noteRefactorEpoch(epoch) {
    if (typeof epoch !== 'number') {
      return;
    }
    if (seenRefactorEpoch === null) {
      seenRefactorEpoch = epoch;
      return;
    }
    if (epoch === seenRefactorEpoch) {
      return;
    }
    seenRefactorEpoch = epoch;
    refactorBanner.textContent = t('refactoring');
    refactorBanner.hidden = false;
    if (refactorTimer) {
      clearTimeout(refactorTimer);
    }
    refactorTimer = window.setTimeout(() => {
      refactorTimer = 0;
      refactorBanner.hidden = true;
    }, 500);
  }

  /**
   * @param {'group' | 'note'} kind
   * @param {string} id
   */
  function entityLinkFor(kind, id) {
    const pageId = uiState.activePageId;
    if (!pageId || !/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(pageId)) {
      return '';
    }
    if (kind === 'group') {
      const ids = groupIdChain(id);
      return ids && ids.length ? pageId + '://group/' + ids.join('/') : '';
    }
    const notes = noteIdChain(id);
    if (!notes || !notes.length) {
      return '';
    }
    const root = (data?.notes || []).find((note) => note.id === notes[0]);
    const groups = root?.markerId ? groupIdChain(root.markerId) : [];
    if (root?.markerId && !groups) {
      return '';
    }
    return pageId + '://note/' + [...(groups || []), ...notes].join('/');
  }

  /** @param {string} id @returns {string[] | null} */
  function groupIdChain(id) {
    const chain = [];
    const seen = new Set();
    let current = id;
    while (current && !seen.has(current)) {
      seen.add(current);
      const group = (data?.groups || []).find((item) => item.id === current);
      if (!group) {
        return null;
      }
      chain.unshift(group.id);
      current = group.parent || '';
    }
    return chain;
  }

  /** @param {string} id @returns {string[] | null} */
  function noteIdChain(id) {
    const chain = [];
    const seen = new Set();
    let current = id;
    while (current && !seen.has(current)) {
      seen.add(current);
      const note = (data?.notes || []).find((item) => item.id === current);
      if (!note) {
        return null;
      }
      chain.unshift(note.id);
      current = note.parentNote || '';
    }
    return chain;
  }

  /**
   * @param {string} url
   * @param {{ noteId?: string, linkId?: string, url: string }} source
   */
  function followEntityUrl(url, source) {
    const parsed = parseEntityLink(url);
    if (!parsed) {
      return false;
    }
    if (entityLinkIsBroken(url)) {
      openBrokenLinkDialog(source);
      return true;
    }
    entityLinkSource = source;
    vscode.postMessage({ type: 'openEntityLink', url: String(url || '').trim() });
    return true;
  }

  /** @param {{ noteId?: string, linkId?: string, url: string }} source */
  function openBrokenLinkDialog(source) {
    openChoiceDialog(t('brokenLink'), [
      {
        label: t('brokenDelete'),
        onClick: () => {
          if (source.noteId) {
            vscode.postMessage({ type: 'stripEntityLink', noteId: source.noteId, url: source.url });
            return;
          }
          if (source.linkId) {
            vscode.postMessage({ type: 'clearLinkUrl', linkId: source.linkId });
          }
        },
      },
    ]);
  }

  /**
   * @param {string} pageId
   * @param {EntityChainNode[]} chain
   */
  /**
   * Open ancestors on `pageId` before the page paints, so a switch can scroll
   * straight to the landing row.
   * @param {string} pageId
   * @param {EntityChainNode[]} chain
   */
  function revealCollapsed(pageId, chain) {
    const page = pages().find((item) => item.id === pageId);
    if (!page) {
      return null;
    }
    const next = { ...(page.collapsed || {}) };
    let changed = false;
    for (let i = 0; i < chain.length - 1; i++) {
      if (next[chain[i].id]) {
        delete next[chain[i].id];
        changed = true;
      }
    }
    if (!changed) {
      return null;
    }
    page.collapsed = next;
    return next;
  }

  /**
   * @param {string} pageId
   * @param {EntityChainNode[]} chain
   */
  function startEntityReveal(pageId, chain) {
    if (!pages().some((page) => page.id === pageId)) {
      entityReveal = null;
      return;
    }
    const switching = uiState.activePageId !== pageId || isAuxPageOpen();
    const needsAsk = chain.some((node) => node.locked);
    entityReveal = { pageId, chain, choice: null, alignTop: switching };
    const opened = switching && !needsAsk ? revealCollapsed(pageId, chain) : null;
    if (switching) {
      setActivePage(pageId);
    }
    if (opened) {
      persistCollapsed(opened);
    }
    pumpEntityReveal();
  }

  function pumpEntityReveal() {
    const job = entityReveal;
    if (!job) {
      return;
    }
    if (uiState.activePageId !== job.pageId || isAuxPageOpen()) {
      return;
    }
    if (!data || data.contentPageId !== job.pageId) {
      return;
    }
    const parents = job.chain.slice(0, -1);
    const needsAsk =
      !job.choice && (parents.some((node) => node.locked) || !!job.chain[job.chain.length - 1]?.locked);
    if (needsAsk) {
      if (dialogKind !== 'choice') {
        openUnlockDialog(job);
      }
      return;
    }
    entityReveal = null;
    performEntityReveal(job);
  }

  /** @param {EntityReveal} job */
  function openUnlockDialog(job) {
    openChoiceDialog(
      t('unlockAsk'),
      [
        {
          label: t('unlockYes'),
          onClick: () => {
            job.choice = 'yes';
            const top = job.chain.find((node) => node.locked);
            if (top?.kind === 'note') {
              vscode.postMessage({ type: 'toggleNoteLock', noteId: top.id });
            } else if (top) {
              vscode.postMessage({ type: 'toggleLock', markerId: top.id });
            }
          },
        },
        {
          label: t('unlockNo'),
          onClick: () => {
            job.choice = 'no';
            entityReveal = null;
            performEntityReveal(job);
          },
        },
      ],
      () => {
        entityReveal = null;
      },
    );
  }

  /**
   * @param {EntityChainNode[]} chain
   * @param {'yes' | 'no' | null} choice
   */
  function entityLandingIndex(chain, choice) {
    if (choice !== 'no') {
      return chain.length - 1;
    }
    let lockedAt = -1;
    for (let i = 0; i < chain.length - 1; i++) {
      if (chain[i].locked) {
        lockedAt = i;
        break;
      }
    }
    if (lockedAt < 0) {
      return chain.length - 1;
    }
    for (let j = lockedAt - 1; j >= 0; j--) {
      if (!chain[j].locked) {
        return j;
      }
    }
    return 0;
  }

  /** @param {EntityReveal} job */
  function performEntityReveal(job) {
    const stop = entityLandingIndex(job.chain, job.choice);
    const next = { ...pageCollapsed() };
    let changed = false;
    for (let i = 0; i < stop; i++) {
      const id = job.chain[i].id;
      if (next[id]) {
        delete next[id];
        changed = true;
      }
    }
    if (changed) {
      persistCollapsed(next);
      if (job.alignTop) {
        skipNextFolds = true;
      }
      renderFromToggle = true;
      render();
      renderFromToggle = false;
    }
    armEntityFlash(job.chain.slice(0, stop + 1), job.alignTop);
  }

  /**
   * @param {EntityChainNode[]} nodes
   * @param {boolean} [alignTop]
   */
  function armEntityFlash(nodes, alignTop) {
    flashNodes = nodes;
    flashUntil = Date.now() + 500;
    flashAlignTop = !!alignTop;
    if (alignTop) {
      entityAlignPageId = uiState.activePageId;
      applyEntityFlash(true);
    }
    requestAnimationFrame(() => applyEntityFlash(true));
    if (entityFlashTimer) {
      clearTimeout(entityFlashTimer);
    }
    entityFlashTimer = window.setTimeout(() => {
      entityFlashTimer = 0;
      flashNodes = null;
      flashAlignTop = false;
      root.querySelectorAll('.is-link-flash').forEach((node) => {
        node.classList.remove('is-link-flash');
      });
    }, 500);
  }

  function entityAlignPending() {
    return (
      flashAlignTop &&
      !!flashNodes &&
      Date.now() < flashUntil &&
      uiState.activePageId === entityAlignPageId &&
      !isAuxPageOpen()
    );
  }

  /** @param {EntityChainNode} node */
  function entityHeader(node) {
    const card =
      node.kind === 'note'
        ? root.querySelector('.note-card[data-note-id="' + CSS.escape(node.id) + '"]')
        : root.querySelector(
            'section.group[data-marker-id="' + CSS.escape(node.id) + '"]:not(.note-card)',
          );
    if (!(card instanceof HTMLElement)) {
      return null;
    }
    const header = card.querySelector(':scope > .group-header');
    return header instanceof HTMLElement ? header : null;
  }

  /**
   * Put the landing row's top edge against the bottom of the sticky toolbar.
   * A short page stops at its max scroll, so the row stays as high as it can.
   * @param {HTMLElement} landing
   */
  function scrollLandingBelowChrome(landing) {
    const chrome = document.querySelector('.map-chrome');
    const chromeBottom = chrome instanceof HTMLElement ? chrome.getBoundingClientRect().bottom : 0;
    const node = docScroller();
    const delta = landing.getBoundingClientRect().top - chromeBottom;
    const max = Math.max(0, node.scrollHeight - node.clientHeight);
    const next = Math.min(max, Math.max(0, (node.scrollTop || 0) + delta));
    applyDocScroll(next);
  }

  /** @param {boolean} scroll */
  function applyEntityFlash(scroll) {
    if (!flashNodes || Date.now() > flashUntil) {
      return;
    }
    /** @type {HTMLElement | null} */
    let landing = null;
    for (const node of flashNodes) {
      const card =
        node.kind === 'note'
          ? root.querySelector('.note-card[data-note-id="' + CSS.escape(node.id) + '"]')
          : root.querySelector(
              'section.group[data-marker-id="' + CSS.escape(node.id) + '"]:not(.note-card)',
            );
      if (!(card instanceof HTMLElement)) {
        continue;
      }
      const header = card.querySelector(':scope > .group-header');
      if (header instanceof HTMLElement) {
        header.classList.add('is-link-flash');
        landing = header;
      }
      if (node.kind === 'note') {
        const body = card.querySelector('.note-body');
        if (body instanceof HTMLElement) {
          body.classList.add('is-link-flash');
        }
      }
    }
    if (!scroll) {
      return;
    }
    if (flashAlignTop) {
      const target = flashNodes[flashNodes.length - 1];
      const header = target && entityHeader(target);
      if (header && !isFolding) {
        scrollLandingBelowChrome(header);
      }
      return;
    }
    if (landing) {
      landing.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
    clearLinkDropCue();
    clearDropSlot();
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
      // Same title row as .change-mark so both corners share one left edge.
      const badge = section.querySelector(':scope > .group-header');
      const group = byId[section.dataset.markerId || ''];
      // Drop legacy marks that sat on the card shell (wrong inset vs header).
      section.querySelector(':scope > .tab-mark')?.remove();
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
   * Bottom-left corner when the entity has on-disk uncommitted changes.
   * Same nodes as applyTabMarks for chips; groups always use the title row.
   */
  function applyChangeMarks() {
    const dirtyPaths = Array.isArray(data?.dirtyPaths) ? data.dirtyPaths : [];
    const groups = activePage()?.kind === 'notes' ? [] : pageGroups();
    const byId = Object.fromEntries(groups.map((group) => [group.id, group]));

    for (const node of root.querySelectorAll('section.group')) {
      const section = /** @type {HTMLElement} */ (node);
      // Title row — not the whole card — so the mark sits under the group name.
      const badge = section.querySelector(':scope > .group-header');
      const group = byId[section.dataset.markerId || ''];
      section.querySelector(':scope > .change-mark')?.remove();
      if (!(badge instanceof HTMLElement)) {
        continue;
      }
      const dirty = !!group && dirtyPaths.some((relPath) => chainHits(group, byId, relPath));
      setChangeCorner(badge, dirty);
    }

    for (const node of root.querySelectorAll('.item')) {
      const item = /** @type {HTMLElement} */ (node);
      let dirty = false;
      if (item.classList.contains('class-item')) {
        const file = item.dataset.file || '';
        dirty = file !== '' && dirtyPaths.includes(file);
      } else if (item.classList.contains('dir')) {
        const folder = item.dataset.rel || '';
        dirty = dirtyPaths.some((relPath) => pathCovers(folder, relPath));
      } else {
        const relPath = item.dataset.rel || '';
        dirty = relPath !== '' && dirtyPaths.includes(relPath);
      }
      setChangeCorner(item, dirty);
    }
    applyDirPopoverChangeMarks();
  }

  /** Red corner on folder peek rows (files and nested folders). */
  function applyDirPopoverChangeMarks() {
    if (!dirPopoverState || dirPopover.hidden) {
      return;
    }
    const dirtyPaths = Array.isArray(data?.dirtyPaths) ? data.dirtyPaths : [];
    for (const node of dirPopover.querySelectorAll('.dir-popover-item')) {
      const row = /** @type {HTMLElement} */ (node);
      const relPath = row.dataset.rel || '';
      const dirty = row.classList.contains('dir')
        ? dirtyPaths.some((path) => pathCovers(relPath, path))
        : relPath !== '' && dirtyPaths.includes(relPath);
      setChangeCorner(row, dirty);
    }
  }

  /**
   * @param {unknown} value
   * @returns {'error' | 'warning' | 'info'}
   */
  function normalizeProblemSeverity(value) {
    if (value === 'warning' || value === 'info' || value === 'error') {
      return value;
    }
    return 'error';
  }

  /** @returns {ProblemDiag[]} */
  function problemList() {
    const raw = data?.problems;
    if (!Array.isArray(raw)) {
      return [];
    }
    /** @type {ProblemDiag[]} */
    const out = [];
    for (const entry of raw) {
      if (
        !entry ||
        typeof entry.relPath !== 'string' ||
        typeof entry.message !== 'string' ||
        !Number.isInteger(entry.line) ||
        !Number.isInteger(entry.character) ||
        !Number.isInteger(entry.endLine) ||
        !Number.isInteger(entry.endCharacter)
      ) {
        continue;
      }
      out.push({
        relPath: entry.relPath,
        message: entry.message,
        severity: normalizeProblemSeverity(entry.severity),
        line: entry.line,
        character: entry.character,
        endLine: entry.endLine,
        endCharacter: entry.endCharacter,
      });
    }
    return out;
  }

  /** Map marks and the hover popup stay Error-only. */
  function errorProblemList() {
    return problemList().filter((problem) => problem.severity === 'error');
  }

  function problemsFilterState() {
    const a = data?.appearance || {};
    return {
      error: a.problemsError !== false,
      warning: a.problemsWarning !== false,
      info: a.problemsInfo !== false,
    };
  }

  /** Problems page list after profile severity filters. */
  function pageProblemList() {
    const filters = problemsFilterState();
    return problemList().filter((problem) => {
      if (problem.severity === 'error') {
        return filters.error;
      }
      if (problem.severity === 'warning') {
        return filters.warning;
      }
      if (problem.severity === 'info') {
        return filters.info;
      }
      return false;
    });
  }

  /** @param {'error' | 'warning' | 'info'} value */
  function toggleProblemsFilter(value) {
    const key =
      value === 'warning' ? 'problemsWarning' : value === 'info' ? 'problemsInfo' : 'problemsError';
    const state = problemsFilterState();
    const on = value === 'warning' ? state.warning : value === 'info' ? state.info : state.error;
    if (on) {
      const enabled =
        (value === 'error' ? 0 : state.error ? 1 : 0) +
        (value === 'warning' ? 0 : state.warning ? 1 : 0) +
        (value === 'info' ? 0 : state.info ? 1 : 0);
      if (enabled === 0) {
        return;
      }
    }
    const next = { [key]: !on };
    if (data?.appearance && typeof data.appearance === 'object') {
      data.appearance = { ...data.appearance, ...next };
    }
    vscode.postMessage({ type: 'setAppearance', appearance: next });
    if (openMenuState?.kind === 'context' && openMenuState.ctx?.webviewSection === 'problems') {
      renderContextMenu();
    }
    if (isProblemsPageOpen()) {
      paintProblemsPage();
    }
  }

  function debugReasonText(reason) {
    if (!reason) {
      return '';
    }
    if (i18nBag[reason]) {
      return i18nBag[reason];
    }
    return reason;
  }

  /**
   * @param {Record<number, number>} v
   * @param {number} k
   */
  function debugDiffAt(v, k) {
    return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : -1;
  }

  /**
   * Myers edit script. `eq` / `del` lines come from `a`, `add` lines from `b`.
   * @param {string[]} a
   * @param {string[]} b
   * @returns {{ op: 'eq' | 'del' | 'add', text: string }[]}
   */
  function debugDiffScript(a, b) {
    const n = a.length;
    const m = b.length;
    const max = n + m;
    /** @type {Record<number, number>} */
    let frontier = { 1: 0 };
    /** @type {Record<number, number>[]} */
    const trace = [];
    let depth = 0;
    let found = false;
    for (let d = 0; d <= max; d += 1) {
      trace.push({ ...frontier });
      depth = d;
      for (let k = -d; k <= d; k += 2) {
        let x;
        if (k === -d || (k !== d && debugDiffAt(frontier, k - 1) < debugDiffAt(frontier, k + 1))) {
          x = debugDiffAt(frontier, k + 1);
        } else {
          x = debugDiffAt(frontier, k - 1) + 1;
        }
        let y = x - k;
        while (x < n && y < m && a[x] === b[y]) {
          x += 1;
          y += 1;
        }
        frontier[k] = x;
        if (x >= n && y >= m) {
          found = true;
          break;
        }
      }
      if (found) {
        break;
      }
    }
    if (!found) {
      return [];
    }
    return debugDiffBacktrack(trace, a, b, depth);
  }

  /**
   * @param {Record<number, number>[]} trace
   * @param {string[]} a
   * @param {string[]} b
   * @param {number} depth
   * @returns {{ op: 'eq' | 'del' | 'add', text: string }[]}
   */
  function debugDiffBacktrack(trace, a, b, depth) {
    let x = a.length;
    let y = b.length;
    /** @type {{ op: 'eq' | 'del' | 'add', text: string }[]} */
    const script = [];
    for (let d = depth; d >= 0; d -= 1) {
      const frontier = trace[d];
      const k = x - y;
      const prevK =
        k === -d || (k !== d && debugDiffAt(frontier, k - 1) < debugDiffAt(frontier, k + 1))
          ? k + 1
          : k - 1;
      const prevX = debugDiffAt(frontier, prevK);
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) {
        x -= 1;
        y -= 1;
        script.push({ op: 'eq', text: a[x] });
      }
      if (d > 0) {
        if (x === prevX) {
          y -= 1;
          script.push({ op: 'add', text: b[y] });
        } else {
          x -= 1;
          script.push({ op: 'del', text: a[x] });
        }
      }
    }
    script.reverse();
    return script;
  }

  /**
   * GitLab side-by-side rows. A replaced run is zipped onto the same height:
   * old text on the left, new text on the right. Leftover deletions and
   * insertions get an empty cell on the other side.
   * @param {string} leftText
   * @param {string} rightText
   * @returns {{ left: string | null, right: string | null, kind: 'eq' | 'del' | 'add' | 'change' }[]}
   */
  function debugSideBySideRows(leftText, rightText) {
    const a = String(leftText).split('\n');
    const b = String(rightText).split('\n');
    const script = debugDiffScript(a, b);
    /** @type {{ left: string | null, right: string | null, kind: 'eq' | 'del' | 'add' | 'change' }[]} */
    const rows = [];
    let i = 0;
    while (i < script.length) {
      if (script[i].op === 'eq') {
        rows.push({ left: script[i].text, right: script[i].text, kind: 'eq' });
        i += 1;
        continue;
      }
      /** @type {string[]} */
      const dels = [];
      /** @type {string[]} */
      const adds = [];
      while (i < script.length && script[i].op !== 'eq') {
        if (script[i].op === 'del') {
          dels.push(script[i].text);
        } else {
          adds.push(script[i].text);
        }
        i += 1;
      }
      const count = Math.max(dels.length, adds.length);
      for (let k = 0; k < count; k += 1) {
        const left = k < dels.length ? dels[k] : null;
        const right = k < adds.length ? adds[k] : null;
        let kind = /** @type {'eq' | 'del' | 'add' | 'change'} */ ('add');
        if (left !== null && right !== null) {
          kind = 'change';
        } else if (left !== null) {
          kind = 'del';
        }
        rows.push({ left, right, kind });
      }
    }
    return rows;
  }

  /**
   * @param {HTMLElement} columns
   * @param {{ left?: unknown, right?: unknown }} section
   */
  function appendDebugPlainColumns(columns, section) {
    const leftCol = el('div', 'debug-column');
    leftCol.append(el('div', 'debug-column-label', t('debugColWas')));
    const leftPre = document.createElement('pre');
    leftPre.textContent = JSON.stringify(section.left ?? {}, null, 2);
    leftCol.append(leftPre);
    const rightCol = el('div', 'debug-column');
    rightCol.append(el('div', 'debug-column-label', t('debugColNow')));
    const rightPre = document.createElement('pre');
    rightPre.textContent = JSON.stringify(section.right ?? {}, null, 2);
    rightCol.append(rightPre);
    columns.append(leftCol, rightCol);
  }

  /**
   * @param {string | null} text
   * @param {string} mark
   */
  function debugDiffCell(text, mark) {
    const cell = el('div', 'debug-diff-cell' + (mark ? ' ' + mark : ''));
    if (text === null) {
      cell.classList.add('is-empty');
      return cell;
    }
    cell.textContent = text;
    return cell;
  }

  /**
   * @param {HTMLElement} columns
   * @param {{ left?: unknown, right?: unknown }} section
   */
  function appendDebugDiffColumns(columns, section) {
    const leftText = JSON.stringify(section.left ?? {}, null, 2);
    const rightText = JSON.stringify(section.right ?? {}, null, 2);
    const rows = debugSideBySideRows(leftText, rightText);
    if (rows.length === 0 && (leftText !== '' || rightText !== '')) {
      appendDebugPlainColumns(columns, section);
      return;
    }
    columns.classList.add('debug-diff');
    const scroll = el('div', 'debug-diff-scroll');
    const head = el('div', 'debug-diff-head');
    head.append(el('div', 'debug-column-label', t('debugColWas')));
    head.append(el('div', 'debug-column-label', t('debugColNow')));
    scroll.append(head);
    for (const row of rows) {
      const line = el('div', 'debug-diff-row');
      const leftMark = row.kind === 'del' || row.kind === 'change' ? 'is-del' : '';
      const rightMark = row.kind === 'add' || row.kind === 'change' ? 'is-add' : '';
      line.append(debugDiffCell(row.left, leftMark), debugDiffCell(row.right, rightMark));
      scroll.append(line);
    }
    columns.append(scroll);
  }

  function paintDebugPage() {
    removeLinkPanelBackdrop();
    preservingPageScroll(() => {
      foldToken += 1;
      isFolding = false;
      setCollapseButton();
      root.textContent = '';
      root.className = 'map-page debug-page';
      root.setAttribute('data-syn3-context', JSON.stringify({ webviewSection: 'debug' }));
      clearDropHighlights();

      const toolbar = el('div', 'debug-toolbar');
      const refresh = el('button', '', t('debugRefresh'));
      refresh.type = 'button';
      refresh.disabled = debugDiffBusy;
      refresh.addEventListener('click', () => requestDebugDiff(true));
      toolbar.append(refresh);
      if (debugDiffBusy) {
        toolbar.append(el('span', 'debug-status', t('debugLoading')));
      }
      root.append(toolbar);

      if (debugDiffBusy && !debugDiffSnapshot) {
        return;
      }

      const sections = debugDiffSnapshot?.sections || [];
      if (!debugDiffBusy && sections.length === 0) {
        root.append(el('div', 'empty', t(workspaceCloudCanPush() ? 'debugDiffSame' : 'debugEmpty')));
        return;
      }

      for (const section of sections) {
        const block = el('section', 'debug-section');
        block.append(el('div', 'debug-section-title', section.title || section.id));
        if (section.reason) {
          block.append(el('div', 'debug-section-reason', debugReasonText(section.reason)));
        }
        if (section.reason === 'debugDiffSame') {
          root.append(block);
          continue;
        }
        const columns = el('div', 'debug-columns');
        if (section.reason) {
          appendDebugPlainColumns(columns, section);
        } else {
          appendDebugDiffColumns(columns, section);
        }
        block.append(columns);
        root.append(block);
      }
    });
  }

  function paintProblemsPage() {
    removeLinkPanelBackdrop();
    preservingPageScroll(() => {
    foldToken += 1;
    isFolding = false;
    setCollapseButton();
    root.textContent = '';
    root.className = 'map-page problems-page';
    root.setAttribute('data-syn3-context', JSON.stringify({ webviewSection: 'problems' }));
    clearDropHighlights();

    const matched = pageProblemList();
    if (matched.length === 0) {
      root.append(el('div', 'empty', t('problemsEmpty')));
      return;
    }
    /** @type {Map<string, ProblemDiag[]>} */
    const byFile = new Map();
    for (const problem of matched) {
      const bucket = byFile.get(problem.relPath);
      if (bucket) {
        bucket.push(problem);
      } else {
        byFile.set(problem.relPath, [problem]);
      }
    }
    const paths = [...byFile.keys()];
    for (const relPath of paths) {
      const block = document.createElement('div');
      block.className = 'problem-file';
      for (const problem of byFile.get(relPath) || []) {
        block.append(problemPageMessageButton(problem));
      }
      block.append(problemFileLink(relPath, problemLinkLabel(relPath, paths)));
      root.append(block);
    }
    });
  }

  /** @param {ProblemDiag} problem */
  function problemPageMessageButton(problem) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'problem-message severity-' + problem.severity;
    button.append(severityGlyph(problem.severity));
    const text = document.createElement('span');
    text.className = 'problem-message-text';
    text.textContent = problem.message;
    button.append(text);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      vscode.postMessage({
        type: 'openAt',
        relPath: problem.relPath,
        line: problem.line,
        character: problem.character,
        endLine: problem.endLine,
        endCharacter: problem.endCharacter,
      });
    });
    return button;
  }

  /**
   * @param {HTMLElement} node
   * @returns {{ kind: 'file' | 'dir', relPath: string }}
   */
  function problemScopeOf(node) {
    if (node.classList.contains('class-item')) {
      return { kind: 'file', relPath: node.dataset.file || '' };
    }
    if (node.classList.contains('dir')) {
      return { kind: 'dir', relPath: node.dataset.rel || '' };
    }
    return { kind: 'file', relPath: node.dataset.rel || '' };
  }

  /**
   * File: exact path. Folder: any error under the tree. Class: its whole file.
   * @param {HTMLElement} node
   */
  function entityHasProblems(node) {
    const scope = problemScopeOf(node);
    if (!scope.relPath) {
      return false;
    }
    const problems = errorProblemList();
    if (scope.kind === 'dir') {
      return problems.some((problem) => pathCovers(scope.relPath, problem.relPath));
    }
    return problems.some((problem) => problem.relPath === scope.relPath);
  }

  /** Red mark between the type icon and the name. Click opens the error panel. */
  function applyProblemMarks() {
    const mode = errorIconMode();
    const nodes = [
      ...root.querySelectorAll('.item'),
      ...dirPopover.querySelectorAll('.dir-popover-item'),
    ];
    for (const node of nodes) {
      const row = /** @type {HTMLElement} */ (node);
      const show = mode.show && entityHasProblems(row);
      const existing = row.querySelector(':scope > .problem-mark');
      if (!show) {
        if (existing instanceof HTMLButtonElement && problemPanelState?.anchor === existing) {
          closeProblemPanel();
        }
        existing?.remove();
        continue;
      }
      if (existing instanceof HTMLButtonElement) {
        existing.classList.toggle('is-live', mode.animate);
        continue;
      }
      mountProblemIcon(row, mode.animate);
    }
    if (problemPanelState) {
      if (!problemPanelState.anchor.isConnected) {
        closeProblemPanel();
        return;
      }
      fillProblemPanel();
      positionProblemPanel();
    }
  }

  /**
   * @param {HTMLElement} node
   * @param {boolean} animate
   */
  function mountProblemIcon(node, animate) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'problem-mark' + (animate ? ' is-live' : '');
    button.setAttribute('aria-label', 'Errors');
    button.setAttribute('aria-expanded', 'false');
    button.append(errorGlyph());
    button.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      button.dataset.pressed = '1';
    });
    const release = () => {
      button.dataset.pressed = '';
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      release();
      toggleProblemPanel(button);
    });
    node.addEventListener(
      'dragstart',
      (event) => {
        if (button.dataset.pressed === '1') {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true,
    );
    const text = node.querySelector(':scope > .item-text') || node.querySelector(':scope > .name');
    if (text) {
      text.before(button);
    } else {
      node.append(button);
    }
  }

  /** @param {HTMLButtonElement} anchor */
  function toggleProblemPanel(anchor) {
    if (problemPanelState && problemPanelState.anchor === anchor) {
      closeProblemPanel();
      return;
    }
    const parent = anchor.parentElement;
    if (!(parent instanceof HTMLElement)) {
      return;
    }
    const scope = problemScopeOf(parent);
    if (!scope.relPath) {
      return;
    }
    if (problemPanelState) {
      problemPanelState.anchor.setAttribute('aria-expanded', 'false');
    }
    problemPanelState = { anchor, kind: scope.kind, relPath: scope.relPath };
    anchor.setAttribute('aria-expanded', 'true');
    problemPanel.hidden = false;
    fillProblemPanel();
    positionProblemPanel();
  }

  function closeProblemPanel() {
    if (problemPanelState) {
      problemPanelState.anchor.setAttribute('aria-expanded', 'false');
    }
    problemPanelState = null;
    problemPanel.hidden = true;
    problemPanel.style.maxHeight = '';
    const chrome = ensureMenuChrome(problemPanel);
    chrome.scroller.replaceChildren();
    chrome.scroller.scrollTop = 0;
    chrome.bar.hidden = true;
  }

  function fillProblemPanel() {
    if (!problemPanelState) {
      return;
    }
    const scope = problemPanelState;
    const matched = errorProblemList().filter((problem) =>
      scope.kind === 'dir' ? pathCovers(scope.relPath, problem.relPath) : problem.relPath === scope.relPath,
    );
    if (matched.length === 0) {
      closeProblemPanel();
      return;
    }
    /** @type {Map<string, ProblemDiag[]>} */
    const byFile = new Map();
    for (const problem of matched) {
      const bucket = byFile.get(problem.relPath);
      if (bucket) {
        bucket.push(problem);
      } else {
        byFile.set(problem.relPath, [problem]);
      }
    }
    const paths = [...byFile.keys()];
    const chrome = ensureMenuChrome(problemPanel);
    const scrollTop = chrome.scroller.scrollTop;
    chrome.scroller.replaceChildren();
    for (const relPath of paths) {
      const block = document.createElement('div');
      block.className = 'problem-file';
      for (const problem of byFile.get(relPath) || []) {
        block.append(problemMessageButton(problem));
      }
      block.append(problemFileLink(relPath, problemLinkLabel(relPath, paths)));
      chrome.scroller.append(block);
    }
    chrome.scroller.scrollTop = scrollTop;
    updateMenuScrollbar(problemPanel);
  }

  /**
   * Unique names stay bare. A shared basename becomes parent/file.
   * @param {string} relPath
   * @param {string[]} paths
   */
  function problemLinkLabel(relPath, paths) {
    const base = baseName(relPath);
    const collision = paths.some((other) => other !== relPath && baseName(other) === base);
    if (!collision) {
      return base;
    }
    const parent = parentName(relPath);
    return parent ? parent + '/' + base : base;
  }

  /** @param {string} relPath */
  function baseName(relPath) {
    const slash = relPath.lastIndexOf('/');
    return slash === -1 ? relPath : relPath.slice(slash + 1);
  }

  /** Immediate parent folder name. Empty at the workspace root. */
  function parentName(relPath) {
    const slash = relPath.lastIndexOf('/');
    if (slash === -1) {
      return '';
    }
    const parent = relPath.slice(0, slash);
    const slash2 = parent.lastIndexOf('/');
    return slash2 === -1 ? parent : parent.slice(slash2 + 1);
  }

  /** @param {ProblemDiag} problem */
  function problemMessageButton(problem) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'problem-message';
    button.textContent = problem.message;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      vscode.postMessage({
        type: 'openAt',
        relPath: problem.relPath,
        line: problem.line,
        character: problem.character,
        endLine: problem.endLine,
        endCharacter: problem.endCharacter,
      });
    });
    return button;
  }

  /** @param {string} relPath @param {string} label */
  function problemFileLink(relPath, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'problem-file-link';
    button.textContent = label;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      vscode.postMessage({ type: 'open', relPath });
    });
    return button;
  }

  function positionProblemPanel() {
    if (!problemPanelState) {
      return;
    }
    const anchor = problemPanelState.anchor;
    if (!anchor.isConnected) {
      closeProblemPanel();
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const pad = 4;
    ensureMenuChrome(problemPanel);
    problemPanel.style.visibility = 'hidden';
    problemPanel.hidden = false;
    problemPanel.style.maxHeight = '320px';
    problemPanel.style.width = 'auto';
    problemPanel.style.top = '0px';
    let left = Math.max(pad, rect.left);
    const rightEdge = window.innerWidth - pad;
    if (left > rightEdge - 1) {
      left = Math.max(pad, rightEdge - 1);
    }
    problemPanel.style.left = left + 'px';
    problemPanel.style.right = pad + 'px';
    let popH = problemPanel.offsetHeight || 40;
    const spaceBelow = window.innerHeight - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    const below = popH <= spaceBelow || spaceBelow >= spaceAbove;
    const space = Math.max(80, below ? spaceBelow : spaceAbove);
    problemPanel.style.maxHeight = Math.min(320, space) + 'px';
    popH = problemPanel.offsetHeight || popH;
    const top = below ? rect.bottom + pad : Math.max(pad, rect.top - popH - pad);
    problemPanel.style.top = top + 'px';
    problemPanel.style.visibility = '';
    updateMenuScrollbar(problemPanel);
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
      if (markTipTarget === mark) {
        hideMarkTip();
      }
      mark?.remove();
      return;
    }
    const corner = mark instanceof HTMLElement ? mark : document.createElement('span');
    if (!mark) {
      corner.className = 'tab-mark';
      node.prepend(corner);
    }
    corner.setAttribute('aria-label', t('markOpen'));
    corner.removeAttribute('title');
    corner.classList.toggle('tab-mark-live', live);
  }

  /** @param {HTMLElement} node @param {boolean} dirty */
  function setChangeCorner(node, dirty) {
    const mark = node.querySelector(':scope > .change-mark');
    if (!dirty) {
      if (markTipTarget === mark) {
        hideMarkTip();
      }
      mark?.remove();
      return;
    }
    if (mark instanceof HTMLElement) {
      mark.setAttribute('aria-label', t('markInProgress'));
      mark.removeAttribute('title');
      return;
    }
    const corner = document.createElement('span');
    corner.className = 'change-mark';
    corner.setAttribute('aria-label', t('markInProgress'));
    node.prepend(corner);
  }

  /** @param {EventTarget | null} target */
  function markFromTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    const mark = target.closest('.tab-mark, .change-mark');
    return mark instanceof HTMLElement ? mark : null;
  }

  /** @param {HTMLElement} mark */
  function markTipText(mark) {
    if (mark.classList.contains('change-mark')) {
      return t('markInProgress');
    }
    return t('markOpen');
  }

  /** @param {HTMLElement} mark @param {number} x @param {number} y */
  function scheduleMarkTip(mark, x, y) {
    if (markTipTarget === mark && !markTip.hidden) {
      placeMarkTip(x, y);
      return;
    }
    clearTimeout(markTipTimer);
    markTipTarget = mark;
    markTipTimer = setTimeout(() => {
      if (markTipTarget !== mark || !mark.isConnected) {
        return;
      }
      markTip.textContent = markTipText(mark);
      markTip.hidden = false;
      placeMarkTip(x, y);
    }, MARK_TIP_MS);
  }

  function hideMarkTip() {
    clearTimeout(markTipTimer);
    markTipTimer = 0;
    markTipTarget = null;
    markTip.hidden = true;
    markTip.textContent = '';
  }

  /**
   * Show group description under the name after a 2s hover. No tip when empty.
   * @param {HTMLElement} labelEl
   * @param {string | undefined} description
   */
  function bindGroupDescriptionTip(labelEl, description) {
    const text = typeof description === 'string' ? description.trim() : '';
    if (!text) {
      return;
    }
    labelEl.addEventListener('pointerenter', () => {
      scheduleGroupDescTip(labelEl, text);
    });
    labelEl.addEventListener('pointerleave', () => {
      if (groupDescTipTarget === labelEl) {
        hideGroupDescTip();
      }
    });
    labelEl.addEventListener('pointerdown', () => {
      if (groupDescTipTarget === labelEl) {
        hideGroupDescTip();
      }
    });
  }

  /**
   * @param {HTMLElement} labelEl
   * @param {string} text
   */
  function scheduleGroupDescTip(labelEl, text) {
    clearTimeout(groupDescTipTimer);
    groupDescTipTarget = labelEl;
    groupDescTipTimer = setTimeout(() => {
      if (groupDescTipTarget !== labelEl || !labelEl.isConnected) {
        return;
      }
      groupDescTip.textContent = text;
      groupDescTip.hidden = false;
      placeGroupDescTip(labelEl);
    }, GROUP_DESC_TIP_MS);
  }

  function hideGroupDescTip() {
    clearTimeout(groupDescTipTimer);
    groupDescTipTimer = 0;
    groupDescTipTarget = null;
    groupDescTip.hidden = true;
    groupDescTip.textContent = '';
  }

  /** @param {HTMLElement} anchor */
  function placeGroupDescTip(anchor) {
    const pad = 8;
    const gap = 6;
    groupDescTip.style.left = '0px';
    groupDescTip.style.top = '0px';
    const rect = anchor.getBoundingClientRect();
    const tipW = groupDescTip.offsetWidth || 160;
    const tipH = groupDescTip.offsetHeight || 40;
    let left = rect.left;
    if (left + tipW > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - tipW - pad);
    }
    if (left < pad) {
      left = pad;
    }
    let top = rect.bottom + gap;
    if (top + tipH > window.innerHeight - pad) {
      top = Math.max(pad, rect.top - tipH - gap);
    }
    groupDescTip.style.left = left + 'px';
    groupDescTip.style.top = top + 'px';
  }

  /** @param {number} x @param {number} y */
  function placeMarkTip(x, y) {
    const pad = 8;
    markTip.style.left = '0px';
    markTip.style.top = '0px';
    const tipW = markTip.offsetWidth || 80;
    const tipH = markTip.offsetHeight || 24;
    let left = x + 12;
    let top = y + 14;
    if (left + tipW > window.innerWidth - pad) {
      left = Math.max(pad, x - tipW - 12);
    }
    if (top + tipH > window.innerHeight - pad) {
      top = Math.max(pad, y - tipH - 8);
    }
    markTip.style.left = left + 'px';
    markTip.style.top = top + 'px';
  }

  document.addEventListener(
    'pointerover',
    (event) => {
      const mark = markFromTarget(event.target);
      if (!mark) {
        return;
      }
      if (event.relatedTarget instanceof Node && mark.contains(event.relatedTarget)) {
        return;
      }
      scheduleMarkTip(mark, event.clientX, event.clientY);
    },
    true,
  );
  document.addEventListener(
    'pointerout',
    (event) => {
      const mark = markFromTarget(event.target);
      if (!mark) {
        return;
      }
      if (event.relatedTarget instanceof Node && mark.contains(event.relatedTarget)) {
        return;
      }
      if (markTipTarget === mark) {
        hideMarkTip();
      }
    },
    true,
  );
  document.addEventListener(
    'pointermove',
    (event) => {
      if (!markTipTarget || markTip.hidden) {
        return;
      }
      if (markFromTarget(event.target) !== markTipTarget) {
        return;
      }
      placeMarkTip(event.clientX, event.clientY);
    },
    true,
  );

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

  /** @type {{ kind: 'marker' | 'note' | 'text' | 'link' | 'group-draft' | 'review', id?: string, pageId?: string, section?: HTMLElement } | null} */
  let colorTarget = null;

  colorInput.addEventListener('input', () => {
    if (colorTarget?.kind === 'text' || colorTarget?.kind === 'link' || colorTarget?.kind === 'group-draft') {
      return;
    }
    colorTarget?.section?.style.setProperty(
      '--group-color',
      pickerHex(colorInput.value, pendingPickerAlpha),
    );
  });
  colorInput.addEventListener('change', () => {
    const picked = pickerHex(colorInput.value, pendingPickerAlpha);
    pendingPickerAlpha = 100;
    if (colorTarget) {
      if (colorTarget.kind === 'text') {
        applyTextColor(picked);
        liveTextColorSpans = null;
      } else if (colorTarget.kind === 'group-draft' && openGroupPanel?.mode === 'create') {
        openGroupPanel.colorTouched = true;
        openGroupPanel.color = picked;
        mountGroupPanel();
      } else if (colorTarget.kind === 'link' && colorTarget.id) {
        vscode.postMessage({ type: 'updateLink', linkId: colorTarget.id, color: picked });
      } else if (colorTarget.kind === 'note' && colorTarget.id) {
        vscode.postMessage({ type: 'setColor', noteId: colorTarget.id, color: picked });
      } else if (colorTarget.kind === 'review' && colorTarget.id && colorTarget.pageId) {
        vscode.postMessage({
          type: 'reviewUpdateMr',
          pageId: colorTarget.pageId,
          messageId: colorTarget.id,
          color: picked,
        });
      } else if (colorTarget.id) {
        vscode.postMessage({ type: 'setColor', markerId: colorTarget.id, color: picked });
      }
    }
    colorTarget = null;
    if (activeNoteEdit) {
      const keep = savedNoteSelection ? savedNoteSelection.cloneRange() : null;
      markSyncDepth += 1;
      try {
        activeNoteEdit.input.focus();
        if (keep && activeNoteEdit.input.contains(keep.commonAncestorContainer)) {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(keep);
          rememberMarkCaret();
        }
      } catch {
        savedNoteSelection = null;
      } finally {
        markSyncDepth -= 1;
      }
    }
  });
  colorInput.addEventListener('blur', () => {
    window.setTimeout(() => {
      liveTextColorSpans = null;
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
    pendingPickerAlpha = 100;
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

  function errorGlyph() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon problem-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('clip-rule', 'evenodd');
    path.setAttribute(
      'd',
      'M21.5 6.5V17.5L12 23L2.5 17.5V6.5L12 1L21.5 6.5ZM12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10Z',
    );
    svg.append(path);
    return svg;
  }

  /** @param {'error' | 'warning' | 'info'} severity */
  function severityGlyph(severity) {
    if (severity === 'error') {
      const svg = errorGlyph();
      svg.setAttribute('class', 'icon problem-severity-icon severity-error');
      return svg;
    }
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute(
      'class',
      'icon problem-severity-icon severity-' + (severity === 'warning' ? 'warning' : 'info'),
    );
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', 'currentColor');
    if (severity === 'warning') {
      path.setAttribute(
        'd',
        'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
      );
    } else {
      path.setAttribute(
        'd',
        'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
      );
    }
    svg.append(path);
    return svg;
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

  const MAX_BADGE_ICONS = 3;

  /**
   * Fixed type glyph (group box / note bill). Click adds a badge when under the cap.
   * @param {'group' | 'note'} kind
   * @param {{ locked: boolean, badgeCount: number, onAdd: () => void, onLocked: () => void }} opts
   */
  function typeIconEl(kind, opts) {
    const wrap = el('span', 'type-icon' + (kind === 'note' ? ' type-icon-note' : ' type-icon-group'));
    const lightKey = kind === 'note' ? 'noteIconLight' : 'groupIconLight';
    const darkKey = kind === 'note' ? 'noteIconDark' : 'groupIconDark';
    const lightSrc = document.body.dataset[lightKey] || '';
    const darkSrc = document.body.dataset[darkKey] || '';
    if (lightSrc) {
      const light = document.createElement('img');
      light.className = 'type-glyph tone-light';
      light.draggable = false;
      light.src = lightSrc;
      light.alt = '';
      wrap.append(light);
    }
    if (darkSrc) {
      const dark = document.createElement('img');
      dark.className = 'type-glyph tone-dark';
      dark.draggable = false;
      dark.src = darkSrc;
      dark.alt = '';
      wrap.append(dark);
    }
    const canAdd = !opts.locked && opts.badgeCount < MAX_BADGE_ICONS;
    wrap.title = opts.locked
      ? kind === 'note'
        ? t('noteLocked')
        : t('groupLocked')
      : canAdd
        ? t('addIcon')
        : '';
    wrap.addEventListener('click', (event) => {
      event.stopPropagation();
      if (opts.locked) {
        opts.onLocked();
        return;
      }
      if (opts.badgeCount >= MAX_BADGE_ICONS) {
        return;
      }
      opts.onAdd();
    });
    return wrap;
  }

  /**
   * Badge emoji row to the right of the type icon. Click a badge to replace it or clear it.
   * @param {string[] | undefined} icons
   * @param {{ locked: boolean, onChange: (index: number) => void, onLocked: () => void }} opts
   */
  function badgeIconsEl(icons, opts) {
    const wrap = el('span', 'badge-icons');
    const list = Array.isArray(icons) ? icons.slice(0, MAX_BADGE_ICONS) : [];
    list.forEach((emoji, index) => {
      const badge = el('span', 'badge-icon', emoji);
      badge.title = opts.locked
        ? t('locked')
        : t('changeIcon');
      badge.addEventListener('click', (event) => {
        event.stopPropagation();
        if (opts.locked) {
          opts.onLocked();
          return;
        }
        opts.onChange(index);
      });
      wrap.append(badge);
    });
    return wrap;
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

  /**
   * 4px overlay for every scroller that is not the map window, a menu, or the link preview.
   * Those three already paint their own bar. Native scrollbars stay hidden in map.css.
   */
  const THIN_SCROLL_SELECTOR = [
    '.host-branch-list',
    '.review-create-page-panel',
    '.profile-settings-panel',
    '.discord-gate-panel',
    '.project-create-panel',
    '.review-mr-people',
    '.review-file-body',
    '.review-path-nav-list',
    '.link-panel',
    '.color-panel',
    '.dir-popover-list',
    '.toolbar-profile-list',
    '.syn3-neurofix-list',
    '.debug-column pre',
    '.debug-diff-scroll',
    'textarea.review-mr-title',
    '.note-input .note-code',
  ].join(',');

  /**
   * @typedef {{
   *   el: HTMLElement,
   *   vBar: HTMLElement,
   *   vThumb: HTMLElement,
   *   hBar: HTMLElement,
   *   hThumb: HTMLElement,
   *   key: string,
   *   z: string,
   *   borderTop: number,
   *   borderRight: number,
   *   borderBottom: number,
   *   borderLeft: number,
   * }} ThinScrollEntry
   */

  /** @type {Map<HTMLElement, ThinScrollEntry>} */
  const thinScrolls = new Map();
  let thinScrollFrame = 0;
  let thinScrollRestack = false;

  /** @param {boolean} [restack] */
  function scheduleThinScroll(restack) {
    if (restack) {
      thinScrollRestack = true;
    }
    if (thinScrollFrame) {
      return;
    }
    thinScrollFrame = requestAnimationFrame(() => {
      thinScrollFrame = 0;
      const restackNow = thinScrollRestack;
      thinScrollRestack = false;
      for (const entry of thinScrolls.values()) {
        placeThinScroll(entry, restackNow);
      }
    });
  }

  /** @param {HTMLElement} node */
  function overlayScrollZ(node) {
    let z = 40;
    let current = /** @type {HTMLElement | null} */ (node);
    while (current && current !== document.body) {
      const value = Number.parseInt(getComputedStyle(current).zIndex, 10);
      if (!Number.isNaN(value)) {
        z = Math.max(z, value);
      }
      current = current.parentElement;
    }
    return String(z + 1);
  }

  /** @param {HTMLElement} node */
  function thinScrollShown(node) {
    if (!node.isConnected) {
      return false;
    }
    let current = /** @type {HTMLElement | null} */ (node);
    while (current && current !== document.body) {
      if (current.hidden) {
        return false;
      }
      current = current.parentElement;
    }
    return true;
  }

  /**
   * @param {ThinScrollEntry} entry
   * @param {boolean} restack
   */
  function placeThinScroll(entry, restack) {
    const node = entry.el;
    if (!node.isConnected) {
      releaseThinScroll(node);
      return;
    }
    const shown = thinScrollShown(node);
    const rect = node.getBoundingClientRect();
    const maxY = node.scrollHeight - node.clientHeight;
    const maxX = node.scrollWidth - node.clientWidth;
    const key = [
      shown ? 1 : 0,
      Math.round(rect.top),
      Math.round(rect.left),
      Math.round(rect.right),
      Math.round(rect.bottom),
      node.scrollTop,
      node.scrollLeft,
      node.scrollHeight,
      node.scrollWidth,
      node.clientHeight,
      node.clientWidth,
    ].join(':');
    if (!restack && key === entry.key) {
      return;
    }
    entry.key = key;
    if (restack || !entry.z) {
      const style = getComputedStyle(node);
      entry.borderTop = Number.parseFloat(style.borderTopWidth) || 0;
      entry.borderRight = Number.parseFloat(style.borderRightWidth) || 0;
      entry.borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
      entry.borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
      entry.z = overlayScrollZ(node);
    }
    if (!shown || rect.width < 1 || rect.height < 1) {
      entry.vBar.hidden = true;
      entry.hBar.hidden = true;
      return;
    }
    const inset = 2;
    const gap = maxX > 1 && maxY > 1 ? 4 : 0;
    const trackTop = rect.top + entry.borderTop + inset;
    const trackHeight = Math.max(0, node.clientHeight - inset * 2 - gap);
    const trackLeft = rect.left + entry.borderLeft + inset;
    const trackWidth = Math.max(0, node.clientWidth - inset * 2 - gap);
    if (maxY <= 1 || trackHeight < 8) {
      entry.vBar.hidden = true;
    } else {
      entry.vBar.hidden = false;
      entry.vBar.style.zIndex = entry.z;
      entry.vBar.style.top = trackTop + 'px';
      entry.vBar.style.height = trackHeight + 'px';
      entry.vBar.style.left = rect.right - entry.borderRight - 4 + 'px';
      const thumbHeight = Math.max(16, Math.min(trackHeight, (node.clientHeight / node.scrollHeight) * trackHeight));
      const travel = Math.max(0, trackHeight - thumbHeight);
      entry.vThumb.style.height = thumbHeight + 'px';
      entry.vThumb.style.transform = 'translateY(' + (node.scrollTop / maxY) * travel + 'px)';
    }
    if (maxX <= 1 || trackWidth < 8) {
      entry.hBar.hidden = true;
    } else {
      entry.hBar.hidden = false;
      entry.hBar.style.zIndex = entry.z;
      entry.hBar.style.left = trackLeft + 'px';
      entry.hBar.style.width = trackWidth + 'px';
      entry.hBar.style.top = rect.bottom - entry.borderBottom - 4 + 'px';
      const thumbWidth = Math.max(16, Math.min(trackWidth, (node.clientWidth / node.scrollWidth) * trackWidth));
      const travel = Math.max(0, trackWidth - thumbWidth);
      entry.hThumb.style.width = thumbWidth + 'px';
      entry.hThumb.style.transform = 'translateX(' + (node.scrollLeft / maxX) * travel + 'px)';
    }
  }

  /** @param {HTMLElement} node */
  function releaseThinScroll(node) {
    const entry = thinScrolls.get(node);
    if (!entry) {
      return;
    }
    entry.vBar.remove();
    entry.hBar.remove();
    thinScrolls.delete(node);
  }

  /** @param {HTMLElement} node */
  function bindThinScroll(node) {
    if (thinScrolls.has(node) || node === document.documentElement || node === document.body) {
      return;
    }
    node.classList.add('syn3-thin-scroll');
    const vBar = el('div', 'syn3-overlay-scroll');
    vBar.hidden = true;
    const vThumb = el('div', 'syn3-overlay-scroll-thumb');
    vBar.append(vThumb);
    const hBar = el('div', 'syn3-overlay-scroll is-x');
    hBar.hidden = true;
    const hThumb = el('div', 'syn3-overlay-scroll-thumb');
    hBar.append(hThumb);
    document.body.append(vBar, hBar);
    const entry = {
      el: node,
      vBar,
      vThumb,
      hBar,
      hThumb,
      key: '',
      z: '',
      borderTop: 0,
      borderRight: 0,
      borderBottom: 0,
      borderLeft: 0,
    };
    thinScrolls.set(node, entry);
    placeThinScroll(entry, true);
  }

  /** @param {Node} node */
  function scanThinScroll(node) {
    if (!(node instanceof Element)) {
      return;
    }
    if (node instanceof HTMLElement && node.matches(THIN_SCROLL_SELECTOR)) {
      bindThinScroll(node);
    }
    for (const found of node.querySelectorAll(THIN_SCROLL_SELECTOR)) {
      if (found instanceof HTMLElement) {
        bindThinScroll(found);
      }
    }
  }

  /** @param {Node} node */
  function forgetThinScroll(node) {
    if (!(node instanceof Element)) {
      return;
    }
    if (node instanceof HTMLElement) {
      releaseThinScroll(node);
    }
    for (const found of node.querySelectorAll(THIN_SCROLL_SELECTOR)) {
      if (found instanceof HTMLElement) {
        releaseThinScroll(found);
      }
    }
  }

  function mountThinScroll() {
    scanThinScroll(document.body);
    new MutationObserver((records) => {
      let restack = false;
      for (const record of records) {
        const target = record.target;
        if (
          target instanceof HTMLElement &&
          (target.classList.contains('syn3-overlay-scroll') ||
            target.classList.contains('syn3-overlay-scroll-thumb'))
        ) {
          continue;
        }
        if (record.type === 'attributes') {
          restack = true;
        }
        for (const added of record.addedNodes) {
          scanThinScroll(added);
        }
        for (const removed of record.removedNodes) {
          forgetThinScroll(removed);
        }
      }
      scheduleThinScroll(restack);
    }).observe(document.body, {
      attributeFilter: ['hidden', 'class', 'style'],
      attributes: true,
      childList: true,
      subtree: true,
    });
    document.addEventListener(
      'input',
      (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && thinScrolls.has(target)) {
          scheduleThinScroll(false);
        }
      },
      true,
    );
    window.addEventListener('scroll', () => scheduleThinScroll(false), { passive: true, capture: true });
    window.addEventListener('resize', () => scheduleThinScroll(true));
  }

  const scrollbar = el('div', 'syn3-scrollbar');
  const scrollbarThumb = el('div', 'syn3-scrollbar-thumb');
  scrollbar.hidden = true;
  scrollbar.append(scrollbarThumb);
  document.body.append(scrollbar);

  /** Intended document offset. A page rebuild clamps scrollTop; this puts it back. */
  let heldScroll = 0;
  let suppressScrollTrack = false;
  let scrollTrackGen = 0;
  let scrollHold = 0;

  function docScroller() {
    return document.scrollingElement || document.documentElement;
  }

  function currentDocScroll() {
    return docScroller().scrollTop || 0;
  }

  /**
   * A short page clamps the offset. Keep the intended value unless something
   * actually moved the viewport (focus, a later user scroll).
   * @param {number} gen
   */
  function releaseScrollTrack(gen) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollTrackGen !== gen) {
          return;
        }
        suppressScrollTrack = false;
        const node = docScroller();
        const live = node.scrollTop || 0;
        const max = Math.max(0, node.scrollHeight - node.clientHeight);
        const clamped = live + 1 < heldScroll && live >= max - 1;
        if (!clamped) {
          heldScroll = live;
        }
      });
    });
  }

  /** @param {number} top */
  function applyDocScroll(top) {
    const gen = ++scrollTrackGen;
    suppressScrollTrack = true;
    heldScroll = top;
    const node = docScroller();
    if (Math.abs(node.scrollTop - top) > 0.5) {
      node.scrollTop = top;
    }
    releaseScrollTrack(gen);
  }

  /**
   * Replacing the map drops the document scroll. Keep the offset across that swap.
   * @param {() => void} mutate
   */
  function preservingPageScroll(mutate) {
    if (scrollHold > 0) {
      mutate();
      return heldScroll;
    }
    const live = currentDocScroll();
    const keep = heldScroll > live + 1 ? heldScroll : live;
    const gen = ++scrollTrackGen;
    suppressScrollTrack = true;
    scrollHold = 1;
    try {
      mutate();
    } finally {
      scrollHold = 0;
      heldScroll = keep;
      const node = docScroller();
      if (Math.abs(node.scrollTop - keep) > 0.5) {
        node.scrollTop = keep;
      }
      releaseScrollTrack(gen);
    }
    return keep;
  }

  /** Remember the offset before the pager DOM is replaced (that can drop scroll). */
  function armScrollKeep() {
    const live = currentDocScroll();
    if (!(heldScroll > live + 1)) {
      heldScroll = live;
    }
    const gen = ++scrollTrackGen;
    suppressScrollTrack = true;
    releaseScrollTrack(gen);
  }

  /**
   * The right-hand section stays on the first row while it fits.
   * Flex layout drops the whole section to the next row when it does not.
   * Menus of buttons on the left half of that row open inward.
   */
  function layoutToolbarExtra() {
    const bar = document.querySelector('.history-bar');
    const extra = bar?.querySelector(':scope > .toolbar-extra');
    if (!(bar instanceof HTMLElement) || !(extra instanceof HTMLElement)) {
      return;
    }
    const legacy = bar.querySelector(':scope > .toolbar-extra-row');
    if (legacy instanceof HTMLElement) {
      while (legacy.firstElementChild) {
        extra.appendChild(legacy.firstElementChild);
      }
      legacy.remove();
    }
    const anchor = [...bar.children].find(
      (node) =>
        node instanceof HTMLElement &&
        node !== extra &&
        !node.classList.contains('toolbar-spacer') &&
        !node.hidden &&
        node.getBoundingClientRect().width > 0,
    );
    const wrapped = anchor instanceof HTMLElement && extra.offsetTop > anchor.offsetTop + 1;
    const mid = bar.getBoundingClientRect().left + bar.clientWidth / 2;
    for (const node of extra.children) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      if (!wrapped || node.hidden) {
        node.classList.remove('menu-from-left');
        continue;
      }
      const rect = node.getBoundingClientRect();
      node.classList.toggle('menu-from-left', rect.width > 0 && rect.left + rect.width / 2 < mid);
    }
  }

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

  window.addEventListener(
    'scroll',
    () => {
      if (!suppressScrollTrack) {
        heldScroll = currentDocScroll();
      }
      updateScrollbar();
    },
    { passive: true },
  );
  function onViewportResize() {
    updateScrollbar();
    layoutToolbarExtra();
  }
  window.addEventListener('resize', onViewportResize);
  new ResizeObserver(onViewportResize).observe(document.body);
  const toolbarBar = document.querySelector('.history-bar');
  if (toolbarBar instanceof HTMLElement) {
    new MutationObserver(layoutToolbarExtra).observe(toolbarBar, {
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
  }
  onViewportResize();
  mountThinScroll();

  // HTML5 DnD blocks native wheel scrolling in the webview; scroll the map by hand.
  window.addEventListener(
    'wheel',
    (event) => {
      if (!document.body.classList.contains('is-dragging')) {
        return;
      }
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
        return;
      }
      event.preventDefault();
      window.scrollBy(0, event.deltaY);
    },
    { passive: false, capture: true },
  );

  /**
   * Pager chips in strip order: Syn3 pages, Debug, then Problems when enabled.
   * @returns {Array<{ kind: 'page', id: string } | { kind: 'debug' } | { kind: 'problems' }>}
   */
  function pagerSlots() {
    /** @type {Array<{ kind: 'page', id: string } | { kind: 'debug' } | { kind: 'problems' }>} */
    const slots = pages().map((page) => ({ kind: 'page', id: page.id }));
    slots.push({ kind: 'debug' });
    if (showProblemsTab()) {
      slots.push({ kind: 'problems' });
    }
    return slots;
  }

  function currentPagerIndex() {
    const slots = pagerSlots();
    if (isDebugPageOpen()) {
      return slots.findIndex((slot) => slot.kind === 'debug');
    }
    if (isProblemsPageOpen()) {
      return slots.findIndex((slot) => slot.kind === 'problems');
    }
    const pageId = uiState.activePageId;
    return slots.findIndex((slot) => slot.kind === 'page' && slot.id === pageId);
  }

  /** @param {{ kind: 'page', id: string } | { kind: 'debug' } | { kind: 'problems' }} slot */
  function goToPagerSlot(slot) {
    if (slot.kind === 'debug') {
      openDebugPage();
      return;
    }
    if (slot.kind === 'problems') {
      openProblemsPage();
      return;
    }
    setActivePage(slot.id);
  }

  function cyclePageScrollEnabled() {
    return data?.appearance?.cyclePageScroll !== false;
  }

  document.addEventListener(
    'wheel',
    (event) => {
      if (!data) {
        return;
      }
      const slots = pagerSlots();
      if (slots.length < 2) {
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
      const index = currentPagerIndex();
      if (index >= 0) {
        // Wheel up / clockwise → right (next chip). Same sign as shift+wheel deltaX.
        let next = event.deltaX < 0 ? index + 1 : index - 1;
        if (next < 0 || next >= slots.length) {
          if (cyclePageScrollEnabled()) {
            next = ((next % slots.length) + slots.length) % slots.length;
            goToPagerSlot(slots[next]);
          }
        } else {
          goToPagerSlot(slots[next]);
        }
      }
      window.setTimeout(() => {
        wheelLock = false;
      }, 320);
    },
    { passive: false },
  );

  initWorkspaceCloudButtons();
  // Unstyled buttons mean map.css never applied (service worker 404 on reload).
  const toolbarProbe = document.querySelector('.history-btn');
  const toolbarDisplay = toolbarProbe ? getComputedStyle(toolbarProbe).display : '';
  if (toolbarDisplay !== 'inline-flex') {
    vscode.postMessage({ type: 'assetsFailed', rev: bootRev });
  } else {
    vscode.postMessage({ type: 'ready', pageId: uiState.activePageId, rev: bootRev });
  }
})();
