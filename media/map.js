// @ts-check
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  const root = /** @type {HTMLElement} */ (document.getElementById('root'));
  const MIME = 'application/vnd.vgroup';
  const MAX_DEPTH = 2;

  /** @type {{ collapsed: Record<string, boolean> }} */
  const uiState = vscode.getState() || { collapsed: {} };
  let data = null;
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
      render();
    } else if (message.type === 'active' && data) {
      data.active = message.active;
      updateActive(true);
    } else if (message.type === 'dirListing') {
      fillDirPopover(message);
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!dirPopoverState) {
      return;
    }
    const target = /** @type {Node | null} */ (event.target);
    if (
      target &&
      (dirPopover.contains(target) || dirPopoverState.anchor.contains(target))
    ) {
      return;
    }
    closeDirPopover();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dirPopoverState) {
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
    root.textContent = '';
    root.className = 'layout-' + data.layout + ' groups-' + (data.groupsLayout || 'flow');
    clearDropHighlights();

    if (data.error) {
      root.append(el('div', 'error', data.error));
    }
    if (data.groups.length === 0) {
      root.append(
        el(
          'div',
          'empty',
          'No markers yet. Right-click a file in the Explorer → "Mark…", or drag files here onto a group.',
        ),
      );
      return;
    }

    const byId = Object.fromEntries(data.groups.map((g) => [g.id, g]));
    for (const group of data.groups.filter((g) => !g.parent)) {
      root.append(renderGroup(group, byId));
    }
    updateActive();
  }

  function renderGroup(group, byId) {
    group.items.sort((a, b) => Number(b.isDir) - Number(a.isDir));
    const childIds = group.children || [];
    const classList = group.classes || [];
    const isEmpty = group.items.length === 0 && childIds.length === 0 && classList.length === 0;
    const collapsed = !isEmpty && !!uiState.collapsed[group.id];
    const columns = group.columns || 'flow';
    const section = el(
      'section',
      'group columns-' +
        columns +
        (collapsed ? ' collapsed' : '') +
        (group.depth ? ' nested node' : '') +
        (isEmpty ? ' empty-group' : ''),
    );
    section.dataset.markerId = group.id;
    section.dataset.depth = String(group.depth || 0);
    section.dataset.label = group.label;
    if (group.color) {
      section.style.setProperty('--group-color', group.color);
    }

    const header = el('div', 'group-header');
    header.draggable = true;
    setContext(header, {
      webviewSection: 'marker',
      markerId: group.id,
      depth: group.depth || 0,
      canNest: (group.depth || 0) < MAX_DEPTH,
      columns,
      hasAlias: !!group.alias,
    });
    const bar = el('span', 'bar');
    bar.title = 'Change color';
    bar.addEventListener('click', (event) => {
      event.stopPropagation();
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
    if (group.badge) {
      header.append(el('span', 'badge', group.badge));
    }
    header.append(el('span', 'count', String(group.items.length + classList.length + childIds.length)));
    header.title =
      (group.alias ? group.alias + '\n' : '') + group.label + '\nDrag to reorder or nest';
    header.addEventListener('click', () => {
      if (isEmpty) {
        return;
      }
      uiState.collapsed[group.id] = !collapsed;
      vscode.setState(uiState);
      render();
    });
    section.append(header);
    bindGroupSection(section, header, group);

    if (isEmpty) {
      return section;
    }

    if (collapsed) {
      const dots = el('div', 'dots');
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
      section.append(dots);
      return section;
    }

    const children = el('div', 'children');
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
    for (const childId of childIds) {
      const child = byId[childId];
      if (child) {
        children.append(renderGroup(child, byId));
      }
    }
    if (children.childElementCount > 0) {
      section.append(children);
    }

    return section;
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
    const node = el('div', classes.join(' '));
    node.draggable = true;
    const name = data.layout === 'chips' && !item.isDir ? stripExtension(item.name) : item.name;
    const textWrap = el('span', 'item-text');
    if (item.alias) {
      textWrap.append(el('span', 'alias', item.alias));
    }
    textWrap.append(el('span', 'name', name));
    node.append(item.isDir ? folderIcon() : fileIcon(item.name), textWrap);
    if (data.layout === 'list' && item.dir) {
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
    const node = el('div', classes.join(' '));
    node.draggable = true;
    const textWrap = el('span', 'item-text');
    if (cls.alias) {
      textWrap.append(el('span', 'alias', cls.alias));
    }
    textWrap.append(el('span', 'name', cls.name));
    node.append(classIcon(), textWrap, el('span', 'path', cls.fileName));
    bindClass(node, cls, groupId);
    return node;
  }

  function bindItem(node, item, groupId) {
    node.dataset.rel = item.relPath;
    const aliasLine = item.alias ? item.alias + '\n' : '';
    const clickHint = item.isDir
      ? 'Click: list contents · Alt+Click: reveal in Explorer'
      : 'Click: open · Alt+Click: reveal in Explorer';
    node.title =
      aliasLine +
      (item.exists ? item.relPath + '\n' + clickHint : item.relPath + '\nMissing') +
      '\nDrag to another group · Alt+Drag to copy';
    setContext(node, {
      webviewSection: item.exists ? 'item' : 'missing',
      markerId: groupId,
      relPath: item.relPath,
      isDir: !!item.isDir,
      hasAlias: !!item.alias,
    });
    node.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!item.exists) {
        return;
      }
      if (item.isDir) {
        if (event.altKey) {
          closeDirPopover();
          vscode.postMessage({ type: 'reveal', relPath: item.relPath });
          return;
        }
        toggleDirPopover(node, item.relPath);
        return;
      }
      vscode.postMessage({ type: event.altKey ? 'reveal' : 'open', relPath: item.relPath });
    });
    node.addEventListener('dragstart', (event) => {
      event.stopPropagation();
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
    node.dataset.classId = cls.id;
    const aliasLine = cls.alias ? cls.alias + '\n' : '';
    node.title =
      aliasLine +
      cls.name +
      ' · ' +
      cls.relPath +
      (cls.line ? ':' + cls.line : '') +
      (cls.exists ? '\nClick: open at class' : '\nMissing file') +
      '\nDrag to another group · Alt+Drag to copy';
    setContext(node, {
      webviewSection: cls.exists ? 'class' : 'missingClass',
      markerId: groupId,
      classId: cls.id,
      relPath: cls.relPath,
      hasAlias: !!cls.alias,
    });
    node.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!cls.exists) {
        return;
      }
      vscode.postMessage({ type: 'openClass', classId: cls.id });
    });
    node.addEventListener('dragstart', (event) => {
      event.stopPropagation();
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
    if (payload && payload.kind === 'marker') {
      if (payload.id === group.id) {
        return null;
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

  vscode.postMessage({ type: 'ready' });
})();
