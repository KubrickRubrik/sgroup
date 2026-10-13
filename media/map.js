// @ts-check
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  const root = /** @type {HTMLElement} */ (document.getElementById('root'));

  /** @type {{ collapsed: Record<string, boolean> }} */
  const uiState = vscode.getState() || { collapsed: {} };
  let data = null;

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'state') {
      data = message;
      render();
    } else if (message.type === 'active' && data) {
      data.active = message.active;
      updateActive(true);
    }
  });

  function render() {
    root.textContent = '';
    root.className = 'layout-' + data.layout;

    if (data.error) {
      root.append(el('div', 'error', data.error));
    }
    if (data.groups.length === 0) {
      root.append(el('div', 'empty', 'No markers yet. Right-click a file in the Explorer → "Mark…".'));
      return;
    }

    for (const group of data.groups) {
      root.append(renderGroup(group));
    }
    updateActive();
  }

  function renderGroup(group) {
    group.items.sort((a, b) => Number(b.isDir) - Number(a.isDir));
    const collapsed = !!uiState.collapsed[group.id];
    const section = el('section', 'group' + (collapsed ? ' collapsed' : ''));
    if (group.color) {
      section.style.setProperty('--group-color', group.color);
    }

    const header = el('div', 'group-header');
    setContext(header, { webviewSection: 'marker', markerId: group.id });
    const bar = el('span', 'bar');
    bar.title = 'Change color';
    bar.addEventListener('click', (event) => {
      event.stopPropagation();
      openColorPicker(group.id, bar, section);
    });
    header.append(el('span', 'chevron', '▾'), bar);
    if (group.icon) {
      header.append(el('span', 'group-icon', group.icon));
    }
    header.append(el('span', 'label', group.label));
    if (group.badge) {
      header.append(el('span', 'badge', group.badge));
    }
    header.append(el('span', 'count', String(group.items.length)));
    header.title = group.label;
    header.addEventListener('click', () => {
      uiState.collapsed[group.id] = !collapsed;
      vscode.setState(uiState);
      render();
    });
    section.append(header);

    if (collapsed) {
      const dots = el('div', 'dots');
      for (const item of group.items) {
        const dot = el('span', 'dot' + (item.exists ? '' : ' missing'));
        bindItem(dot, item, group.id);
        dots.append(dot);
      }
      section.append(dots);
      return section;
    }

    const items = el('div', 'items');
    for (const item of group.items) {
      items.append(renderItem(item, group.id));
    }
    section.append(items);
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
    const node = el('div', classes.join(' '));
    const name = data.layout === 'chips' && !item.isDir ? stripExtension(item.name) : item.name;
    node.append(item.isDir ? folderIcon() : fileIcon(item.name), el('span', 'name', name));
    if (data.layout === 'list' && item.dir) {
      node.append(el('span', 'path', item.dir));
    }
    bindItem(node, item, groupId);
    return node;
  }

  function bindItem(node, item, groupId) {
    node.dataset.rel = item.relPath;
    node.title = item.exists ? item.relPath + '\nClick: open · Alt+Click: reveal in Explorer' : item.relPath + '\nMissing';
    setContext(node, { webviewSection: item.exists ? 'item' : 'missing', markerId: groupId, relPath: item.relPath });
    node.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!item.exists) {
        return;
      }
      vscode.postMessage({ type: event.altKey ? 'reveal' : 'open', relPath: item.relPath });
    });
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
    return '#' + match.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
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
      ['path', { d: 'M1.5 3.5A1 1 0 0 1 2.5 2.5h3.6l1.5 1.5h5.9a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z', fill: FOLDER_COLOR }],
      ['path', { d: 'M1.5 5.5h13v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z', fill: FOLDER_COLOR, opacity: '0.85' }],
    ]);
  }

  function fileIcon(name) {
    const index = name.lastIndexOf('.');
    const ext = index > 0 ? name.slice(index + 1).toLowerCase() : '';
    const color = FILE_COLORS[ext] || DEFAULT_FILE_COLOR;
    return svgIcon('icon file-icon', [
      ['path', { d: 'M3.5 1.5h6l3 3v9.5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z', fill: color, 'fill-opacity': '0.22', stroke: color, 'stroke-width': '1' }],
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
