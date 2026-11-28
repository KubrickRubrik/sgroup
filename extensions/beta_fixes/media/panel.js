(function () {
  const vscode = acquireVsCodeApi();
  const boot = document.getElementById('boot');
  const auth = document.getElementById('auth');
  const keyInput = document.getElementById('key');
  const loginButton = document.getElementById('login');
  const loginSpin = document.getElementById('login-spin');
  const authError = document.getElementById('auth-error');
  const status = document.getElementById('status');
  const statusSpin = document.getElementById('status-spin');
  const statusText = document.getElementById('status-text');
  const listView = document.getElementById('list-view');
  const banner = document.getElementById('banner');
  const list = document.getElementById('list');
  const chips = document.getElementById('chips');
  const bar = document.getElementById('bar');
  const thumb = document.getElementById('thumb');

  let hasMore = false;
  let loading = false;
  let applying = false;
  let anchored = false;

  function hideAll() {
    boot.hidden = true;
    auth.hidden = true;
    status.hidden = true;
    listView.hidden = true;
  }

  function showAuth(error, busy) {
    hideAll();
    auth.hidden = false;
    loginButton.disabled = busy;
    keyInput.disabled = busy;
    loginSpin.hidden = !busy;
    authError.hidden = !error;
    authError.textContent = error || '';
  }

  function showStatus(text, spin) {
    hideAll();
    status.hidden = false;
    statusSpin.hidden = !spin;
    statusText.hidden = !text;
    statusText.textContent = text || '';
  }

  function chipElement(chip) {
    const element = document.createElement('div');
    element.className = 'chip';
    element.textContent = chip.text;
    return element;
  }

  function takeChips(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter((chip) => chip && typeof chip.id === 'string' && typeof chip.text === 'string');
  }

  function scrollToBottom() {
    applying = true;
    list.scrollTop = list.scrollHeight;
    applying = false;
    anchored = true;
  }

  function showChips(message) {
    hideAll();
    listView.hidden = false;
    banner.hidden = true;
    hasMore = message.hasMore === true;
    const incoming = takeChips(message.chips);
    if (message.mode === 'prepend') {
      applying = true;
      const previous = list.scrollHeight;
      const fragment = document.createDocumentFragment();
      incoming.forEach((chip) => fragment.appendChild(chipElement(chip)));
      chips.prepend(fragment);
      list.scrollTop += list.scrollHeight - previous;
      applying = false;
    } else {
      anchored = false;
      chips.replaceChildren();
      const fragment = document.createDocumentFragment();
      incoming.forEach((chip) => fragment.appendChild(chipElement(chip)));
      chips.append(fragment);
      requestAnimationFrame(() => {
        scrollToBottom();
        updateBar();
      });
    }
    loading = false;
    updateBar();
  }

  function showBanner(text) {
    loading = false;
    if (listView.hidden) {
      showStatus(text, false);
      return;
    }
    banner.hidden = !text;
    banner.textContent = text || '';
  }

  function updateBar() {
    const overflow = list.scrollHeight - list.clientHeight;
    if (overflow <= 1) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const paint = () => {
      const track = bar.clientHeight;
      if (track === 0) {
        return;
      }
      const thumbHeight = Math.max(16, (list.clientHeight / list.scrollHeight) * track);
      const maxTop = Math.max(0, track - thumbHeight);
      const top = (list.scrollTop / overflow) * maxTop;
      thumb.style.height = thumbHeight + 'px';
      thumb.style.transform = 'translateY(' + top + 'px)';
    };
    if (bar.clientHeight === 0) {
      requestAnimationFrame(paint);
      return;
    }
    paint();
  }

  loginButton.addEventListener('click', () => {
    if (loginButton.disabled) {
      return;
    }
    const key = keyInput.value.trim();
    if (!key) {
      showAuth('Неверный public KEY supabase', false);
      return;
    }
    showAuth('', true);
    vscode.postMessage({ type: 'login', key: key });
  });

  keyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      loginButton.click();
    }
  });

  list.addEventListener('scroll', () => {
    updateBar();
    if (applying || loading || !hasMore || !anchored) {
      return;
    }
    if (list.scrollHeight <= list.clientHeight) {
      return;
    }
    if (list.scrollTop <= 12) {
      loading = true;
      vscode.postMessage({ type: 'loadOlder' });
    }
  });

  window.addEventListener('resize', updateBar);

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message.type !== 'string') {
      return;
    }
    if (message.type === 'auth') {
      showAuth(typeof message.error === 'string' ? message.error : '', message.busy === true);
      return;
    }
    if (message.type === 'status') {
      showStatus(typeof message.text === 'string' ? message.text : '', message.spin === true);
      return;
    }
    if (message.type === 'chips') {
      showChips(message);
      return;
    }
    if (message.type === 'banner') {
      showBanner(typeof message.text === 'string' ? message.text : '');
      return;
    }
    if (message.type === 'idle') {
      loading = false;
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
