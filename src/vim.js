/* 리눅스 실습 터미널 — mini vim (vi / vim)
   API: LAB.cmd, LAB.fs.read/write/resolve, LAB.term.fullscreen/size, LAB.emit (scratchpad/linuxlab/API.md) */
(function (LAB) {
  if (!LAB) return;

  // ---------- 스타일 (style.css가 없어도 동작하도록) ----------
  try {
    if (!document.getElementById('vim-style')) {
      var st = document.createElement('style');
      st.id = 'vim-style';
      st.textContent =
        '.vim-root{position:relative;display:flex;flex-direction:column;height:100%;font:inherit;color:inherit;outline:none}' +
        '.vim-body{flex:1 1 auto;overflow:hidden}' +
        '.vim-line{white-space:pre;overflow:hidden;min-height:1.25em;tab-size:8}' +
        '.vim-tilde{color:#5e81f4}' +
        '.vim-num{color:#c4a000}' +
        '.vim-cursor{background:#d3d7cf;color:#300a24}' +
        '.vim-visual{background:#555753}' +
        '.vim-search{background:#c4a000;color:#000}' +
        '.vim-status{display:flex;white-space:pre;min-height:1.25em}' +
        '.vim-status .vim-msg{flex:1 1 auto;overflow:hidden}' +
        '.vim-status .vim-showcmd{flex:0 0 11ch;overflow:hidden}' +
        '.vim-status .vim-ruler{flex:0 0 18ch;overflow:hidden}' +
        '.vim-err{background:#cc0000;color:#fff}' +
        '.vim-mode{font-weight:bold}' +
        '.vim-more{color:#4e9a06}' +
        '.vim-ime{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;resize:none;overflow:hidden}';
      document.head.appendChild(st);
    }
  } catch (e) { /* 스타일 없이도 동작 */ }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function bytes(s) {
    try { return new TextEncoder().encode(s).length; } catch (e) { return s.length; }
  }
  function emit(d) { try { LAB.emit && LAB.emit('vim', d); } catch (e) { } }
  function toRe(pat, flags) {
    try { return new RegExp(pat, flags || ''); }
    catch (e) { return new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags || ''); }
  }

  function Vim(nameArg) {
    var V = this;
    V.name = nameArg || '';
    V.path = '';
    V.lines = [''];
    V.cy = 0; V.cx = 0; V.top = 0;
    V.mode = 'normal';
    V.cmdtype = ''; V.cmdbuf = '';
    V.msg = ''; V.msgErr = false; V.msgMode = false;
    V.more = null;           // 여러 줄 메시지 (:reg)
    V.modified = false; V.isNew = false; V.readonly = false;
    V.number = false;
    V.regs = {};
    V.pendReg = ''; V.count = ''; V.op = '';
    V.undo = []; V.redo = [];
    V.search = null;         // {pat, dir}
    V.vstart = 0;
    V.done = null;
    V.el = null;
    V.handled = new WeakSet();
  }

  // ---------- 파일 열기 / 저장 ----------
  Vim.prototype.open = function () {
    var V = this;
    if (!V.name) { V.msg = ''; emit({ type: 'open', path: '', isNew: true }); return; }
    var r = null;
    try { r = LAB.fs.resolve(V.name); } catch (e) { r = null; }
    V.path = (r && r.abs) || V.name;
    if (r && r.node && r.node.type === 'd') {
      V.msg = '"' + V.name + '" is a directory'; V.readonly = true;
      emit({ type: 'open', path: V.path, isNew: false, dir: true });
      return;
    }
    try {
      var text = LAB.fs.read(V.name);
      var ls = String(text).split('\n');
      if (ls.length > 1 && ls[ls.length - 1] === '') ls.pop();
      V.lines = ls.length ? ls : [''];
      var nl = text === '' ? 0 : V.lines.length;
      V.msg = '"' + V.name + '" ' + nl + 'L, ' + bytes(text) + 'B';
      emit({ type: 'open', path: V.path, isNew: false });
    } catch (e) {
      var code = e && e.code;
      if (code === 'EACCES') {
        V.msg = '"' + V.name + '" [Permission Denied]'; V.readonly = true;
      } else {
        V.isNew = true; V.msg = '"' + V.name + '" [New]';
      }
      emit({ type: 'open', path: V.path, isNew: V.isNew, denied: code === 'EACCES' });
    }
  };

  Vim.prototype.text = function () {
    if (this.lines.length === 1 && this.lines[0] === '') return '';
    return this.lines.join('\n') + '\n';
  };

  Vim.prototype.write = function (name, force) {
    var V = this;
    var target = name || V.name;
    if (!target) { V.err('E32: No file name'); return false; }
    var text = V.text();
    var wasNew = V.isNew || (name && name !== V.name);
    try {
      if (name && name !== V.name) {
        var r = null;
        try { r = LAB.fs.resolve(name); } catch (e) { r = null; }
        if (r && r.node && !force) { V.err('E13: File exists (add ! to override)'); return false; }
        wasNew = !(r && r.node);
      }
      LAB.fs.write(target, text, { append: false });
    } catch (e) {
      if (e && e.code === 'EISDIR') V.err('"' + target + '" is a directory');
      else V.err("E212: Can't open file for writing");
      return false;
    }
    var nl = text === '' ? 0 : V.lines.length;
    V.msg = '"' + target + '" ' + (wasNew ? '[New] ' : '') + nl + 'L, ' + bytes(text) + 'B written';
    V.msgErr = false;
    if (!V.name) V.name = target;
    if (target === V.name) { V.modified = false; V.isNew = false; }
    var abs = target;
    try { var rr = LAB.fs.resolve(target); abs = (rr && rr.abs) || target; } catch (e) { }
    emit({ type: 'write', path: abs, text: text, lines: V.lines.slice() });
    return true;
  };

  Vim.prototype.quit = function (force) {
    var V = this;
    if (V.modified && !force) { V.err('E37: No write since last change (add ! to override)'); return; }
    emit({ type: 'quit', path: V.path, saved: !V.modified, forced: !!force });
    V.finish();
  };

  Vim.prototype.finish = function () {
    var V = this;
    if (V._finished) return;
    V._finished = true;
    try { LAB.term.fullscreen(null); } catch (e) { }
    if (V.done) V.done(0);
  };

  Vim.prototype.err = function (m) { this.msg = m; this.msgErr = true; this.msgMode = false; };
  Vim.prototype.info = function (m) { this.msg = m; this.msgErr = false; this.msgMode = false; };

  // ---------- 편집 도우미 ----------
  Vim.prototype.snap = function () {
    this.undo.push({ lines: this.lines.slice(), cy: this.cy, cx: this.cx });
    if (this.undo.length > 200) this.undo.shift();
    this.redo = [];
  };
  Vim.prototype.changed = function () {
    if (!this.modified) { this.modified = true; }
  };
  Vim.prototype.clamp = function () {
    var V = this;
    if (V.cy < 0) V.cy = 0;
    if (V.cy > V.lines.length - 1) V.cy = V.lines.length - 1;
    var len = V.lines[V.cy].length;
    var max = V.mode === 'insert' ? len : Math.max(0, len - 1);
    if (V.cx > max) V.cx = max;
    if (V.cx < 0) V.cx = 0;
  };
  Vim.prototype.firstNB = function (y) {
    var m = /\S/.exec(this.lines[y] || '');
    return m ? m.index : 0;
  };
  Vim.prototype.setReg = function (val, kind) {
    var V = this, name = V.pendReg;
    V.pendReg = '';
    if (name && name !== '"') {
      if (/[A-Z]/.test(name)) {
        var low = name.toLowerCase(), old = V.regs[low];
        if (old) val = { lines: old.lines.concat(val.lines), linewise: old.linewise || val.linewise };
        name = low;
      }
      V.regs[name] = val;
    } else if (kind === 'yank') {
      V.regs['0'] = val;
    } else if (kind === 'delete' && val.linewise) {
      for (var i = 9; i > 1; i--) if (V.regs[String(i - 1)]) V.regs[String(i)] = V.regs[String(i - 1)];
      V.regs['1'] = val;
    } else if (kind === 'delete') {
      V.regs['-'] = val;
    }
    V.regs['"'] = val;
  };
  Vim.prototype.getReg = function () {
    var name = this.pendReg || '"';
    this.pendReg = '';
    return this.regs[name.toLowerCase()] || null;
  };
  Vim.prototype.report = function (n, word) {
    if (n >= 3) this.info(n + ' ' + word);
  };

  Vim.prototype.delLines = function (a, b) {
    var V = this;
    var cut = V.lines.slice(a, b + 1);
    V.lines.splice(a, b - a + 1);
    if (!V.lines.length) V.lines = [''];
    V.cy = Math.min(a, V.lines.length - 1);
    V.cx = V.firstNB(V.cy);
    V.changed();
    return cut;
  };
  Vim.prototype.putLines = function (after, val) {
    var V = this;
    var ins = val.lines.slice();
    if (V.lines.length === 1 && V.lines[0] === '' && !V.modified && V.isNew && after <= 0) {
      // 빈 새 파일: 그대로 넣기 (vim처럼 첫 줄 빈 줄은 남김)
    }
    V.lines.splice(after + 1, 0, ...ins);
    V.cy = after + 1;
    V.cx = V.firstNB(V.cy);
    V.changed();
    V.report(ins.length, 'more lines');
  };

  // ---------- 커서 이동 ----------
  Vim.prototype.wordFwd = function () {
    var V = this, y = V.cy, x = V.cx, line = V.lines[y];
    var re = /\w+|[^\w\s]+/g, m;
    re.lastIndex = 0;
    while ((m = re.exec(line))) { if (m.index > x) { V.cx = m.index; return; } }
    // 다음 줄
    while (y < V.lines.length - 1) {
      y++;
      var mm = /\S/.exec(V.lines[y]);
      if (mm || V.lines[y] === '') { V.cy = y; V.cx = mm ? mm.index : 0; return; }
    }
    V.cx = Math.max(0, line.length - 1);
  };
  Vim.prototype.wordBack = function () {
    var V = this, y = V.cy, x = V.cx;
    for (;;) {
      var line = V.lines[y], re = /\w+|[^\w\s]+/g, m, last = -1;
      while ((m = re.exec(line))) { if (m.index < x) last = m.index; else break; }
      if (last >= 0) { V.cy = y; V.cx = last; return; }
      if (y === 0) { V.cy = 0; V.cx = 0; return; }
      y--; x = Infinity;
    }
  };
  Vim.prototype.doSearch = function (dir, pat) {
    var V = this;
    if (pat === undefined) {
      if (!V.search) { V.err('E35: No previous regular expression'); return; }
      pat = V.search.pat;
      dir = V.search.dir * dir;
    } else {
      V.search = { pat: pat, dir: dir };
    }
    var re = toRe(pat, 'g');
    var n = V.lines.length, wrapped = false;
    for (var i = 0; i <= n; i++) {
      var y, line, found = -1, m;
      if (dir > 0) {
        y = (V.cy + i) % n;
        if (i > 0 && y === 0 && V.cy !== 0) wrapped = true;
        if (V.cy + i >= n) wrapped = true;
        line = V.lines[y];
        re.lastIndex = 0;
        while ((m = re.exec(line))) {
          if (i > 0 || m.index > V.cx) { found = m.index; break; }
          if (m[0] === '') re.lastIndex++;
        }
        if (i === n && found >= 0 && m && m.index > V.cx) found = -1;
      } else {
        y = ((V.cy - i) % n + n) % n;
        if (V.cy - i < 0) wrapped = true;
        line = V.lines[y];
        re.lastIndex = 0;
        while ((m = re.exec(line))) {
          if (i > 0 || m.index < V.cx) found = m.index; else break;
          if (m[0] === '') re.lastIndex++;
        }
      }
      if (found >= 0) {
        V.cy = y; V.cx = found;
        if (wrapped) V.err(dir > 0 ? 'search hit BOTTOM, continuing at TOP' : 'search hit TOP, continuing at BOTTOM');
        else V.info((dir > 0 ? '/' : '?') + pat);
        emit({ type: 'search', path: V.path, text: pat, found: true });
        return;
      }
    }
    V.err('E486: Pattern not found: ' + pat);
    emit({ type: 'search', path: V.path, text: pat, found: false });
  };

  // ---------- Ex 명령 ----------
  Vim.prototype.parseAddr = function (s) {
    var V = this;
    if (s === '.') return V.cy;
    if (s === '$') return V.lines.length - 1;
    if (/^\d+$/.test(s)) return parseInt(s, 10) - 1;
    return null;
  };
  Vim.prototype.ex = function (raw) {
    var V = this;
    emit({ type: 'cmd', path: V.path, text: raw });
    var s = raw.trim();
    if (!s) return;
    var a = null, b = null, m;
    if (s[0] === '%') { a = 0; b = V.lines.length - 1; s = s.slice(1); }
    else if ((m = /^([.$]|\d+)(?:,([.$]|\d+))?/.exec(s))) {
      a = V.parseAddr(m[1]); b = m[2] !== undefined ? V.parseAddr(m[2]) : a;
      s = s.slice(m[0].length);
    }
    var hasRange = a !== null;
    if (hasRange) {
      if (a < -1 || b < -1 || a > V.lines.length - 1 || b > V.lines.length - 1) {
        if (!(s === '' )) { V.err('E16: Invalid range'); return; }
      }
      if (b < a) { var t = a; a = b; b = t; }
    }
    s = s.trim();
    if (s === '') {
      if (hasRange) { V.cy = Math.max(0, Math.min(b, V.lines.length - 1)); V.cx = V.firstNB(V.cy); }
      return;
    }
    var cm = /^([a-zA-Z]+)(!?)\s*(.*)$/.exec(s);
    var name = cm ? cm[1] : s, bang = cm ? cm[2] === '!' : false, arg = cm ? cm[3].trim() : '';
    if (/^s(ubstitute)?$/.test(name) === false && s[0] === 's' && /^s\W/.test(s)) { name = 's'; arg = s.slice(1); }

    switch (name) {
      case 'w': case 'write':
        V.write(arg || '', bang); return;
      case 'q': case 'quit': case 'qa': case 'qall': case 'quita': case 'quitall':
        V.quit(bang); return;
      case 'wq': case 'x': case 'xit': case 'exit': case 'wqa': case 'xa': case 'wqall': case 'xall':
        if ((name === 'x' || name === 'xit' || name === 'xa') && !V.modified && !arg) { V.quit(true); return; }
        if (V.write(arg || '', bang)) V.quit(true);
        return;
      case 'set': case 'se':
        if (/^(nu|number)$/.test(arg)) V.number = true;
        else if (/^(nonu|nonumber)$/.test(arg)) V.number = false;
        else if (/^(nu!|number!|invnu|invnumber)$/.test(arg)) V.number = !V.number;
        else if (arg === '') V.info('  number' === '' ? '' : (V.number ? '  number' : '  nonumber'));
        else V.err('E518: Unknown option: ' + arg);
        return;
      case 'd': case 'de': case 'del': case 'delete': {
        if (!hasRange) { a = b = V.cy; }
        V.snap();
        var reg = /^[a-zA-Z0-9"]$/.test(arg) ? arg : '';
        V.pendReg = reg;
        var cut = V.delLines(a, b);
        V.setReg({ lines: cut, linewise: true }, 'delete');
        V.report(cut.length, 'fewer lines');
        return;
      }
      case 'y': case 'ya': case 'yank': {
        if (!hasRange) { a = b = V.cy; }
        V.pendReg = /^[a-zA-Z0-9"]$/.test(arg) ? arg : '';
        var ln = V.lines.slice(a, b + 1);
        V.setReg({ lines: ln, linewise: true }, 'yank');
        V.report(ln.length, 'lines yanked');
        return;
      }
      case 'pu': case 'put': {
        var after = hasRange ? b : V.cy;
        if (bang) after -= 1;
        V.pendReg = /^[a-zA-Z0-9"]$/.test(arg) ? arg : '';
        var val = V.getReg();
        if (!val) { V.err('E353: Nothing in register ' + (arg || '"')); return; }
        V.snap();
        V.putLines(after, { lines: val.lines, linewise: true });
        return;
      }
      case 'reg': case 'registers': case 'di': case 'display': {
        var keys = ['"', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '-'];
        var out = ['Type Name Content'];
        keys.forEach(function (k) {
          var r = V.regs[k];
          if (!r) return;
          if (arg && arg.indexOf(k) < 0) return;
          var c = r.lines.join('^J') + (r.linewise ? '^J' : '');
          out.push('  ' + (r.linewise ? 'l' : 'c') + '  "' + k + '   ' + c);
        });
        out.push('Press ENTER or type command to continue');
        V.more = out;
        emit({ type: 'registers', path: V.path, regs: JSON.parse(JSON.stringify(V.regs)) });
        return;
      }
      case 's': case 'substitute': {
        var sep = arg[0];
        if (!sep) { V.err('E35: No previous regular expression'); return; }
        var parts = arg.slice(1).split(sep);
        var pat = parts[0], rep = parts[1] !== undefined ? parts[1] : '', flags = parts[2] || '';
        if (!pat) { V.err('E35: No previous regular expression'); return; }
        if (!hasRange) { a = b = V.cy; }
        var re = toRe(pat, flags.indexOf('g') >= 0 ? 'g' : '');
        var cnt = 0, lnc = 0, lastY = -1;
        var before = V.lines.slice();
        for (var y = a; y <= b; y++) {
          var c2 = 0;
          var nl = V.lines[y].replace(re, function () { c2++; return rep.replace(/&/g, arguments[0]); });
          if (c2) { V.lines[y] = nl; cnt += c2; lnc++; lastY = y; }
        }
        if (!cnt) { V.err('E486: Pattern not found: ' + pat); return; }
        V.undo.push({ lines: before, cy: V.cy, cx: V.cx }); V.redo = [];
        V.cy = lastY; V.cx = V.firstNB(lastY); V.changed();
        V.search = { pat: pat, dir: 1 };
        if (lnc >= 3 || cnt >= 3) V.info(cnt + ' substitution' + (cnt > 1 ? 's' : '') + ' on ' + lnc + ' line' + (lnc > 1 ? 's' : ''));
        return;
      }
      case 'e': case 'edit':
        if (bang) {
          V.lines = ['']; V.modified = false; V.isNew = false;
          var keep = V.name; V.open(); V.name = keep;
        } else if (V.modified) V.err('E37: No write since last change (add ! to override)');
        else V.info('"' + V.name + '"');
        return;
      case 'h': case 'help':
        V.err('E149: Sorry, no help for ' + (arg || 'help.txt') + ' (실습용 vim)');
        return;
      default:
        V.err('E492: Not an editor command: ' + raw.trim());
    }
  };

  // ---------- 키 처리 ----------
  Vim.prototype.key = function (e) {
    var V = this;
    if (V._finished) return false;
    if (V.handled.has(e)) return true;
    V.handled.add(e);
    if (e.isComposing || e.keyCode === 229 || e.key === 'Process') return true; // IME 조합 중
    var k = e.key;
    if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta' || k === 'CapsLock' || k === 'HangulMode' || k === 'Hangul') return true;
    if (e.ctrlKey && (k === '[' || k === 'c' || k === 'C') && V.mode !== 'normal') k = 'Escape';
    try { e.preventDefault(); } catch (x) { }

    if (V.more) {
      V.more = null;
      if (k === ':' ) { V.mode = 'cmdline'; V.cmdtype = ':'; V.cmdbuf = ''; }
      V.draw(); return true;
    }
    var prevMode = V.mode;
    if (V.mode === 'insert') V.keyInsert(k, e);
    else if (V.mode === 'cmdline') V.keyCmd(k, e);
    else V.keyNormal(k, e);
    if (V._finished) return true;
    if (V.mode !== prevMode) emit({ type: 'mode', path: V.path, mode: V.mode });
    V.clamp();
    V.draw();
    return true;
  };

  Vim.prototype.insertText = function (t) {
    var V = this;
    var parts = String(t).split('\n');
    for (var i = 0; i < parts.length; i++) {
      if (i > 0) V.splitLine();
      var line = V.lines[V.cy];
      V.lines[V.cy] = line.slice(0, V.cx) + parts[i] + line.slice(V.cx);
      V.cx += parts[i].length;
    }
    V.changed();
  };
  Vim.prototype.splitLine = function () {
    var V = this, line = V.lines[V.cy];
    V.lines[V.cy] = line.slice(0, V.cx);
    V.lines.splice(V.cy + 1, 0, line.slice(V.cx));
    V.cy++; V.cx = 0;
  };

  Vim.prototype.keyInsert = function (k, e) {
    var V = this;
    if (k === 'Escape') { V.mode = 'normal'; V.cx = Math.max(0, V.cx - 1); V.info(''); return; }
    if (k === 'Enter') { V.splitLine(); V.changed(); return; }
    if (k === 'Backspace') {
      if (V.cx > 0) { var l = V.lines[V.cy]; V.lines[V.cy] = l.slice(0, V.cx - 1) + l.slice(V.cx); V.cx--; V.changed(); }
      else if (V.cy > 0) { var prev = V.lines[V.cy - 1]; V.cx = prev.length; V.lines[V.cy - 1] = prev + V.lines[V.cy]; V.lines.splice(V.cy, 1); V.cy--; V.changed(); }
      return;
    }
    if (k === 'Delete') {
      var ln = V.lines[V.cy];
      if (V.cx < ln.length) V.lines[V.cy] = ln.slice(0, V.cx) + ln.slice(V.cx + 1);
      else if (V.cy < V.lines.length - 1) { V.lines[V.cy] = ln + V.lines[V.cy + 1]; V.lines.splice(V.cy + 1, 1); }
      V.changed(); return;
    }
    if (k === 'ArrowLeft') { V.cx--; return; }
    if (k === 'ArrowRight') { V.cx++; return; }
    if (k === 'ArrowUp') { V.cy--; return; }
    if (k === 'ArrowDown') { V.cy++; return; }
    if (k === 'Home') { V.cx = 0; return; }
    if (k === 'End') { V.cx = V.lines[V.cy].length; return; }
    if (k === 'Tab') { V.insertText('\t'); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k.length === 1 || /^[가-힣ㄱ-ㆎ]+$/.test(k)) V.insertText(k);
  };

  Vim.prototype.keyCmd = function (k, e) {
    var V = this;
    if (k === 'Escape') { V.mode = 'normal'; V.cmdbuf = ''; V.info(''); return; }
    if (k === 'Backspace') {
      if (!V.cmdbuf) { V.mode = 'normal'; V.info(''); return; }
      V.cmdbuf = V.cmdbuf.slice(0, -1); return;
    }
    if (k === 'Enter') {
      var c = V.cmdbuf, t = V.cmdtype;
      V.mode = 'normal'; V.cmdbuf = ''; V.info('');
      if (t === ':') V.ex(c);
      else if (t === '/') V.doSearch(1, c || (V.search && V.search.pat) || '');
      else if (t === '?') V.doSearch(-1, c || (V.search && V.search.pat) || '');
      if (!V._finished && V.mode === 'normal' && V.lines.length) V.clamp();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k.length === 1 || /^[가-힣ㄱ-ㆎ]+$/.test(k)) V.cmdbuf += k;
  };

  Vim.prototype.enterInsert = function () {
    this.snap();
    this.mode = 'insert';
    this.msg = '-- INSERT --'; this.msgMode = true; this.msgErr = false;
  };

  Vim.prototype.keyNormal = function (k, e) {
    var V = this;
    var visual = V.mode === 'visual';
    // 대기 중인 연산
    if (V.op === '"') { V.pendReg = k; V.op = ''; return; }
    if (V.op === 'r') {
      V.op = '';
      if (k.length === 1 && V.lines[V.cy].length) {
        V.snap(); var l = V.lines[V.cy]; V.lines[V.cy] = l.slice(0, V.cx) + k + l.slice(V.cx + 1); V.changed();
      }
      V.count = ''; return;
    }
    if (e.ctrlKey && (k === 'c' || k === 'C')) {
      V.op = ''; V.count = ''; V.pendReg = '';
      if (visual) { V.mode = 'normal'; V.info(''); return; }
      V.info('Type  :qa!  and press <Enter> to abandon all changes and exit Vim'); return;
    }
    if (e.ctrlKey && (k === 'r' || k === 'R')) {
      if (!V.redo.length) { V.info('Already at newest change'); return; }
      V.undo.push({ lines: V.lines.slice(), cy: V.cy, cx: V.cx });
      var rr = V.redo.pop(); V.lines = rr.lines; V.cy = rr.cy; V.cx = rr.cx; V.modified = true;
      V.info('1 change; after #' + V.undo.length); return;
    }
    if (/^[0-9]$/.test(k) && !(k === '0' && !V.count) && !V.op) { V.count += k; return; }
    var n = parseInt(V.count || '1', 10);
    var hadCount = !!V.count;

    if (V.op === 'd' || V.op === 'y') {
      var op = V.op; V.op = ''; V.count = '';
      if (k === op) {
        var a = V.cy, b = Math.min(V.lines.length - 1, V.cy + n - 1);
        if (op === 'd') {
          V.snap(); var cut = V.delLines(a, b);
          V.setReg({ lines: cut, linewise: true }, 'delete'); V.report(cut.length, 'fewer lines');
        } else {
          V.setReg({ lines: V.lines.slice(a, b + 1), linewise: true }, 'yank'); V.report(b - a + 1, 'lines yanked');
        }
      } else if (op === 'd' && (k === 'w' || k === '$')) {
        V.snap(); var l2 = V.lines[V.cy], end;
        if (k === '$') end = l2.length;
        else { var mm = /^(\w+|[^\w\s]+)?\s*/.exec(l2.slice(V.cx)); end = V.cx + (mm ? mm[0].length || 1 : 1); }
        V.setReg({ lines: [l2.slice(V.cx, end)], linewise: false }, 'delete');
        V.lines[V.cy] = l2.slice(0, V.cx) + l2.slice(end); V.changed();
      } else if (op === 'y' && k === 'w') {
        var l3 = V.lines[V.cy], m3 = /^(\w+|[^\w\s]+)?\s*/.exec(l3.slice(V.cx));
        V.setReg({ lines: [l3.slice(V.cx, V.cx + (m3 ? m3[0].length || 1 : 1))], linewise: false }, 'yank');
      } else if ((op === 'd' && (k === 'j' || k === 'k' || k === 'G')) || (op === 'y' && (k === 'j' || k === 'k' || k === 'G'))) {
        var a2 = V.cy, b2 = k === 'j' ? Math.min(V.lines.length - 1, V.cy + n) : k === 'k' ? V.cy : V.lines.length - 1;
        if (k === 'k') a2 = Math.max(0, V.cy - n);
        if (op === 'd') { V.snap(); var c3 = V.delLines(a2, b2); V.setReg({ lines: c3, linewise: true }, 'delete'); V.report(c3.length, 'fewer lines'); }
        else { V.setReg({ lines: V.lines.slice(a2, b2 + 1), linewise: true }, 'yank'); V.report(b2 - a2 + 1, 'lines yanked'); }
      }
      V.pendReg = '';
      return;
    }
    if (V.op === 'g') {
      V.op = '';
      if (k === 'g') { V.cy = hadCount ? n - 1 : 0; V.cx = V.firstNB(V.cy); if (visual) { } }
      V.count = ''; return;
    }
    if (V.op === 'Z') {
      V.op = ''; V.count = '';
      if (k === 'Z') { if (V.modified) { if (V.write('', false)) V.quit(true); } else V.quit(true); }
      else if (k === 'Q') V.quit(true);
      return;
    }
    V.count = '';

    if (visual) {
      var va = Math.min(V.vstart, V.cy), vb = Math.max(V.vstart, V.cy);
      if (k === 'Escape' || k === 'V') { V.mode = 'normal'; V.info(''); return; }
      if (k === 'd' || k === 'x' || k === 'D' || k === 'X') {
        V.snap(); var cv = V.delLines(va, vb); V.setReg({ lines: cv, linewise: true }, 'delete');
        V.mode = 'normal'; V.info(''); V.report(cv.length, 'fewer lines'); return;
      }
      if (k === 'y' || k === 'Y') {
        V.setReg({ lines: V.lines.slice(va, vb + 1), linewise: true }, 'yank');
        V.mode = 'normal'; V.cy = va; V.info(''); V.report(vb - va + 1, 'lines yanked'); return;
      }
      if (k === ':') { V.mode = 'cmdline'; V.cmdtype = ':'; V.cmdbuf = "'<,'>"; V.cmdbuf = (va + 1) + ',' + (vb + 1); return; }
    }

    switch (k) {
      case 'h': case 'ArrowLeft': case 'Backspace': V.cx -= n; return;
      case 'l': case 'ArrowRight': case ' ': V.cx += n; return;
      case 'j': case 'ArrowDown': case 'Enter': V.cy += n; if (k === 'Enter') V.cx = V.firstNB(Math.min(V.cy, V.lines.length - 1)); return;
      case 'k': case 'ArrowUp': V.cy -= n; return;
      case '0': case 'Home': V.cx = 0; return;
      case '$': case 'End': V.cx = V.lines[V.cy].length; return;
      case '^': V.cx = V.firstNB(V.cy); return;
      case 'w': for (var i = 0; i < n; i++) V.wordFwd(); return;
      case 'b': for (var j = 0; j < n; j++) V.wordBack(); return;
      case 'G': V.cy = hadCount ? n - 1 : V.lines.length - 1; V.cx = V.firstNB(Math.min(V.cy, V.lines.length - 1)); return;
      case 'g': V.op = 'g'; if (hadCount) V.count = String(n); return;
      case 'Z': V.op = 'Z'; return;
      case '"': V.op = '"'; return;
      case 'd': V.op = 'd'; if (hadCount) V.count = String(n); return;
      case 'y': V.op = 'y'; if (hadCount) V.count = String(n); return;
      case 'r': V.op = 'r'; return;
      case 'Y': {
        var b4 = Math.min(V.lines.length - 1, V.cy + n - 1);
        V.setReg({ lines: V.lines.slice(V.cy, b4 + 1), linewise: true }, 'yank'); V.report(b4 - V.cy + 1, 'lines yanked'); return;
      }
      case 'x': case 'Delete': {
        var l5 = V.lines[V.cy]; if (!l5.length) return;
        V.snap(); var cutc = l5.slice(V.cx, V.cx + n);
        V.lines[V.cy] = l5.slice(0, V.cx) + l5.slice(V.cx + n); V.changed();
        V.setReg({ lines: [cutc], linewise: false }, 'delete'); return;
      }
      case 'X': {
        if (V.cx === 0) return;
        var l6 = V.lines[V.cy], st = Math.max(0, V.cx - n);
        V.snap(); V.setReg({ lines: [l6.slice(st, V.cx)], linewise: false }, 'delete');
        V.lines[V.cy] = l6.slice(0, st) + l6.slice(V.cx); V.cx = st; V.changed(); return;
      }
      case 'D': {
        var l7 = V.lines[V.cy]; V.snap();
        V.setReg({ lines: [l7.slice(V.cx)], linewise: false }, 'delete');
        V.lines[V.cy] = l7.slice(0, V.cx); V.cx--; V.changed(); return;
      }
      case 'C': {
        var l8 = V.lines[V.cy]; V.snap();
        V.setReg({ lines: [l8.slice(V.cx)], linewise: false }, 'delete');
        V.lines[V.cy] = l8.slice(0, V.cx); V.changed();
        V.mode = 'insert'; V.msg = '-- INSERT --'; V.msgMode = true; V.msgErr = false; return;
      }
      case 'J': {
        if (V.cy >= V.lines.length - 1) return;
        V.snap(); var a5 = V.lines[V.cy].replace(/\s+$/, ''), b5 = V.lines[V.cy + 1].replace(/^\s+/, '');
        V.cx = a5.length; V.lines[V.cy] = a5 + (b5 ? ' ' : '') + b5; V.lines.splice(V.cy + 1, 1); V.changed(); return;
      }
      case 'p': case 'P': {
        var val = V.getReg();
        if (!val) { V.err('E353: Nothing in register ' + (V.pendReg || '"')); return; }
        V.snap();
        if (val.linewise) {
          var all = [];
          for (var t = 0; t < n; t++) all = all.concat(val.lines);
          V.putLines(k === 'p' ? V.cy : V.cy - 1, { lines: all, linewise: true });
        } else {
          var txt = ''; for (var t2 = 0; t2 < n; t2++) txt += val.lines.join('\n');
          var l9 = V.lines[V.cy], pos = k === 'p' && l9.length ? V.cx + 1 : V.cx;
          V.lines[V.cy] = l9.slice(0, pos) + txt + l9.slice(pos);
          V.cx = pos + txt.length - 1; V.changed();
        }
        return;
      }
      case 'u': {
        if (!V.undo.length) { V.info('Already at oldest change'); return; }
        V.redo.push({ lines: V.lines.slice(), cy: V.cy, cx: V.cx });
        var u = V.undo.pop(); V.lines = u.lines; V.cy = u.cy; V.cx = u.cx;
        V.modified = V.undo.length > 0 || V.modified;
        V.info('1 change; before #' + (V.undo.length + 1)); return;
      }
      case 'i': V.enterInsert(); return;
      case 'I': V.cx = V.firstNB(V.cy); V.enterInsert(); return;
      case 'a': V.enterInsert(); if (V.lines[V.cy].length) V.cx++; return;
      case 'A': V.enterInsert(); V.cx = V.lines[V.cy].length; return;
      case 'o': V.snap(); V.lines.splice(V.cy + 1, 0, ''); V.cy++; V.cx = 0; V.changed(); V.mode = 'insert'; V.msg = '-- INSERT --'; V.msgMode = true; V.msgErr = false; return;
      case 'O': V.snap(); V.lines.splice(V.cy, 0, ''); V.cx = 0; V.changed(); V.mode = 'insert'; V.msg = '-- INSERT --'; V.msgMode = true; V.msgErr = false; return;
      case 'V': V.mode = 'visual'; V.vstart = V.cy; V.msg = '-- VISUAL LINE --'; V.msgMode = true; V.msgErr = false; return;
      case 'v': V.mode = 'visual'; V.vstart = V.cy; V.msg = '-- VISUAL LINE --'; V.msgMode = true; V.msgErr = false; return;
      case ':': V.mode = 'cmdline'; V.cmdtype = ':'; V.cmdbuf = ''; return;
      case '/': V.mode = 'cmdline'; V.cmdtype = '/'; V.cmdbuf = ''; return;
      case '?': V.mode = 'cmdline'; V.cmdtype = '?'; V.cmdbuf = ''; return;
      case 'n': for (var s1 = 0; s1 < n; s1++) V.doSearch(1); return;
      case 'N': for (var s2 = 0; s2 < n; s2++) V.doSearch(-1); return;
      case 'Escape': V.pendReg = ''; return;
    }
  };

  // ---------- 그리기 ----------
  Vim.prototype.size = function () {
    var s = null;
    try { s = LAB.term.size && LAB.term.size(); } catch (e) { s = null; }
    return { cols: (s && s.cols) || 80, rows: Math.max(4, (s && s.rows) || 24) };
  };

  Vim.prototype.render = function (el) {
    var V = this;
    if (el && el !== V.el) {
      V.el = el;
      el.innerHTML = '<div class="vim-root" tabindex="-1"><div class="vim-body"></div>' +
        '<div class="vim-status"><span class="vim-msg"></span><span class="vim-showcmd"></span><span class="vim-ruler"></span></div>' +
        '<textarea class="vim-ime" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></div>';
      V.ime = el.querySelector('.vim-ime');
      var root = el.querySelector('.vim-root');
      V.ime.addEventListener('keydown', function (ev) {
        if (V.key(ev)) { ev.stopPropagation(); }
      });
      V.ime.addEventListener('compositionend', function (ev) {
        var d = ev.data || '';
        V.ime.value = '';
        if (!d) return;
        if (V.mode === 'insert') { V.insertText(d); V.clamp(); V.draw(); }
        else if (V.mode === 'cmdline') { V.cmdbuf += d; V.draw(); }
      });
      V.ime.addEventListener('input', function (ev) {
        if (!ev.isComposing) V.ime.value = '';
      });
      root.addEventListener('mousedown', function (ev) { ev.preventDefault(); V.focus(); });
    }
    V.draw();
    V.focus();
  };
  Vim.prototype.focus = function () {
    try { if (this.ime) this.ime.focus({ preventScroll: true }); } catch (e) { }
  };

  Vim.prototype.draw = function () {
    var V = this;
    if (!V.el || V._finished) return;
    var body = V.el.querySelector('.vim-body'), stEl = V.el.querySelector('.vim-status');
    if (!body || !stEl) return;
    var sz = V.size(), rows = sz.rows - 1;
    V.clamp();
    if (V.cy < V.top) V.top = V.cy;
    if (V.cy >= V.top + rows) V.top = V.cy - rows + 1;
    var w = Math.max(3, String(V.lines.length).length);
    var hl = null;
    if (V.search && V.search.pat) { try { hl = toRe(V.search.pat, 'g'); } catch (e) { hl = null; } }
    var va = Math.min(V.vstart, V.cy), vb = Math.max(V.vstart, V.cy);
    var html = [];
    var screen = [];
    for (var r = 0; r < rows; r++) {
      var y = V.top + r;
      if (y >= V.lines.length) { screen.push('<div class="vim-line vim-tilde">~</div>'); continue; }
      var line = V.lines[y], out = '';
      var pre = V.number ? '<span class="vim-num">' + esc((' '.repeat(w) + (y + 1)).slice(-w) + ' ') + '</span>' : '';
      // 검색 강조 구간
      var marks = [];
      if (hl && V.mode !== 'insert') {
        hl.lastIndex = 0; var m;
        while ((m = hl.exec(line))) { if (!m[0]) { hl.lastIndex++; continue; } marks.push([m.index, m.index + m[0].length]); }
      }
      var cur = (y === V.cy && V.mode !== 'cmdline' && !V.more) ? V.cx : -1;
      var chars = Array.from ? line : line;
      for (var x = 0; x < line.length; x++) {
        var ch = esc(line[x]);
        var inM = marks.some(function (p) { return x >= p[0] && x < p[1]; });
        if (x === cur) out += '<span class="vim-cursor">' + ch + '</span>';
        else if (inM) out += '<span class="vim-search">' + ch + '</span>';
        else out += ch;
      }
      if (cur >= line.length) out += '<span class="vim-cursor"> </span>';
      var cls = 'vim-line' + (V.mode === 'visual' && y >= va && y <= vb ? ' vim-visual' : '');
      screen.push('<div class="' + cls + '">' + pre + out + '</div>');
    }
    if (V.more) {
      var mlines = V.more;
      var tail = mlines.slice(0, mlines.length - 1).map(function (t) { return '<div class="vim-line">' + esc(t) + '</div>'; });
      if (tail.length > rows) tail = tail.slice(tail.length - rows);
      var keep = rows - tail.length;
      screen = (keep > 0 ? screen.slice(screen.length - keep) : []).concat(tail);
      while (screen.length < rows) screen.unshift('<div class="vim-line vim-tilde">~</div>');
      body.innerHTML = screen.join('');
      stEl.querySelector('.vim-msg').innerHTML = '<span class="vim-more">' + esc(mlines[mlines.length - 1]) + '</span>';
      stEl.querySelector('.vim-showcmd').textContent = '';
      stEl.querySelector('.vim-ruler').textContent = '';
      return;
    }
    body.innerHTML = screen.join('');
    // 상태줄
    var msgEl = stEl.querySelector('.vim-msg');
    if (V.mode === 'cmdline') {
      msgEl.innerHTML = esc(V.cmdtype + V.cmdbuf) + '<span class="vim-cursor"> </span>';
    } else if (V.msgMode && (V.mode === 'insert' || V.mode === 'visual')) {
      msgEl.innerHTML = '<span class="vim-mode">' + esc(V.msg) + '</span>';
    } else if (V.msg) {
      msgEl.innerHTML = V.msgErr ? '<span class="vim-err">' + esc(V.msg) + '</span>' : esc(V.msg);
    } else msgEl.innerHTML = '';
    var sc = (V.pendReg ? '"' + V.pendReg : '') + (V.count || '') + (V.op && V.op !== '"' ? V.op : '') + (V.op === '"' ? '"' : '');
    stEl.querySelector('.vim-showcmd').textContent = sc;
    var pct;
    if (V.lines.length <= rows) pct = 'All';
    else if (V.top === 0) pct = 'Top';
    else if (V.top + rows >= V.lines.length) pct = 'Bot';
    else pct = Math.floor(V.top * 100 / (V.lines.length - rows)) + '%';
    var colTxt = V.lines[V.cy].length === 0 ? '0-1' : String(V.cx + 1);
    stEl.querySelector('.vim-ruler').textContent = V.mode === 'cmdline' ? '' : ((V.cy + 1) + ',' + colTxt + '            ').slice(0, 14) + pct;
  };

  // ---------- 명령 등록 ----------
  async function runVim(argv, io) {
    var files = argv.slice(1).filter(function (a) { return a[0] !== '-' && a[0] !== '+'; });
    var plus = argv.slice(1).filter(function (a) { return /^\+\d*$/.test(a); })[0];
    if (!LAB.term || !LAB.term.fullscreen) {
      io.err('vim: terminal does not support full-screen mode\n'); return 1;
    }
    var V = new Vim(files[0] || '');
    V.open();
    if (plus) { V.cy = plus === '+' ? V.lines.length - 1 : parseInt(plus.slice(1), 10) - 1; V.clamp(); }
    if (io && io.tty === false) { /* 실제 vim도 경고 후 실행 */ }
    return new Promise(function (resolve) {
      V.done = resolve;
      LAB.term.fullscreen({
        render: function (el) { V.render(el); },
        key: function (e) { return V.key(e); },
        exit: function () { if (!V._finished) { V._finished = true; emit({ type: 'quit', path: V.path, saved: !V.modified, forced: true }); resolve(0); } }
      });
    });
  }

  LAB.cmd('vim', runVim, { help: '화면 편집기 vim (i 입력, Esc 명령 모드, :wq 저장 후 종료, :q! 저장 없이 종료)' });
  LAB.cmd('vi', runVim, { help: 'vi 편집기 (이 실습에서는 vim과 같음)' });
})(window.LAB);
