/* 리눅스 실습 터미널 — 명령어 구현 (출력·에러 문구는 CentOS Stream 10 coreutils/bash 기준) */
(function (LAB) {
  'use strict';
  const FS = LAB.fs, esc = LAB.esc, U = LAB.users;
  const S = () => LAB._S();
  const cmd = LAB.cmd;
  const q = s => `'${s}'`;          // coreutils 9 기본 따옴표(shell-escape)
  const lq = s => `‘${s}’`;         // mkdir 등 locale 따옴표
  const utf8len = s => new TextEncoder().encode(s).length;

  /* 옵션 파서: withArg = 값을 받는 옵션 글자들 */
  function getopt(argv, withArg, longMap) {
    const o = {}; const a = []; withArg = withArg || ''; longMap = longMap || {};
    let i = 1;
    for (; i < argv.length; i++) {
      const x = argv[i];
      if (x === '--') { i++; break; }
      if (x.startsWith('--') && x.length > 2) {
        const [k, v] = x.slice(2).split('=');
        if (longMap[k] !== undefined) { o[longMap[k]] = v === undefined ? true : v; continue; }
        o['--' + k] = v === undefined ? true : v; continue;
      }
      if (x[0] === '-' && x.length > 1 && !/^-\d/.test(x)) {
        for (let j = 1; j < x.length; j++) {
          const c = x[j];
          if (withArg.includes(c)) { o[c] = x.slice(j + 1) || argv[++i]; break; }
          o[c] = true;
        }
        continue;
      }
      a.push(x);
    }
    for (; i < argv.length; i++) a.push(argv[i]);
    return { o, a };
  }
  LAB.getopt = getopt;

  /* 권한 문자열 */
  function modeStr(n) {
    const t = { d: 'd', f: '-', l: 'l', p: 'p', c: 'c', b: 'b' }[n.type] || '-';
    const m = n.mode; let s = '';
    for (let k = 2; k >= 0; k--) {
      const r = (m >> (k * 3 + 2)) & 1, w = (m >> (k * 3 + 1)) & 1, x = (m >> (k * 3)) & 1;
      let xc = x ? 'x' : '-';
      if (k === 2 && (m & 0o4000)) xc = x ? 's' : 'S';
      if (k === 1 && (m & 0o2000)) xc = x ? 's' : 'S';
      if (k === 0 && (m & 0o1000)) xc = x ? 't' : 'T';
      s += (r ? 'r' : '-') + (w ? 'w' : '-') + xc;
    }
    return t + s;
  }
  LAB.modeStr = modeStr;
  function sizeOf(n) {
    if (n.type === 'd') { const ks = Object.keys(n.children); const v = 6 + ks.reduce((t, k) => t + utf8len(k) + 8, 0); return v > 330 ? 4096 : v; }
    if (n.type === 'l') return utf8len(n.target);
    if (n.type === 'p' || n.type === 'c' || n.type === 'b') return 0;
    return utf8len(FS.content(n));
  }
  function nlinks(n) { if (n.type === 'd') return 2 + Object.values(n.children).filter(c => c.type === 'd').length; return n.nlink || 1; }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function lsDate(ms) {
    const d = new Date(ms); const six = 1000 * 60 * 60 * 24 * 182;
    const day = String(d.getDate()).padStart(2, ' ');
    if (LAB.lang === 'ko') { const mo = (d.getMonth() + 1) + '월'; return Math.abs(Date.now() - ms) < six ? `${mo} ${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : `${mo} ${day}  ${d.getFullYear()}`; }
    if (Math.abs(Date.now() - ms) < six) return `${MON[d.getMonth()]} ${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${MON[d.getMonth()]} ${day}  ${d.getFullYear()}`;
  }
  function colorClass(n, name) {
    if (n.type === 'd') return n.mode & 0o1000 && n.mode & 0o002 ? 'c-tw' : 'c-dir';
    if (n.type === 'l') return 'c-ln';
    if (n.type === 'p') return 'c-pipe';
    if (n.type === 'c' || n.type === 'b') return 'c-dev';
    if (n.mode & 0o111) return 'c-exe';
    return '';
  }
  const sortKey = s => s.replace(/^[.]+/, '').toLowerCase();
  const byName = (a, b) => { const x = sortKey(a), y = sortKey(b); return x < y ? -1 : x > y ? 1 : (a < b ? -1 : a > b ? 1 : 0); };

  /* ======================= ls ======================= */
  cmd('ls', async (argv, io) => {
    const { o, a } = getopt(argv, '', { all: 'a', 'almost-all': 'A', directory: 'd', recursive: 'R', classify: 'F', color: 'color', 'human-readable': 'h', inode: 'i' });
    const sh = io.sh; const targets = a.length ? a : ['.'];
    const long = o.l || o.n || o.g; const color = io.toTerm;
    const files = [], dirs = []; let code = 0;
    for (const t of targets) {
      const r = FS.resolve(t, { nofollow: !!(long || o.d) && !t.endsWith('/') }, sh);
      if (!r.node) {
        if (r.err === 'EACCES') io.err(`ls: cannot access ${q(t)}: Permission denied\n`); else io.err(`ls: cannot access ${q(t)}: ${LAB.errMsg(r.err === 'ENOTDIR' ? 'ENOTDIR' : 'ENOENT')}\n`);
        code = 2; continue;
      }
      let n = r.node;
      if (n.type === 'l' && !long && !o.d) { const rr = FS.resolve(t, {}, sh); if (rr.node) n = rr.node; }
      if (n.type === 'd' && !o.d) dirs.push({ name: t, node: n, abs: r.abs }); else files.push({ name: t, node: r.node });
    }
    const timeOf = n => (o.u ? n.atime : o.c ? n.ctime : n.mtime);
    const sortEntries = arr => {
      arr.sort((x, y) => byName(x.name, y.name));
      if (o.t || (o.u && !long)) arr.sort((x, y) => timeOf(y.node) - timeOf(x.node));
      if (o.S) arr.sort((x, y) => sizeOf(y.node) - sizeOf(x.node));
      if (o.r) arr.reverse();
      return arr;
    };
    const decorate = (e) => {
      let nm = e.name; let cls = color ? colorClass(e.node, nm) : '';
      let suffix = '';
      if (o.F) suffix = e.node.type === 'd' ? '/' : e.node.type === 'l' ? '@' : e.node.type === 'p' ? '|' : (e.node.mode & 0o111 && e.node.type === 'f') ? '*' : '';
      if (o.p && e.node.type === 'd') suffix = '/';
      return { plain: nm + suffix, html: (cls ? `<span class="${cls}">${esc(nm)}</span>` : esc(nm)) + esc(suffix), w: [...(nm + suffix)].reduce((s, ch) => s + (ch.charCodeAt(0) > 0x1100 ? 2 : 1), 0) };
    };
    const printLong = (arr, withTotal) => {
      if (withTotal) {
        const tot = arr.reduce((s, e) => s + (e.node.type === 'd' ? (sizeOf(e.node) >= 4096 ? 4 : 0) : e.node.type === 'f' ? Math.ceil(sizeOf(e.node) / 4096) * 4 : 0), 0);
        io.out(`total ${tot}\n`);
      }
      const rows = arr.map(e => {
        const n = e.node;
        const owner = o.n ? String(n.uid) : U.byUid(n.uid); const group = o.n ? String(n.gid) : U.groupByGid(n.gid);
        let size = n.type === 'c' || n.type === 'b' ? (n.type === 'b' ? '8, 0' : '1, 3') : String(sizeOf(n));
        if (o.h && n.type !== 'c' && n.type !== 'b') { const v = sizeOf(n); size = v >= 1024 ? (v / 1024).toFixed(v < 10240 ? 1 : 0).replace(/\.0$/, '') + 'K' : String(v); }
        const d = decorate(e);
        let name = d.html, plainName = d.plain;
        if (n.type === 'l') { name += ' -&gt; ' + esc(n.target); plainName += ' -> ' + n.target; }
        return { ino: String(n.ino), perm: modeStr(n) + '.', links: String(nlinks(n)), owner, group, size, date: lsDate(timeOf(n)), name, plainName };
      });
      const W = k => Math.max(...rows.map(r => r[k].length), 0);
      const wi = W('ino'), wl = W('links'), wo = W('owner'), wg = W('group'), ws = W('size');
      rows.forEach(r => {
        const pre = (o.i ? r.ino.padStart(wi) + ' ' : '') + `${r.perm} ${r.links.padStart(wl)} ${o.g ? '' : r.owner.padEnd(wo) + ' '}${r.group.padEnd(wg)} ${r.size.padStart(ws)} ${r.date} `;
        io.outHTML(esc(pre) + r.name + '\n', pre + r.plainName + '\n');
      });
    };
    const printShort = arr => {
      if (!arr.length) return;
      const items = arr.map(decorate);
      if (!io.toTerm || o['1']) { items.forEach(it => io.outHTML(it.html + '\n', it.plain + '\n')); return; }
      const cols = LAB.term.size().cols;
      let ncol = items.length, colW = [];
      for (; ncol > 1; ncol--) {
        const nrow = Math.ceil(items.length / ncol);
        colW = []; for (let c = 0; c < ncol; c++) colW.push(Math.max(0, ...items.slice(c * nrow, c * nrow + nrow).map(it => it.w)));
        if (colW.reduce((s, w) => s + w + 2, 0) - 2 <= cols) break;
      }
      const nrow = Math.ceil(items.length / ncol);
      if (ncol === 1) colW = [0];
      for (let r = 0; r < nrow; r++) {
        let html = '', plain = '';
        for (let c = 0; c < ncol; c++) {
          const it = items[c * nrow + r]; if (!it) continue;
          const last = c === ncol - 1 || !items[(c + 1) * nrow + r];
          const pad = last ? '' : ' '.repeat(colW[c] - it.w + 2);
          html += it.html + pad; plain += it.plain + pad;
        }
        io.outHTML(html + '\n', plain + '\n');
      }
    };
    const entriesOf = (dirNode, dirPath) => {
      const names = Object.keys(dirNode.children).filter(n => o.a || o.f || (o.A ? true : !n.startsWith('.')));
      const arr = names.map(n => ({ name: n, node: dirNode.children[n] }));
      if (o.a || o.f) { arr.push({ name: '.', node: dirNode }); const up = FS.resolve((dirPath === '/' ? '' : dirPath.replace(/\/$/, '')) + '/..', {}, sh).node || dirNode; arr.push({ name: '..', node: up }); }
      return sortEntries(arr);
    };
    sortEntries(files);
    if (files.length) { if (long) printLong(files, false); else printShort(files); }
    const many = targets.length > 1 || o.R;
    sortEntries(dirs);
    const walk = (d, first) => {
      if (!FS.can(d.node, 'r', sh)) { io.err(`ls: cannot open directory ${q(d.name)}: Permission denied\n`); code = 2; return; }
      if (many) io.out((first && !files.length ? '' : '\n') + d.name + ':\n');
      d.node.atime = Date.now();
      const arr = entriesOf(d.node, d.name);
      if (long) printLong(arr, true); else printShort(arr);
      if (o.R) arr.filter(e => e.node.type === 'd' && e.name !== '.' && e.name !== '..').forEach(e => walk({ name: (d.name === '/' ? '' : d.name.replace(/\/$/, '')) + '/' + e.name, node: e.node }, false));
    };
    dirs.forEach((d, i) => walk(d, i === 0));
    return code;
  }, { help: '디렉토리 내용 보기 (-l 자세히, -a 숨김 포함, -d 디렉토리 자체, -R 하위까지, -F 종류 표시, -u 접근 시간)' });

  /* ======================= 디렉토리 ======================= */
  cmd('pwd', async (argv, io) => { io.out(io.sh.cwd + '\n'); return 0; }, { help: '현재 작업 디렉토리 출력' });
  cmd('cd', async (argv, io) => {
    const sh = io.sh; const a = argv.slice(1).filter(x => x !== '-L' && x !== '-P');
    if (a.length > 1) { io.err('bash: cd: too many arguments\n'); return 1; }
    let t = a[0];
    if (t === undefined) t = sh.home();
    if (t === '-') { t = sh.proc.oldpwd; if (!t) { io.err('bash: cd: OLDPWD not set\n'); return 1; } io.out(t + '\n'); }
    const r = FS.resolve(t, {}, sh);
    if (!r.node) { io.err(`bash: cd: ${a[0] === undefined ? t : a[0]}: ${LAB.errMsg(r.err === 'EACCES' ? 'EACCES' : r.err === 'ENOTDIR' ? 'ENOTDIR' : 'ENOENT')}\n`); return 1; }
    if (r.node.type !== 'd') { io.err(`bash: cd: ${t}: Not a directory\n`); return 1; }
    if (!FS.can(r.node, 'x', sh)) { io.err(`bash: cd: ${t}: Permission denied\n`); return 1; }
    sh.cwd = r.abs; return 0;
  }, { help: '디렉토리 이동 (인자 없으면 홈, - 이전 위치, .. 상위)' });

  cmd('mkdir', async (argv, io) => {
    const { o, a } = getopt(argv, 'm', { parents: 'p', verbose: 'v', mode: 'm' });
    if (!a.length) { io.err("mkdir: missing operand\nTry 'mkdir --help' for more information.\n"); return 1; }
    let code = 0; const sh = io.sh;
    const mode = o.m ? parseInt(o.m, 8) : null;
    for (const t of a) {
      if (o.p) {
        const abs = FS.abs(t, sh); const parts = abs.split('/').filter(Boolean); let cur = '';
        for (let i = 0; i < parts.length; i++) {
          cur += '/' + parts[i]; const r = FS.resolve(cur, {}, sh);
          if (r.node) { if (r.node.type !== 'd') { io.err(`mkdir: cannot create directory ${lq(t)}: Not a directory\n`); code = 1; break; } continue; }
          try { FS.create(cur, 'd', sh, i === parts.length - 1 ? mode : null); if (o.v) io.out(`mkdir: created directory ${q(cur.replace(FS.abs('.', sh) + '/', ''))}\n`); }
          catch (e) { io.err(`mkdir: cannot create directory ${lq(t)}: ${LAB.errMsg(e.code)}\n`); code = 1; break; }
        }
        continue;
      }
      try { FS.create(t, 'd', sh, mode); if (o.v) io.out(`mkdir: created directory ${q(t)}\n`); }
      catch (e) { io.err(`mkdir: cannot create directory ${lq(t)}: ${LAB.errMsg(e.code)}\n`); code = 1; }
    }
    return code;
  }, { help: '디렉토리 만들기 (-p 중간 디렉토리까지)' });

  cmd('rmdir', async (argv, io) => {
    const { o, a } = getopt(argv, '', { parents: 'p' });
    if (!a.length) { io.err("rmdir: missing operand\nTry 'rmdir --help' for more information.\n"); return 1; }
    let code = 0; const sh = io.sh;
    const one = t => {
      const r = FS.resolve(t, { nofollow: true }, sh);
      if (!r.node) { io.err(`rmdir: failed to remove ${q(t)}: ${LAB.errMsg(r.err === 'EACCES' ? 'EACCES' : 'ENOENT')}\n`); return false; }
      if (r.node.type !== 'd') { io.err(`rmdir: failed to remove ${q(t)}: Not a directory\n`); return false; }
      if (Object.keys(r.node.children).length) { io.err(`rmdir: failed to remove ${q(t)}: Directory not empty\n`); return false; }
      if (r.abs === sh.cwd || sh.cwd.startsWith(r.abs + '/')) { /* 실제 리눅스는 현재 디렉토리도 지울 수 있음 */ }
      if (!FS.can(r.parent, 'w', sh)) { io.err(`rmdir: failed to remove ${q(t)}: Permission denied\n`); return false; }
      FS.unlink(r); return true;
    };
    for (const t of a) {
      if (!one(t)) { code = 1; continue; }
      if (o.p) { let p = t.replace(/\/+$/, ''); while (p.includes('/')) { p = p.slice(0, p.lastIndexOf('/')); if (!p || !one(p)) break; } }
    }
    return code;
  }, { help: '빈 디렉토리 삭제' });

  /* ======================= 파일 보기 ======================= */
  async function readArg(t, io, name) {
    const sh = io.sh;
    if (t === '-' ) return io.stdin != null ? io.stdin : '';
    const r = FS.resolve(t, {}, sh);
    if (r.node && r.node.type === 'p') {
      if (!FS.can(r.node, 'r', sh)) throw { code: 'EACCES' };
      let got = null; LAB.fifoRead(r.node).then(x => { got = x; });
      while (got === null && !io.aborted) await LAB.sleep(80);
      if (got === null) { LAB.fifoCancel(r.node); return null; }
      return got;
    }
    return FS.read(t, sh);
  }
  cmd('cat', async (argv, io) => {
    const { o, a } = getopt(argv, '', { number: 'n', 'number-nonblank': 'b', 'squeeze-blank': 's', 'show-tabs': 'T', 'show-ends': 'E', 'show-all': 'A', 'show-nonprinting': 'v' });
    if (o.A) { o.v = o.E = o.T = true; }
    let lineNo = 1; let code = 0; let prevBlank = false;
    const fmt = text => {
      let lines = text.split('\n'); const endsNl = text.endsWith('\n'); if (endsNl) lines.pop();
      let out = '';
      lines.forEach((ln, i) => {
        const blank = ln === '';
        if (o.s && blank && prevBlank) return; prevBlank = blank;
        let s = ln;
        if (o.T) s = s.replace(/\t/g, '^I');
        if (o.v) s = s.replace(/[\x00-\x08\x0b-\x1f]/g, c => '^' + String.fromCharCode(c.charCodeAt(0) + 64)).replace(/\x7f/g, '^?');
        if (o.E) s += '$';
        if (o.b ? !blank : o.n) s = String(lineNo++).padStart(6) + '\t' + s;
        out += s + (i < lines.length - 1 || endsNl ? '\n' : '');
      });
      return out;
    };
    const files = a.length ? a : ['-'];
    for (const t of files) {
      if (t === '-' && io.stdin == null) {
        // 키보드에서 읽기 (Ctrl+D 로 끝, Ctrl+Z 중지)
        const tab = io.tab;
        tab.onStop = () => { const r = tab.read; if (r) { tab.read = null; r.res('\u001a'); LAB.renderInput(); } };
        while (true) {
          const ln = await io.readLine({ prompt: '' });
          if (ln === null) { code = 130; break; }
          if (ln === '\u0004') break;
          if (ln === '\u001a') {
            const line = argv.join(' ') + (io.redir && io.redir.outFile ? (io.redir.outAppend ? ' >> ' : ' > ') + io.redir.outFile : '');
            LAB.term.print('^Z\n');
            tab.stopped = { display: line, resume: io.redir && io.redir.outFile ? `cat >> ${io.redir.outFile}` : 'cat' };
            LAB.term.print(`[1]+  Stopped                 ${line}\n`);
            code = 148; break;
          }
          io.out(fmt(ln + '\n'));
        }
        tab.onStop = null;
        continue;
      }
      try {
        const text = await readArg(t, io);
        if (text === null) { code = 130; break; }
        io.out(fmt(text));
      } catch (e) { io.err(`cat: ${t}: ${LAB.errMsg(e.code)}\n`); code = 1; }
    }
    return code;
  }, { help: '파일 내용 출력 (cat > 파일: 키보드로 작성, Ctrl+D 저장) -n 줄 번호' });

  function headTail(isTail) {
    return async (argv, io) => {
      const name = isTail ? 'tail' : 'head';
      const a2 = argv.map(x => (/^-\d+$/.test(x) ? '-n' + x.slice(1) : x));
      const { o, a } = getopt(a2, 'nc', { lines: 'n', bytes: 'c', quiet: 'q', verbose: 'v', follow: 'f' });
      const files = a.length ? a : ['-'];
      let n = 10, fromStart = false;
      if (o.n !== undefined) { const v = String(o.n); if (isTail && v.startsWith('+')) { fromStart = true; n = parseInt(v.slice(1), 10); } else n = Math.abs(parseInt(v, 10)); if (isNaN(n)) { io.err(`${name}: invalid number of lines: ${q(o.n)}\n`); return 1; } }
      const bytes = o.c !== undefined ? parseInt(o.c, 10) : null;
      let code = 0;
      for (let i = 0; i < files.length; i++) {
        const t = files[i];
        let text;
        try { text = t === '-' ? (io.stdin || '') : FS.read(t, io.sh); }
        catch (e) { io.err(e.code === 'EISDIR' ? `${name}: error reading ${q(t)}: Is a directory\n` : `${name}: cannot open ${q(t)} for reading: ${LAB.errMsg(e.code)}\n`); code = 1; continue; }
        if ((files.length > 1 && !o.q) || o.v) io.out((i ? '\n' : '') + `==> ${t === '-' ? 'standard input' : t} <==\n`);
        if (bytes !== null) { io.out(isTail ? text.slice(-bytes) : text.slice(0, bytes)); continue; }
        const lines = text.split('\n'); const nl = text.endsWith('\n'); if (nl) lines.pop();
        let sel = isTail ? (fromStart ? lines.slice(Math.max(0, n - 1)) : lines.slice(Math.max(0, lines.length - n))) : lines.slice(0, n);
        if (sel.length) io.out(sel.join('\n') + (nl || (!isTail && sel.length < lines.length) ? '\n' : ''));
      }
      if (isTail && o.f) { while (!io.aborted) await LAB.sleep(150); LAB.term.print('^C\n'); return 130; }
      return code;
    };
  }
  cmd('head', headTail(false), { help: '앞부분 출력 (-n 줄 수, -c 바이트)' });
  cmd('tail', headTail(true), { help: '뒷부분 출력 (-n 줄 수, -n +K K번째 줄부터, -f 계속 지켜보기)' });

  async function pagerCmd(argv, io, kind) {
    const { a } = getopt(argv, '');
    let text = ''; let code = 0;
    if (!a.length) {
      if (io.stdin == null) { io.err(kind === 'more' ? 'more: bad usage\nTry \'more --help\' for more information.\n' : 'Missing filename ("less --help" for help)\n'); return 1; }
      text = io.stdin;
    }
    for (const t of a) {
      try { const r = FS.resolve(t, {}, io.sh); if (r.node && r.node.type === 'd') { io.err(kind === 'more' ? `\n*** ${t}: directory ***\n\n` : `${t} is a directory\n`); code = 1; continue; } text += (a.length > 1 && kind === 'more' ? `::::::::::::::\n${t}\n::::::::::::::\n` : '') + FS.read(t, io.sh); }
      catch (e) { io.err(kind === 'more' ? `more: cannot open ${t}: ${LAB.errMsg(e.code)}\n` : `${t}: ${LAB.errMsg(e.code)}\n`); code = 1; }
    }
    if (!text) return code;
    const rows = LAB.term.size().rows;
    if (!io.toTerm) { io.out(text); return code; }
    if (kind === 'more' && text.split('\n').length <= rows) { io.out(text); return code; }
    await LAB.pager(io, text, { more: kind === 'more', title: a[0] || '' });
    return code;
  }
  cmd('more', (argv, io) => pagerCmd(argv, io, 'more'), { help: '한 화면씩 보기 (Space 다음, q 종료)' });
  cmd('less', (argv, io) => pagerCmd(argv, io, 'less'), { help: '앞뒤로 움직이며 보기 (Space/b, /검색, q 종료)' });

  cmd('wc', async (argv, io) => {
    const { o, a } = getopt(argv, '', { lines: 'l', words: 'w', bytes: 'c', chars: 'm' });
    const all = !o.l && !o.w && !o.c && !o.m;
    const files = a.length ? a : ['-']; const rows = []; let code = 0; const tot = [0, 0, 0];
    for (const t of files) {
      let text; try { text = t === '-' ? (io.stdin || '') : FS.read(t, io.sh); } catch (e) { io.err(`wc: ${t}: ${LAB.errMsg(e.code)}\n`); code = 1; continue; }
      const l = (text.match(/\n/g) || []).length, w = (text.match(/\S+/g) || []).length, c = o.m ? [...text].length : utf8len(text);
      tot[0] += l; tot[1] += w; tot[2] += c; rows.push([l, w, c, t === '-' ? '' : t]);
    }
    if (files.length > 1) rows.push([...tot, 'total']);
    const width = files.length === 1 && files[0] === '-' ? 7 : Math.max(1, ...rows.map(r => String(Math.max(r[0], r[1], r[2])).length));
    rows.forEach(r => {
      const parts = []; if (all || o.l) parts.push(String(r[0]).padStart(width)); if (all || o.w) parts.push(String(r[1]).padStart(width)); if (all || o.c || o.m) parts.push(String(r[2]).padStart(width));
      io.out(parts.join(' ') + (r[3] ? ' ' + r[3] : '') + '\n');
    });
    return code;
  }, { help: '줄·단어·바이트 수 세기 (-l 줄 수)' });

  cmd('grep', async (argv, io) => {
    const { o, a } = getopt(argv, 'e', { 'ignore-case': 'i', 'line-number': 'n', 'invert-match': 'v', count: 'c', 'files-with-matches': 'l', 'word-regexp': 'w', recursive: 'r', color: 'color' });
    let pat = o.e !== undefined ? o.e : a.shift();
    if (pat === undefined) { io.err("Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n"); return 2; }
    let re; try { re = new RegExp((o.w ? '\\b' : '') + pat + (o.w ? '\\b' : ''), o.i ? 'gi' : 'g'); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), o.i ? 'gi' : 'g'); }
    const files = a.length ? a : ['-']; let found = false; let code = 0;
    const multi = files.length > 1 || o.r;
    const doText = (text, label) => {
      const lines = text.split('\n'); if (text.endsWith('\n')) lines.pop();
      let cnt = 0;
      lines.forEach((ln, i) => {
        re.lastIndex = 0; const m = re.test(ln); if (m === !!o.v) return;
        cnt++; found = true; if (o.c || o.l) return;
        const pre = (multi ? label + ':' : '') + (o.n ? (i + 1) + ':' : '');
        re.lastIndex = 0;
        const hl = io.toTerm && !o.v ? esc(ln).replace(new RegExp(re.source.replace(/&/g, '&amp;'), re.flags), mm => `<span class="c-match">${mm}</span>`) : esc(ln);
        const preH = io.toTerm ? (multi ? `<span class="c-fn">${esc(label)}</span><span class="c-sep">:</span>` : '') + (o.n ? `<span class="c-ln2">${i + 1}</span><span class="c-sep">:</span>` : '') : esc(pre);
        io.outHTML(preH + hl + '\n', pre + ln + '\n');
      });
      if (o.c) io.out((multi ? label + ':' : '') + cnt + '\n');
      if (o.l && cnt) io.out(label + '\n');
    };
    const walk = (t) => {
      const r = FS.resolve(t, {}, io.sh);
      if (!r.node) { io.err(`grep: ${t}: No such file or directory\n`); code = 2; return; }
      if (r.node.type === 'd') {
        if (!o.r) { io.err(`grep: ${t}: Is a directory\n`); return; }
        if (!FS.can(r.node, 'r', io.sh)) { io.err(`grep: ${t}: Permission denied\n`); code = 2; return; }
        Object.keys(r.node.children).sort(byName).forEach(k => walk((t === '/' ? '' : t.replace(/\/$/, '')) + '/' + k)); return;
      }
      try { doText(FS.read(t, io.sh), t); } catch (e) { io.err(`grep: ${t}: ${LAB.errMsg(e.code)}\n`); code = 2; }
    };
    for (const t of files) { if (t === '-') doText(io.stdin || '', '(standard input)'); else walk(t); }
    return code || (found ? 0 : 1);
  }, { help: '패턴이 들어 있는 줄 찾기 (-i 대소문자 무시, -n 줄 번호, -v 반대)' });

  /* ======================= 파일 만들기·복사·이동·삭제 ======================= */
  cmd('touch', async (argv, io) => {
    const { o, a } = getopt(argv, 'd', { 'no-create': 'c' });
    if (!a.length) { io.err("touch: missing file operand\nTry 'touch --help' for more information.\n"); return 1; }
    let code = 0; const now = Date.now();
    for (const t of a) {
      const r = FS.resolve(t, {}, io.sh);
      if (r.node) {
        if (!FS.can(r.node, 'w', io.sh) && LAB.users.get(io.sh.euser).uid !== r.node.uid) { io.err(`touch: cannot touch ${q(t)}: Permission denied\n`); code = 1; continue; }
        if (!o.m) r.node.atime = now; if (!o.a) r.node.mtime = now; r.node.ctime = now; continue;
      }
      if (o.c) continue;
      try { FS.create(t, 'f', io.sh); } catch (e) { io.err(`touch: cannot touch ${q(t)}: ${LAB.errMsg(e.code)}\n`); code = 1; }
    }
    return code;
  }, { help: '빈 파일 만들기 / 시간 갱신' });

  function canDelete(r, sh) {
    const p = r.parent; if (!FS.can(p, 'w', sh) || !FS.can(p, 'x', sh)) return false;
    const u = LAB.users.get(sh.euser);
    if ((p.mode & 0o1000) && u.uid !== 0 && r.node.uid !== u.uid && p.uid !== u.uid) return false;
    return true;
  }
  cmd('rm', async (argv, io) => {
    const { o, a } = getopt(argv, '', { recursive: 'r', force: 'f', interactive: 'i', verbose: 'v', dir: 'd', 'no-preserve-root': 'NPR' });
    const rec = o.r || o.R; const sh = io.sh; let code = 0;
    if (!a.length) { if (o.f) return 0; io.err("rm: missing operand\nTry 'rm --help' for more information.\n"); return 1; }
    const rmTree = (r, label) => {
      const n = r.node;
      if (n.type === 'd') {
        if (!FS.can(n, 'w', sh) || !FS.can(n, 'x', sh)) { if (Object.keys(n.children).length) { io.err(`rm: cannot remove ${q(label)}: Permission denied\n`); return false; } }
        let ok = true;
        for (const k of Object.keys(n.children)) {
          const child = { node: n.children[k], parent: n, name: k };
          if (!rmTree(child, label.replace(/\/$/, '') + '/' + k)) ok = false;
        }
        if (!ok) return false;
      }
      if (!canDelete(r, sh)) { io.err(`rm: cannot remove ${q(label)}: Permission denied\n`); return false; }
      FS.unlink(r); if (o.v) io.out(n.type === 'd' ? `removed directory ${q(label)}\n` : `removed ${q(label)}\n`);
      return true;
    };
    for (const t of a) {
      const r = FS.resolve(t, { nofollow: true }, sh);
      if (r.abs === '/' && rec) { io.err("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n"); code = 1; continue; }
      if (!r.node) { if (!o.f) { io.err(`rm: cannot remove ${q(t)}: ${LAB.errMsg(r.err === 'EACCES' ? 'EACCES' : 'ENOENT')}\n`); code = 1; } continue; }
      if (r.node.type === 'd' && !rec) {
        if (o.d && !Object.keys(r.node.children).length) { if (canDelete(r, sh)) { FS.unlink(r); continue; } }
        io.err(`rm: cannot remove ${q(t)}: Is a directory\n`); code = 1; continue;
      }
      if (o.i) {
        const kind = r.node.type === 'd' ? 'directory' : (FS.content(r.node) === '' ? 'regular empty file' : 'regular file');
        const ans = await io.readLine({ prompt: `rm: remove ${kind} ${q(t)}? ` });
        if (!ans || !/^y/i.test(ans)) continue;
      }
      if (!rmTree(r, t)) code = 1;
    }
    return code;
  }, { help: '파일 삭제 (-r 디렉토리까지, -f 강제, -i 확인)' });

  function cloneNode(n, sh, preserve) {
    const u = LAB.users.get(sh.euser);
    const c = FS.mkNode(n.type, n.name, preserve ? n.mode : (n.mode & ~0o002 & 0o7777), preserve && u.uid === 0 ? n.uid : u.uid, preserve && u.uid === 0 ? n.gid : u.gid);
    if (n.type === 'f') c.content = FS.content(n);
    if (n.type === 'l') c.target = n.target;
    if (n.type === 'd') for (const k in n.children) { const cc = cloneNode(n.children[k], sh, preserve); cc.name = k; c.children[k] = cc; }
    if (preserve) { c.atime = n.atime; c.mtime = n.mtime; }
    return c;
  }
  cmd('cp', async (argv, io) => {
    const { o, a } = getopt(argv, '', { recursive: 'r', verbose: 'v', interactive: 'i', preserve: 'p', archive: 'a', force: 'f' });
    const rec = o.r || o.R || o.a; const preserve = o.p || o.a; const sh = io.sh;
    if (a.length < 2) { io.err(a.length ? `cp: missing destination file operand after ${q(a[0])}\nTry 'cp --help' for more information.\n` : "cp: missing file operand\nTry 'cp --help' for more information.\n"); return 1; }
    const dst = a.pop(); const dr = FS.resolve(dst, {}, sh);
    const intoDir = dr.node && dr.node.type === 'd';
    if (a.length > 1 && !intoDir) { io.err(`cp: target ${q(dst)}: ${dr.node ? 'Not a directory' : 'No such file or directory'}\n`); return 1; }
    let code = 0;
    for (const s of a) {
      const sr = FS.resolve(s, {}, sh);
      if (!sr.node) { io.err(`cp: cannot stat ${q(s)}: ${LAB.errMsg(sr.err === 'EACCES' ? 'EACCES' : 'ENOENT')}\n`); code = 1; continue; }
      if (sr.node.type === 'd' && !rec) { io.err(`cp: -r not specified; omitting directory ${q(s)}\n`); code = 1; continue; }
      if (!FS.can(sr.node, 'r', sh)) { io.err(`cp: cannot open ${q(s)} for reading: Permission denied\n`); code = 1; continue; }
      const base = sr.abs.split('/').pop();
      const target = intoDir ? (dr.abs === '/' ? '' : dr.abs) + '/' + base : FS.abs(dst, sh);
      const tr = FS.resolve(target, {}, sh);
      if (tr.node === sr.node) { io.err(`cp: ${q(s)} and ${q(intoDir ? target.replace(/^.*\//, dst.replace(/\/$/, '') + '/') : dst)} are the same file\n`); code = 1; continue; }
      if (sr.node.type === 'd' && (target + '/').startsWith(sr.abs + '/')) { io.err(`cp: cannot copy a directory, ${q(s)}, into itself, ${q(target)}\n`); code = 1; continue; }
      const pdir = target.slice(0, target.lastIndexOf('/')) || '/';
      const pr = FS.resolve(pdir, {}, sh);
      if (!pr.node) { io.err(`cp: cannot create regular file ${q(dst)}: No such file or directory\n`); code = 1; continue; }
      if (tr.node && tr.node.type !== 'd' && sr.node.type !== 'd') {
        if (o.i) { const ans = await io.readLine({ prompt: `cp: overwrite ${q(target.split('/').pop())}? ` }); if (!ans || !/^y/i.test(ans)) continue; }
        if (!FS.can(tr.node, 'w', sh)) { io.err(`cp: cannot create regular file ${q(dst)}: Permission denied\n`); code = 1; continue; }
        tr.node.content = FS.content(sr.node); tr.node.mtime = tr.node.ctime = Date.now(); if (o.v) io.out(`${q(s)} -> ${q(target)}\n`); continue;
      }
      if (!FS.can(pr.node, 'w', sh)) { io.err(`cp: cannot create ${sr.node.type === 'd' ? 'directory' : 'regular file'} ${q(intoDir ? target : dst)}: Permission denied\n`); code = 1; continue; }
      const c = cloneNode(sr.node, sh, preserve); const nm = target.split('/').pop(); c.name = nm;
      if (tr.node && tr.node.type === 'd' && sr.node.type === 'd') { for (const k in c.children) tr.node.children[k] = c.children[k]; }
      else pr.node.children[nm] = c;
      pr.node.mtime = pr.node.ctime = Date.now();
      if (o.v) io.out(`${q(s)} -> ${q(target)}\n`);
    }
    return code;
  }, { help: '복사 (-r 디렉토리 복사)' });

  cmd('mv', async (argv, io) => {
    const { o, a } = getopt(argv, '', { verbose: 'v', interactive: 'i', force: 'f' });
    const sh = io.sh;
    if (a.length < 2) { io.err(a.length ? `mv: missing destination file operand after ${q(a[0])}\nTry 'mv --help' for more information.\n` : "mv: missing file operand\nTry 'mv --help' for more information.\n"); return 1; }
    const dst = a.pop(); const dr = FS.resolve(dst, {}, sh); const intoDir = dr.node && dr.node.type === 'd';
    if (a.length > 1 && !intoDir) { io.err(`mv: target ${q(dst)}: ${dr.node ? 'Not a directory' : 'No such file or directory'}\n`); return 1; }
    let code = 0;
    for (const s of a) {
      const sr = FS.resolve(s, { nofollow: true }, sh);
      if (!sr.node) { io.err(`mv: cannot stat ${q(s)}: ${LAB.errMsg(sr.err === 'EACCES' ? 'EACCES' : 'ENOENT')}\n`); code = 1; continue; }
      const target = intoDir ? (dr.abs === '/' ? '' : dr.abs) + '/' + sr.name : FS.abs(dst, sh);
      if (target === sr.abs) { io.err(`mv: ${q(s)} and ${q(dst)} are the same file\n`); code = 1; continue; }
      if (sr.node.type === 'd' && (target + '/').startsWith(sr.abs + '/')) { io.err(`mv: cannot move ${q(s)} to a subdirectory of itself, ${q(target)}\n`); code = 1; continue; }
      const pdir = target.slice(0, target.lastIndexOf('/')) || '/'; const pr = FS.resolve(pdir, {}, sh);
      if (!pr.node || pr.node.type !== 'd') { io.err(`mv: cannot move ${q(s)} to ${q(dst)}: No such file or directory\n`); code = 1; continue; }
      if (!canDelete(sr, sh) || !FS.can(pr.node, 'w', sh)) { io.err(`mv: cannot move ${q(s)} to ${q(dst)}: Permission denied\n`); code = 1; continue; }
      const nm = target.split('/').pop(); const ex = pr.node.children[nm];
      if (ex && ex.type === 'd' && sr.node.type !== 'd') { io.err(`mv: cannot overwrite directory ${q(target)} with non-directory\n`); code = 1; continue; }
      if (ex && o.i) { const ans = await io.readLine({ prompt: `mv: overwrite ${q(target)}? ` }); if (!ans || !/^y/i.test(ans)) continue; }
      delete sr.parent.children[sr.name]; sr.parent.mtime = sr.parent.ctime = Date.now();
      sr.node.name = nm; sr.node.ctime = Date.now(); pr.node.children[nm] = sr.node; pr.node.mtime = pr.node.ctime = Date.now();
      // 현재 디렉토리가 옮겨졌다면 경로 갱신
      if (sr.node.type === 'd' && (sh.cwd + '/').startsWith(sr.abs + '/')) sh.proc.cwd = target + sh.cwd.slice(sr.abs.length);
      if (o.v) io.out(`renamed ${q(s)} -> ${q(target)}\n`);
    }
    return code;
  }, { help: '이동 / 이름 바꾸기' });

  cmd('ln', async (argv, io) => {
    const { o, a } = getopt(argv, '', { symbolic: 's', force: 'f' });
    const sh = io.sh;
    if (a.length < 1) { io.err("ln: missing file operand\nTry 'ln --help' for more information.\n"); return 1; }
    const target = a[0]; let name = a[1] || target.split('/').pop();
    const dr = FS.resolve(name, {}, sh); if (dr.node && dr.node.type === 'd') name = name.replace(/\/$/, '') + '/' + target.split('/').pop();
    const ex = FS.resolve(name, { nofollow: true }, sh);
    if (ex.node) { if (o.f && canDelete(ex, sh)) FS.unlink(ex); else { io.err(`ln: failed to create ${o.s ? 'symbolic' : 'hard'} link ${q(name)}: File exists\n`); return 1; } }
    if (o.s) {
      try { const n = FS.create(name, 'l', sh, 0o777); n.target = target; } catch (e) { io.err(`ln: failed to create symbolic link ${q(name)}: ${LAB.errMsg(e.code)}\n`); return 1; }
      return 0;
    }
    const tr = FS.resolve(target, {}, sh);
    if (!tr.node) { io.err(`ln: failed to access ${q(target)}: No such file or directory\n`); return 1; }
    if (tr.node.type === 'd') { io.err(`ln: ${q(target)}: hard link not allowed for directory\n`); return 1; }
    const pr = FS.resolve(name, { nofollow: true }, sh);
    if (!pr.parent || !FS.can(pr.parent, 'w', sh)) { io.err(`ln: failed to create hard link ${q(name)}: Permission denied\n`); return 1; }
    tr.node.nlink = (tr.node.nlink || 1) + 1; tr.node.ctime = Date.now(); pr.parent.children[pr.name] = tr.node;
    return 0;
  }, { help: '링크 만들기 (-s 심볼릭 링크)' });

  cmd('mkfifo', async (argv, io) => {
    const { o, a } = getopt(argv, 'm');
    if (!a.length) { io.err("mkfifo: missing operand\nTry 'mkfifo --help' for more information.\n"); return 1; }
    let code = 0;
    for (const t of a) { try { FS.create(t, 'p', io.sh, o.m ? parseInt(o.m, 8) : null); } catch (e) { io.err(`mkfifo: cannot create fifo ${q(t)}: ${LAB.errMsg(e.code)}\n`); code = 1; } }
    return code;
  }, { help: '이름 있는 파이프(FIFO) 만들기' });

  /* ======================= 정보 ======================= */
  function nsTime(ms, ino) {
    const d = new Date(ms); const p = n => String(n).padStart(2, '0');
    const ns = String((ms % 1000) * 1000000 + ((Math.floor(ms / 7) * 7919) % 999983)).padStart(9, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${ns} ${LAB.tzOff(d)}`;
  }
  cmd('stat', async (argv, io) => {
    const { o, a } = getopt(argv, 'c', { dereference: 'L' });
    if (!a.length) { io.err("stat: missing operand\nTry 'stat --help' for more information.\n"); return 1; }
    let code = 0;
    for (const t of a) {
      const r = FS.resolve(t, { nofollow: !o.L }, io.sh);
      if (!r.node) { io.err(`stat: cannot statx ${q(t)}: ${LAB.errMsg(r.err === 'EACCES' ? 'EACCES' : 'ENOENT')}\n`); code = 1; continue; }
      const n = r.node; const size = sizeOf(n);
      const ko = LAB.lang === 'ko';
      const kind = ko ? (n.type === 'd' ? '디렉터리' : n.type === 'l' ? '심볼릭 링크' : n.type === 'p' ? 'fifo' : n.type === 'c' ? '문자 특수 파일' : n.type === 'b' ? '블록 특수 파일' : (size === 0 ? '일반 빈 파일' : '일반 파일'))
        : (n.type === 'd' ? 'directory' : n.type === 'l' ? 'symbolic link' : n.type === 'p' ? 'fifo' : n.type === 'c' ? 'character special file' : n.type === 'b' ? 'block special file' : (size === 0 ? 'regular empty file' : 'regular file'));
      const abs = r.abs;
      const ctx = abs.startsWith('/home/') ? 'unconfined_u:object_r:user_home_t:s0' : abs.startsWith('/etc/') ? 'system_u:object_r:etc_t:s0' : abs.startsWith('/tmp') ? 'unconfined_u:object_r:user_tmp_t:s0' : abs.startsWith('/root') ? 'system_u:object_r:admin_home_t:s0' : 'system_u:object_r:default_t:s0';
      const L = ko ? { file: '  파일', size: '  크기', blocks: '블록', io: 'IO 블록', dev: '장치', ino: '아이노드', links: '링크', acc: '접근', ctxl: '컨텍스트', mod: '수정', chg: '변경', birth: ' 생성' }
        : { file: '  File', size: '  Size', blocks: 'Blocks', io: 'IO Block', dev: 'Device', ino: 'Inode', links: 'Links', acc: 'Access', ctxl: 'Context', mod: 'Modify', chg: 'Change', birth: ' Birth' };
      const blocks = n.type === 'd' ? 8 : n.type === 'f' ? Math.ceil(size / 4096) * 8 : 0;
      const uname = U.byUid(n.uid), gname = U.groupByGid(n.gid);
      const oct = (n.mode & 0o7777).toString(8).padStart(4, '0');
      io.out(`${L.file}: ${t}${n.type === 'l' ? ' -> ' + n.target : ''}\n`);
      io.out(`${L.size}: ${String(size).padEnd(10)}\t${L.blocks}: ${String(blocks).padEnd(10)} ${L.io}: 4096   ${kind}\n`);
      io.out(`${L.dev}: ${n.type === 'c' || n.type === 'b' ? '0,5' : '253,0'}\t${L.ino}: ${String(n.ino).padEnd(11)} ${L.links}: ${nlinks(n)}\n`);
      io.out(`${L.acc}: (${oct}/${modeStr(n)})  Uid: (${String(n.uid).padStart(5)}/${uname.padStart(8)})   Gid: (${String(n.gid).padStart(5)}/${gname.padStart(8)})\n`);
      io.out(`${L.ctxl}: ${ctx}\n`);
      io.out(`${L.acc}: ${nsTime(n.atime, n.ino)}\n${L.mod}: ${nsTime(n.mtime, n.ino + 1)}\n${L.chg}: ${nsTime(n.ctime, n.ino + 2)}\n${L.birth}: ${nsTime(n.btime, n.ino + 3)}\n`);
    }
    return code;
  }, { help: '파일 상태 (크기, inode, 권한, Access/Modify/Change/Birth 시간)' });

  cmd('file', async (argv, io) => {
    const { a } = getopt(argv, ''); let code = 0;
    if (!a.length) { io.err('Usage: file [-bcCdEhikLlNnprsSvzZ0] [--apple] [--extension] [--mime-encoding]\n            [--mime-type] [-e <testname>] [-F <separator>]  [-f <namefile>]\n            [-m <magicfiles>] [-P <parameter=value>] [--exclude-quiet]\n            <file> ...\n'); return 1; }
    for (const t of a) {
      const r = FS.resolve(t, { nofollow: true }, io.sh);
      if (!r.node) { io.out(`${t}: cannot open \`${t}' (No such file or directory)\n`); continue; }
      const n = r.node; let d;
      if (n.type === 'd') d = n.mode & 0o1000 ? 'sticky, directory' : 'directory';
      else if (n.type === 'l') d = `symbolic link to ${n.target}`;
      else if (n.type === 'p') d = 'fifo (named pipe)';
      else if (n.type === 'c') d = 'character special (1/3)';
      else if (n.type === 'b') d = 'block special (8/0)';
      else {
        if (!FS.can(n, 'r', io.sh)) { d = `regular file, no read permission`; }
        else {
          const c = FS.content(n);
          if (c === '') d = 'empty';
          else if (c.startsWith('\u007fELF')) d = 'ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, stripped';
          else if (c.startsWith('#!/bin/bash')) d = 'Bourne-Again shell script, ' + (/[^\x00-\x7f]/.test(c) ? 'Unicode text, UTF-8 text' : 'ASCII text') + ' executable';
          else if (c.startsWith('#!')) d = 'POSIX shell script, ASCII text executable';
          else d = (/[^\x00-\x7f]/.test(c) ? 'Unicode text, UTF-8 text' : 'ASCII text');
        }
      }
      io.out(`${t}: ${d}\n`);
    }
    return code;
  }, { help: '파일 종류 확인' });

  /* chmod */
  function applyMode(cur, spec) {
    if (/^[0-7]{1,4}$/.test(spec)) return { mode: (cur & ~0o7777) | parseInt(spec, 8) };
    let m = cur;
    for (const part of spec.split(',')) {
      const mm = part.match(/^([ugoa]*)([+\-=])([rwxXst]*)$/); if (!mm) return { err: true };
      const who = mm[1] || 'a'; const op = mm[2]; const perms = mm[3];
      let bits = 0;
      const set = (w, r, wb, x) => { let b = 0; if (perms.includes('r')) b |= r; if (perms.includes('w')) b |= wb; if (perms.includes('x') || (perms.includes('X') && (cur & 0o111 || (cur & 0o170000) === 0o040000))) b |= x; return b; };
      if (who.includes('u') || who.includes('a')) bits |= set('u', 0o400, 0o200, 0o100) | (perms.includes('s') ? 0o4000 : 0);
      if (who.includes('g') || who.includes('a')) bits |= set('g', 0o040, 0o020, 0o010) | (perms.includes('s') ? 0o2000 : 0);
      if (who.includes('o') || who.includes('a')) bits |= set('o', 0o004, 0o002, 0o001);
      if (perms.includes('t')) bits |= 0o1000;
      if (op === '+') m |= bits; else if (op === '-') m &= ~bits;
      else { let mask = 0; if (who.includes('u') || who.includes('a')) mask |= 0o4700; if (who.includes('g') || who.includes('a')) mask |= 0o2070; if (who.includes('o') || who.includes('a')) mask |= 0o1007; m = (m & ~mask) | bits; }
    }
    return { mode: m };
  }
  cmd('chmod', async (argv, io) => {
    const args = argv.slice(1); const R = args.includes('-R'); const rest = args.filter(x => x !== '-R' && x !== '-v' && x !== '--verbose');
    if (rest.length < 2) { io.err(rest.length ? `chmod: missing operand after ${q(rest[0])}\nTry 'chmod --help' for more information.\n` : "chmod: missing operand\nTry 'chmod --help' for more information.\n"); return 1; }
    const spec = rest[0]; let code = 0;
    const doNode = (n, label) => {
      const u = LAB.users.get(io.sh.euser);
      if (u.uid !== 0 && u.uid !== n.uid) { io.err(`chmod: changing permissions of ${q(label)}: Operation not permitted\n`); code = 1; return; }
      const r = applyMode(n.mode, spec); if (r.err) { io.err(`chmod: invalid mode: ${q(spec)}\nTry 'chmod --help' for more information.\n`); code = 1; return; }
      n.mode = r.mode; n.ctime = Date.now();
      if (R && n.type === 'd') for (const k in n.children) doNode(n.children[k], label + '/' + k);
    };
    for (const t of rest.slice(1)) {
      const r = FS.resolve(t, {}, io.sh);
      if (!r.node) { io.err(`chmod: cannot access ${q(t)}: ${LAB.errMsg(r.err === 'EACCES' ? 'EACCES' : 'ENOENT')}\n`); code = 1; continue; }
      doNode(r.node, t);
    }
    return code;
  }, { help: '권한 바꾸기 (755, u+x, go-w ...)' });

  cmd('chown', async (argv, io) => {
    const args = argv.slice(1).filter(x => x !== '-R'); const R = argv.includes('-R');
    if (args.length < 2) { io.err("chown: missing operand\nTry 'chown --help' for more information.\n"); return 1; }
    const [ug, ...files] = args; const [un, gn] = ug.split(':');
    const nu = un ? LAB.users.get(un) : null;
    if (un && !nu) { io.err(`chown: invalid user: ${lq(ug)}\n`); return 1; }
    let ngid = null; if (gn) { const g = S().groups[gn]; if (!g) { io.err(`chown: invalid group: ${lq(ug)}\n`); return 1; } ngid = g.gid; } else if (gn === '' && nu) ngid = nu.gid;
    let code = 0;
    for (const t of files) {
      const r = FS.resolve(t, {}, io.sh);
      if (!r.node) { io.err(`chown: cannot access ${q(t)}: No such file or directory\n`); code = 1; continue; }
      if (LAB.users.get(io.sh.euser).uid !== 0) { io.err(`chown: changing ownership of ${q(t)}: Operation not permitted\n`); code = 1; continue; }
      const doN = n => { if (nu) n.uid = nu.uid; if (ngid !== null) n.gid = ngid; n.ctime = Date.now(); if (R && n.type === 'd') Object.values(n.children).forEach(doN); };
      doN(r.node);
    }
    return code;
  }, { help: '소유자 바꾸기 (root만)' });

  /* ======================= 시스템 정보 ======================= */
  const KREL = '6.12.0-55.el10.x86_64', KVER = '#1 SMP PREEMPT_DYNAMIC Mon Feb 10 12:34:56 UTC 2025';
  cmd('uname', async (argv, io) => {
    const { o } = getopt(argv, '', { all: 'a', 'kernel-name': 's', nodename: 'n', 'kernel-release': 'r', 'kernel-version': 'v', machine: 'm', processor: 'p', 'hardware-platform': 'i', 'operating-system': 'o' });
    const parts = [];
    const all = o.a;
    if (all || o.s || Object.keys(o).length === 0) parts.push('Linux');
    if (all || o.n) parts.push(S().hostname);
    if (all || o.r) parts.push(KREL);
    if (all || o.v) parts.push(KVER);
    if (all || o.m) parts.push('x86_64');
    if (o.p) parts.push('x86_64');
    if (o.i) parts.push('x86_64');
    if (all || o.o) parts.push('GNU/Linux');
    io.out(parts.join(' ') + '\n'); return 0;
  }, { help: '운영체제·커널 정보 (-a 전부, -s -n -r -v -m -p -i -o)' });

  cmd('hostname', async (argv, io) => {
    const { o, a } = getopt(argv, '', { 'all-ip-addresses': 'I', 'ip-address': 'i', fqdn: 'f', short: 's' });
    if (o.I) { io.out('10.0.2.15 \n'); return 0; }
    if (o.i) { io.out('::1 127.0.0.1\n'); return 0; }
    if (!a.length) { io.out(S().hostname + '\n'); return 0; }
    if (LAB.users.get(io.sh.euser).uid !== 0) { io.err('hostname: you must be root to change the host name\n'); return 1; }
    S().hostname = a[0]; return 0;
  }, { help: '호스트 이름 보기 / 일시 변경 (sudo hostname 이름)' });

  cmd('hostnamectl', async (argv, io) => {
    const a = argv.slice(1).filter(x => !x.startsWith('-'));
    const sub = a[0] || 'status';
    const st = () => {
      const s = ((FS.lookupAbs('/etc/hostname') || {}).content || '').trim();
      const row = (k, v) => k.padStart(20) + ': ' + v + '\n';
      let out = row('Static hostname', s || '(unset)');
      if (S().hostname !== s) out += row('Transient hostname', S().hostname);
      out += row('Icon name', 'computer-vm') + row('Chassis', 'vm 🖴') + row('Machine ID', '5d1f9c3a7e2b4c0f8a6d2e1b9c7a4f30') + row('Boot ID', '9b2e7c41d0a54f6e8c3b1a2d7f6e5c49') +
        row('Virtualization', 'oracle') + row('Operating System', 'CentOS Stream 10 (Coughlan)') + row('CPE OS Name', 'cpe:/o:centos:centos:10') + row('Kernel', 'Linux ' + KREL) +
        row('Architecture', 'x86-64') + row('Hardware Vendor', 'innotek GmbH') + row('Hardware Model', 'VirtualBox') + row('Firmware Version', 'VirtualBox') + row('Firmware Date', 'Fri 2006-12-01') + row('Firmware Age', '18y 10month 3w 3d');
      return out;
    };
    if (sub === 'status') { io.out(st()); return 0; }
    if (sub === 'hostname') { if (a[1]) return LAB.exec(['hostnamectl', 'set-hostname', a[1]], io); io.out(S().hostname + '\n'); return 0; }
    if (sub === 'set-hostname') {
      if (!a[1]) { io.err('Too few arguments.\n'); return 1; }
      if (LAB.users.get(io.sh.euser).uid !== 0) { io.err('==== AUTHENTICATING FOR org.freedesktop.hostname1.set-static-hostname ====\n' + (LAB.lang === 'ko' ? '시스템 정적 호스트 이름을 설정하려면 인증이 필요합니다.\n' : 'Authentication is required to set the statically configured local hostname, as well as the pretty hostname.\n') + 'Authenticating as: user1\n'); const pw = await io.readLine({ prompt: 'Password: ', hidden: true }); if (!pw || pw === '\u0004') { io.err('polkit-agent-helper-1: pam_authenticate failed: Authentication failure\n==== AUTHENTICATION FAILED ====\nCould not set static hostname: Access denied\n'); return 1; } io.err('==== AUTHENTICATION COMPLETE ====\n'); }
      const n = FS.lookupAbs('/etc/hostname'); n.content = a[1] + '\n'; n.mtime = n.ctime = Date.now();
      S().hostname = a[1]; S().hostnameStatic = a[1]; return 0;
    }
    io.err(`Unknown command verb '${sub}'.\n`); return 1;
  }, { help: '호스트 정보 보기 / 영구 변경 (sudo hostnamectl set-hostname 이름)' });

  cmd('whoami', async (argv, io) => { io.out(io.sh.euser + '\n'); return 0; }, { help: '현재 사용자 이름' });
  cmd('who', async (argv, io) => {
    const { o } = getopt(argv, '', { all: 'a', boot: 'b', 'count': 'q' });
    const boot = new Date(Date.now() - 1000 * 60 * 47); const p = n => String(n).padStart(2, '0');
    const dt = d => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    const login = new Date(boot.getTime() + 1000 * 90);
    if (o.b) { io.out(`         system boot  ${dt(boot)}\n`); return 0; }
    if (o.a) {
      io.out(`           system boot  ${dt(boot)}\n           run-level 5  ${dt(new Date(boot.getTime() + 30000))}\nLOGIN      tty1         ${dt(new Date(boot.getTime() + 40000))}               812 id=tty1\n`);
    }
    io.out(`user1    seat0        ${dt(login)} (login screen)\nuser1    tty2         ${dt(login)} (tty2)\n`);
    return 0;
  }, { help: '로그인한 사용자 목록 (-a 부팅 시간 등 전부)' });
  cmd('tty', async (argv, io) => { if (io.stdin != null && !io.toTerm) { io.out('not a tty\n'); return 1; } io.out('/dev/' + io.tab.tty + '\n'); return 0; }, { help: '현재 터미널 장치 이름 (pts/0 = 가상 터미널)' });
  cmd('id', async (argv, io) => {
    const { o, a } = getopt(argv, '', { user: 'u', group: 'g', groups: 'G', name: 'n' });
    const name = a[0] || io.sh.euser; const u = LAB.users.get(name);
    if (!u) { io.err(`id: ${lq(name)}: no such user\n`); return 1; }
    const gs = U.groupsOf(name);
    if (o.u) { io.out((o.n ? name : u.uid) + '\n'); return 0; }
    if (o.g) { io.out((o.n ? gs[0] : u.gid) + '\n'); return 0; }
    if (o.G) { io.out(gs.map(g => o.n ? g : S().groups[g].gid).join(' ') + '\n'); return 0; }
    const ctx = a[0] ? '' : (u.uid === 0 ? ' context=unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023' : ' context=unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023');
    io.out(`uid=${u.uid}(${name}) gid=${u.gid}(${gs[0]}) groups=${gs.map(g => `${S().groups[g].gid}(${g})`).join(',')}${ctx}\n`);
    return 0;
  }, { help: '사용자 UID/GID/그룹 확인 (id 사용자)' });
  cmd('groups', async (argv, io) => {
    const a = argv.slice(1);
    if (!a.length) { io.out(U.groupsOf(io.sh.euser).join(' ') + '\n'); return 0; }
    let code = 0;
    a.forEach(n => { if (!LAB.users.get(n)) { io.err(`groups: ${lq(n)}: no such user\n`); code = 1; } else io.out(`${n} : ${U.groupsOf(n).join(' ')}\n`); });
    return code;
  }, { help: '소속 그룹' });

  /* date */
  function parseDateStr(s, base) {
    const d = new Date(base); s = s.trim().toLowerCase();
    if (s === 'now' || s === '') return d;
    if (s === 'yesterday') { d.setDate(d.getDate() - 1); return d; }
    if (s === 'tomorrow') { d.setDate(d.getDate() + 1); return d; }
    let m = s.match(/^([+-]?\d+)\s*(second|sec|minute|min|hour|day|week|month|year)s?(\s+ago)?$/);
    if (m) {
      let n = parseInt(m[1], 10); if (m[3]) n = -n;
      const u = m[2];
      if (u.startsWith('sec')) d.setSeconds(d.getSeconds() + n); else if (u.startsWith('min')) d.setMinutes(d.getMinutes() + n); else if (u === 'hour') d.setHours(d.getHours() + n);
      else if (u === 'day') d.setDate(d.getDate() + n); else if (u === 'week') d.setDate(d.getDate() + 7 * n); else if (u === 'month') d.setMonth(d.getMonth() + n); else d.setFullYear(d.getFullYear() + n);
      return d;
    }
    m = s.match(/^next\s+(week|month|year|day)$/); if (m) return parseDateStr('1 ' + m[1], base);
    m = s.match(/^last\s+(week|month|year|day)$/); if (m) return parseDateStr('1 ' + m[1] + ' ago', base);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    m = s.match(/^(next\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/);
    if (m) { const tgt = days.findIndex(x => x.startsWith(m[2])); let diff = (tgt - d.getDay() + 7) % 7; if (m[1] && diff === 0) diff = 7; d.setDate(d.getDate() + diff); d.setHours(0, 0, 0, 0); return d; }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/); if (m) { d.setHours(+m[1], +m[2], +(m[3] || 0), 0); return d; }
    return null;
  }
  cmd('date', async (argv, io) => {
    const { o, a } = getopt(argv, 'ds', { date: 'd', set: 's', utc: 'u' });
    let d = new Date();
    if (o.s !== undefined) { io.err('date: cannot set date: Operation not permitted\n'); const x = parseDateStr(String(o.s), Date.now()); io.out(LAB.fmtDate(x || d) + '\n'); return 1; }
    if (o.d !== undefined) { const x = parseDateStr(String(o.d), Date.now()); if (!x) { io.err(`date: invalid date ${q(o.d)}\n`); return 1; } d = x; }
    const fmt = a.find(x => x.startsWith('+'));
    if (o.u) d = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    let out = LAB.fmtDate(d, fmt ? fmt.slice(1) : null);
    if (o.u && !fmt) out = out.replace(/ (KST|UTC|[+-]\d+) /, ' UTC ');
    io.out(out + '\n'); return 0;
  }, { help: '날짜·시간 (+%Y-%m-%d 형식, -d "yesterday")' });

  cmd('seq', async (argv, io) => {
    const args = []; let sep = '\n', width = false, fmt = null;
    for (let i = 1; i < argv.length; i++) {
      const x = argv[i];
      if (x === '-s') sep = argv[++i] ?? ''; else if (x.startsWith('-s')) sep = x.slice(2);
      else if (x === '-f') fmt = argv[++i]; else if (x.startsWith('-f')) fmt = x.slice(2);
      else if (x === '-w') width = true;
      else args.push(x);
    }
    if (!args.length) { io.err("seq: missing operand\nTry 'seq --help' for more information.\n"); return 1; }
    const nums = args.map(Number); if (nums.some(isNaN)) { io.err(`seq: invalid floating point argument: ${q(args.find(x => isNaN(Number(x))))}\nTry 'seq --help' for more information.\n`); return 1; }
    let first = 1, inc = 1, last;
    if (nums.length === 1) last = nums[0]; else if (nums.length === 2) { first = nums[0]; last = nums[1]; } else { [first, inc, last] = nums; }
    if (inc === 0) { io.err("seq: invalid Zero increment value: '0'\nTry 'seq --help' for more information.\n"); return 1; }
    const decs = Math.max(...args.map(x => (x.split('.')[1] || '').length));
    const vals = [];
    for (let v = first; inc > 0 ? v <= last + 1e-9 : v >= last - 1e-9; v += inc) { vals.push(v); if (vals.length > 100000) break; }
    let strs = vals.map(v => {
      if (fmt) return fmt.replace(/%(0?)(\d*)(?:\.(\d+))?([gfeG])/, (m, z, w, prec, t) => { let s = t === 'f' ? v.toFixed(prec === undefined ? 6 : +prec) : t === 'e' ? v.toExponential(prec === undefined ? 6 : +prec) : String(+v.toFixed(10)); if (w) s = s.padStart(+w, z ? '0' : ' '); return s; }).replace(/%%/g, '%');
      return decs ? v.toFixed(decs) : String(Math.round(v * 1e9) / 1e9);
    });
    if (width && !fmt) { const w = Math.max(...strs.map(s => s.replace('-', '').length)); strs = strs.map(s => s.startsWith('-') ? '-' + s.slice(1).padStart(w, '0') : s.padStart(w, '0')); }
    if (strs.length) io.out(strs.join(sep) + '\n');
    return 0;
  }, { help: '숫자 나열 (seq 5, seq 2 10, seq 1 2 10, -s 구분자, -w 자릿수 맞춤)' });

  cmd('echo', async (argv, io) => {
    let a = argv.slice(1), nl = true, e = false;
    while (a.length && /^-[neE]+$/.test(a[0])) { if (a[0].includes('n')) nl = false; if (a[0].includes('e')) e = true; a.shift(); }
    let s = a.join(' ');
    if (e) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
    io.out(s + (nl ? '\n' : '')); return 0;
  }, { help: '문자열 출력 (echo $$ 현재 셸 PID)' });

  /* ======================= 사용자 관리 ======================= */
  const isRoot = io => LAB.users.get(io.sh.euser).uid === 0;
  function copySkel(name) {
    const u = LAB.users.get(name); const sk = FS.lookupAbs('/etc/skel'); const home = FS.lookupAbs('/home');
    const hd = FS.mkNode('d', name, 0o700, u.uid, u.gid);
    for (const k in sk.children) { const f = FS.mkNode('f', k, 0o644, u.uid, u.gid); f.content = sk.children[k].content; hd.children[k] = f; }
    home.children[name] = hd;
  }
  cmd('useradd', async (argv, io) => {
    const { o, a } = getopt(argv, 'dscgG', { 'create-home': 'm', 'no-create-home': 'M', shell: 's', comment: 'c', home: 'd' });
    if (!a.length) { io.err('Usage: useradd [options] LOGIN\n       useradd -D\n       useradd -D [options]\n'); return 2; }
    if (!isRoot(io)) { io.err('useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.\n'); return 1; }
    const name = a[0];
    if (!/^[a-z_][a-z0-9_-]*\$?$/.test(name)) { io.err(`useradd: invalid user name '${name}': use --badname to ignore\n`); return 3; }
    if (LAB.users.get(name)) { io.err(`useradd: user '${name}' already exists\n`); return 9; }
    const u = LAB.users.add(name, { shell: o.s || '/bin/bash', gecos: o.c || '' }); if (o.d) u.home = o.d;
    if (!o.M) { if (FS.lookupAbs(u.home)) io.err(`useradd: warning: the home directory ${u.home} already exists.\nuseradd: Not copying any file from skel directory into it.\n`); else copySkel(name); }
    const spool = FS.lookupAbs('/var/spool/mail');
    if (spool) { if (spool.children[name]) io.err('Creating mailbox file: File exists\n'); else { const m = FS.mkNode('f', name, 0o660, u.uid, 12); spool.children[name] = m; } }
    return 0;
  }, { help: '사용자 추가 (sudo useradd 이름 : CentOS는 홈 디렉토리 자동 생성)' });

  async function newPassword(io, name) {
    const p1 = await io.readLine({ prompt: 'New password: ', hidden: true }); if (p1 === null) return false;
    if (!p1 || p1 === '\u0004') { io.err('passwd: Authentication token manipulation error\n'); return false; }
    if (p1.length < 8) io.out('BAD PASSWORD: The password is shorter than 8 characters\n');
    const p2 = await io.readLine({ prompt: 'Retype new password: ', hidden: true }); if (p2 === null) return false;
    if (p1 !== p2) { io.err('Sorry, passwords do not match.\npasswd: Authentication token manipulation error\n'); return false; }
    LAB.users.get(name).hasPassword = true; io.out('passwd: all authentication tokens updated successfully.\n'); return true;
  }
  cmd('passwd', async (argv, io) => {
    const { a } = getopt(argv, '');
    const me = io.sh.euser; const name = a[0] || me;
    if (!LAB.users.get(name)) { io.err(`passwd: user '${name}' does not exist\n`); return 1; }
    if (name !== me && !isRoot(io)) { io.err('passwd: Only root can specify a user name.\n'); return 1; }
    io.out(`Changing password for user ${name}.\n`);
    if (!isRoot(io)) {
      const cur = await io.readLine({ prompt: 'Current password: ', hidden: true }); if (cur === null) return 1;
      if (!cur) { io.err('passwd: Authentication token manipulation error\npasswd: password unchanged\n'); return 10; }
    }
    return (await newPassword(io, name)) ? 0 : 10;
  }, { help: '비밀번호 바꾸기 (sudo passwd 사용자)' });

  cmd('adduser', async (argv, io) => LAB.exec(['useradd'].concat(argv.slice(1)), io), { help: 'useradd와 같음 (CentOS에서는 useradd로 연결된 링크)' });
  cmd('_adduser_debian', async (argv, io) => {
    const { a } = getopt(argv, '');
    if (!isRoot(io)) { io.err('fatal: Only root may add a user or group to the system.\n'); return 1; }
    const name = a[0]; if (!name) { io.err('fatal: Only one or two names allowed.\n'); return 1; }
    if (LAB.users.get(name)) { io.err(`fatal: The user \`${name}' already exists.\n`); return 1; }
    const u = LAB.users.add(name, { shell: '/bin/bash' });
    io.out(`info: Adding user \`${name}' ...\ninfo: Selecting UID/GID from range 1000 to 59999 ...\ninfo: Adding new group \`${name}' (${u.gid}) ...\ninfo: Adding new user \`${name}' (${u.uid}) with group \`${name} (${u.gid})' ...\ninfo: Creating home directory \`/home/${name}' ...\ninfo: Copying files from \`/etc/skel' ...\n`);
    copySkel(name);
    while (!(await newPassword(io, name))) { const r = await io.readLine({ prompt: 'passwd: Try again? [y/N] ' }); if (r === null || !/^y/i.test(r)) break; }
    io.out(`Changing the user information for ${name}\nEnter the new value, or press ENTER for the default\n`);
    for (const f of ['Full Name', 'Room Number', 'Work Phone', 'Home Phone', 'Other']) { const v = await io.readLine({ prompt: `\t${f} []: ` }); if (v === null) return 1; if (f === 'Full Name' && v) u.gecos = v; }
    await io.readLine({ prompt: 'Is the information correct? [Y/n] ' });
    io.out(`info: Adding new user \`${name}' to supplemental / extra groups \`users' ...\ninfo: Adding user \`${name}' to group \`users' ...\n`);
    LAB._S().groups.users.members.push(name);
    return 0;
  }, { help: '대화형 사용자 추가 (홈·비밀번호까지)' });

  cmd('userdel', async (argv, io) => {
    const { o, a } = getopt(argv, '', { remove: 'r', force: 'f' });
    if (!a.length) { io.err('Usage: userdel [options] LOGIN\n'); return 2; }
    if (!isRoot(io)) { io.err('userdel: Permission denied.\nuserdel: cannot lock /etc/passwd; try again later.\n'); return 1; }
    const name = a[0]; const u = LAB.users.get(name);
    if (!u) { io.err(`userdel: user '${name}' does not exist\n`); return 6; }
    const p = LAB.allProcs().find(x => x.user === name);
    if (p) { io.err(`userdel: user ${name} is currently used by process ${p.pid}\n`); if (!o.f) return 8; }
    if (o.r) {
      const h = FS.resolve(u.home, { nofollow: true }, { cwd: '/', user: 'root', euser: 'root' });
      const sp = FS.lookupAbs('/var/spool/mail');
      if (sp && sp.children[name]) delete sp.children[name]; else io.err(`userdel: ${name} mail spool (/var/spool/mail/${name}) not found\n`);
      if (h.node) FS.unlink(h); else io.err(`userdel: ${name} home directory (${u.home}) not found\n`);
    }
    LAB.users.del(name);
    return 0;
  }, { help: '사용자 삭제 (-r 홈 디렉토리까지, -f 강제)' });
  cmd('deluser', async (argv, io) => LAB.exec(['userdel'].concat(argv.slice(1).map(x => x === '--remove-home' ? '-r' : x)), io), { help: '사용자 삭제(userdel과 비슷)' });

  /* ======================= sudo / su / exit ======================= */
  cmd('sudo', async (argv, io) => {
    let a = argv.slice(1);
    if (!a.length) { io.err('usage: sudo -h | -K | -k | -V\nusage: sudo -v [-ABkNnS] [-g group] [-h host] [-p prompt] [-u user]\nusage: sudo [-ABbEHkNnPS] [-C num] [-D directory] [-g group] [-h host] [-p prompt] [-R directory] [-T timeout] [-u user] [VAR=value] [-i | -s] [command [arg ...]]\n'); return 1; }
    if (a[0] === '-k' || a[0] === '-K') { io.tab.sudoUntil = {}; return 0; }
    const login = a[0] === '-i'; const shell = a[0] === '-s';
    if (login || shell) a = a.slice(1);
    const ok = await LAB.sudoAuth(io); if (!ok) return 1;
    io.sudo = true;
    if (login || shell || (a[0] === 'su' && a.length <= 2 && (!a[1] || a[1] === '-'))) {
      LAB.pushShell(io.tab, 'root', login || a[1] === '-', login ? 'sudo -i' : (shell ? 'sudo -s' : 'sudo su'), login || shell ? 'sudo' : 'su');
      return 0;
    }
    if (!a.length) return 0;
    const name = a[0];
    if (!LAB.commands[name] && !name.includes('/')) { io.err(`sudo: ${name}: command not found\n`); return 1; }
    if (LAB.builtins.includes(name) && name !== 'echo' && name !== 'kill' && name !== 'pwd') { io.err(`sudo: ${name}: command not found\n`); return 1; }
    return LAB.withEuser(io.tab, 'root', () => LAB.exec(a, io));
  }, { help: '관리자(root) 권한으로 실행' });

  cmd('su', async (argv, io) => {
    const a = argv.slice(1); const login = a.includes('-') || a.includes('-l') || a.includes('--login');
    const name = a.filter(x => !x.startsWith('-'))[0] || 'root';
    const t = LAB.users.get(name);
    if (!t) { io.err(`su: user ${name} does not exist or the user entry does not contain all the required fields\n`); return 1; }
    if (!isRoot(io)) {
      const pw = await io.readLine({ prompt: 'Password: ', hidden: true });
      if (pw === null) return 1;
      if (!t.hasPassword || !pw || pw === '\u0004') { await LAB.sleep(1200); io.err('su: Authentication failure\n'); return 1; }
    }
    const disp = 'su ' + (login ? '- ' : '') + name;
    LAB.pushShell(io.tab, name, login, disp);
    return 0;
  }, { help: '다른 사용자로 전환 (su 사용자, su - 사용자: 로그인 셸)' });

  cmd('exit', async (argv, io) => {
    const tab = io.tab; const p = io.sh.proc;
    LAB.term.print(p.login ? 'logout\n' : 'exit\n');
    LAB.popShell(tab);
    return parseInt(argv[1] || '0', 10) || 0;
  }, { help: '현재 셸 종료 (su로 들어온 셸이면 이전 사용자로 돌아감)' });
  cmd('logout', async (argv, io) => {
    if (!io.sh.proc.login) { io.err("bash: logout: not login shell: use `exit'\n"); return 1; }
    LAB.term.print('logout\n'); LAB.popShell(io.tab); return 0;
  }, { help: '로그인 셸 종료' });

  /* ======================= 프로세스 ======================= */
  const SYSPROCS = [
    { pid: 1, ppid: 0, user: 'root', cmd: '/sbin/init splash', name: 'systemd' },
    { pid: 2, ppid: 0, user: 'root', cmd: '[kthreadd]', name: 'kthreadd' },
    { pid: 312, ppid: 1, user: 'root', cmd: '/usr/lib/systemd/systemd-journald', name: 'systemd-journal' },
    { pid: 795, ppid: 1, user: 'root', cmd: '/usr/sbin/NetworkManager --no-daemon', name: 'NetworkManager' },
    { pid: 1012, ppid: 1, user: 'root', cmd: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', name: 'sshd' },
    { pid: 1655, ppid: 1, user: 'user1', cmd: '/usr/lib/systemd/systemd --user', name: 'systemd' },
    { pid: 1810, ppid: 1655, user: 'user1', cmd: '/usr/bin/gnome-shell', name: 'gnome-shell' },
    { pid: 2290, ppid: 1655, user: 'user1', cmd: '/usr/libexec/gnome-terminal-server', name: 'gnome-terminal-' },
  ];
  const procCmd = p => p.cmd === 'su' ? (p.args || 'su') : (p.login ? '-bash' : 'bash');
  const stime = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  cmd('ps', async (argv, io) => {
    const raw = argv.slice(1).join(' ');
    const { o, a } = getopt(argv.map(x => x === 'aux' || x === 'ax' ? '-ef' : x), 'pu', { pid: 'p' });
    const mine = LAB.allProcs();
    const selfPid = LAB._S().pid + 1; LAB._S().pid = selfPid;
    const me = { pid: selfPid, ppid: io.sh.proc.pid, user: io.sh.euser, cmdline: 'ps ' + raw, tty: io.tab.tty, start: Date.now() };
    let list;
    const all = o.e || o.A || /aux|ax/.test(raw);
    const ours = mine.map(p => ({ pid: p.pid, ppid: p.ppid, user: p.user, cmdline: procCmd(p), tty: p.tty, start: p.start })).concat([me]);
    if (all) list = SYSPROCS.map(p => ({ pid: p.pid, ppid: p.ppid, user: p.user, cmdline: p.cmd, tty: '?', start: Date.now() - 2820000 })).concat(ours);
    else if (o.p) { const want = String(o.p).split(',').map(Number); list = SYSPROCS.map(p => ({ pid: p.pid, ppid: p.ppid, user: p.user, cmdline: p.cmd, tty: '?', start: Date.now() - 2820000 })).concat(ours).filter(p => want.includes(p.pid)); }
    else if (o.u) { list = ours.filter(p => p.user === o.u); }
    else list = ours.filter(p => p.tty === io.tab.tty && p.user === io.sh.euser);
    list.sort((x, y) => x.pid - y.pid);
    const full = o.f || /aux/.test(raw);
    if (/aux/.test(raw)) {
      io.out('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n');
      list.forEach(p => io.out(`${p.user.padEnd(10)} ${String(p.pid).padStart(6)}  0.0  0.1  11284  5248 ${p.tty.padEnd(8)} Ss   ${stime(p.start)}   0:00 ${p.cmdline}\n`));
      return 0;
    }
    if (full) {
      io.out('UID          PID    PPID  C STIME TTY          TIME CMD\n');
      list.forEach(p => io.out(`${p.user.padEnd(8)} ${String(p.pid).padStart(7)} ${String(p.ppid).padStart(7)}  0 ${stime(p.start)} ${p.tty.padEnd(8)} 00:00:00 ${p.cmdline}\n`));
    } else {
      io.out('    PID TTY          TIME CMD\n');
      list.forEach(p => io.out(`${String(p.pid).padStart(7)} ${p.tty.padEnd(8)} 00:00:00 ${p.cmdline.split(' ')[0].replace(/^.*\//, '').replace(/^-/, '').slice(0, 15)}\n`));
    }
    return list.length ? 0 : 1;
  }, { help: '프로세스 목록 (-f 자세히, -ef 전체, -fp PID)' });

  function treeLines(node, prefix) {
    // node: {label, kids:[]}  pstree 형식
    const lab = node.label;
    if (!node.kids.length) return [lab];
    const lines = [];
    const pad = ' '.repeat([...lab].length);
    node.kids.forEach((k, i) => {
      const sub = treeLines(k);
      const first = i === 0, last = i === node.kids.length - 1, only = node.kids.length === 1;
      sub.forEach((s, j) => {
        let head;
        if (first && j === 0) head = lab + (only ? '───' : '─┬─');
        else if (j === 0) head = pad + (last ? ' └─' : ' ├─');
        else head = pad + (last || only ? '   ' : ' │ ');
        lines.push(head + s);
      });
    });
    return lines;
  }
  cmd('pstree', async (argv, io) => {
    const { o, a } = getopt(argv, '');
    const showPid = o.p;
    const selfPid = ++LAB._S().pid;
    const lab = (name, pid) => showPid ? `${name}(${pid})` : name;
    const tabs = [];
    // 탭별 체인 만들기
    const all = LAB.allProcs();
    const chainNode = (startIdx, procs, tty) => {
      const p = procs[startIdx]; if (!p) return null;
      const n = { label: lab(p.exe || p.cmd, p.pid), kids: [] };
      const child = chainNode(startIdx + 1, procs, tty);
      if (child) n.kids.push(child);
      else if (tty === io.tab.tty) n.kids.push({ label: lab('pstree', selfPid), kids: [] });
      return n;
    };
    const byTty = {}; all.forEach(p => { (byTty[p.tty] = byTty[p.tty] || []).push(p); });
    const target = a[0] && /^\d+$/.test(a[0]) ? parseInt(a[0], 10) : null;
    if (target) {
      for (const tty in byTty) {
        const procs = byTty[tty]; const i = procs.findIndex(p => p.pid === target);
        if (i >= 0) { io.out(treeLines(chainNode(i, procs, tty)).join('\n') + '\n'); return 0; }
      }
      if (target === 1 || target === 2290) { /* 아래 전체 출력 */ } else return 1;
    }
    const term = { label: lab('gnome-terminal-', 2290), kids: Object.keys(byTty).sort().map(t => chainNode(0, byTty[t], t)).filter(Boolean) };
    if (target === 2290) { io.out(treeLines(term).join('\n') + '\n'); return 0; }
    const root = { label: lab('systemd', 1), kids: [
      { label: lab('NetworkManager', 795), kids: [] }, { label: lab('sshd', 1012), kids: [] },
      { label: lab('systemd', 1655), kids: [{ label: lab('gnome-shell', 1810), kids: [] }, term] },
      { label: lab('systemd-journal', 312), kids: [] }] };
    io.out(treeLines(root).join('\n') + '\n');
    return 0;
  }, { help: '프로세스를 나무 모양으로 (-p PID 표시, pstree -p PID)' });

  cmd('kill', async (argv, io) => {
    let sig = 'TERM'; const pids = [];
    const a = argv.slice(1);
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (x === '-l') { io.out(' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 4) SIGILL\t 5) SIGTRAP\n 6) SIGABRT\t 7) SIGBUS\t 8) SIGFPE\t 9) SIGKILL\t10) SIGUSR1\n11) SIGSEGV\t12) SIGUSR2\t13) SIGPIPE\t14) SIGALRM\t15) SIGTERM\n'); return 0; }
      if (x === '-s') { sig = (a[++i] || '').replace(/^SIG/, ''); continue; }
      if (/^-\d+$/.test(x)) { sig = { 9: 'KILL', 15: 'TERM', 1: 'HUP', 2: 'INT' }[x.slice(1)] || x.slice(1); continue; }
      if (/^-[A-Z]+$/.test(x)) { sig = x.slice(1).replace(/^SIG/, ''); continue; }
      pids.push(x);
    }
    if (!pids.length) { io.err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]\n'); return 2; }
    let code = 0; const me = LAB.users.get(io.sh.euser);
    for (const ps of pids) {
      const pid = parseInt(ps, 10);
      if (isNaN(pid)) { io.err(`bash: kill: ${ps}: arguments must be process or job IDs\n`); code = 1; continue; }
      const sys = SYSPROCS.find(p => p.pid === pid);
      const p = LAB.allProcs().find(x => x.pid === pid);
      if (!p) { if (sys && me.uid !== 0) { io.err(`bash: kill: (${pid}) - Operation not permitted\n`); code = 1; } else if (!sys) { io.err(`bash: kill: (${pid}) - No such process\n`); code = 1; } continue; }
      if (me.uid !== 0 && p.user !== io.sh.euser) { io.err(`bash: kill: (${pid}) - Operation not permitted\n`); code = 1; continue; }
      if (p.cmd === 'bash' && (sig === 'TERM' || sig === 'INT')) continue; // 대화형 bash는 SIGTERM/SIGINT 무시
      const curBefore = io.sh.proc;
      const tab = LAB.killProc(io.tab, pid);
      if (tab === io.tab && !tab.closed && io.sh.proc !== curBefore) {
        if (p.cmd === 'su' && sig !== 'KILL') LAB.term.print('\nSession terminated, terminating shell... ...terminated.\n');
        else LAB.term.print('Killed\n');
      } else if (tab && tab !== io.tab && !tab.closed) { /* 다른 탭 */ }
    }
    return code;
  }, { help: '프로세스에 신호 보내기 (kill PID, kill -9 PID 강제 종료)' });

  cmd('sleep', async (argv, io) => {
    const s = parseFloat(argv[1]); if (isNaN(s)) { io.err(argv[1] ? `sleep: invalid time interval ${q(argv[1])}\n` : "sleep: missing operand\nTry 'sleep --help' for more information.\n"); return 1; }
    const end = Date.now() + s * 1000; while (Date.now() < end && !io.aborted) await LAB.sleep(50);
    if (io.aborted) { LAB.term.print('^C\n'); return 130; } return 0;
  }, { help: 'N초 기다리기' });

  /* ping */
  function lookupHost(h) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return { ip: h, name: h };
    if (h === 'localhost' || h === 'localhost.localdomain' || h === LAB._S().hostname) return { ip: '::1', name: h, v6: true };
    const hosts = FS.content(FS.lookupAbs('/etc/hosts'));
    for (const line of hosts.split('\n')) {
      const ln = line.replace(/#.*/, '').trim(); if (!ln) continue;
      const [ip, ...names] = ln.split(/\s+/);
      if (names.includes(h) && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return { ip, name: names[0] };
    }
    return null;
  }
  cmd('ping', async (argv, io) => {
    const { o, a } = getopt(argv, 'ciw');
    const host = a[0];
    if (!host) { io.err('ping: usage error: Destination address required\n'); return 1; }
    const h = lookupHost(host);
    if (!h) { io.err(`ping: ${host}: Temporary failure in name resolution\n`); return 2; }
    const count = o.c ? parseInt(o.c, 10) : Infinity; const loop = h.ip.startsWith('127.') || h.ip === '::1';
    io.out(h.v6 ? `PING ${h.name} (${h.ip}) 56 data bytes\n` : `PING ${h.name === h.ip ? h.ip : h.name} (${h.ip}) 56(84) bytes of data.\n`);
    let sent = 0, recv = 0; const times = []; const t0 = Date.now();
    while (sent < count && !io.aborted) {
      sent++;
      if (loop) { const ms = 0.025 + Math.random() * 0.05; times.push(ms); recv++; io.out(`64 bytes from ${h.name === h.ip ? h.ip : `${h.name} (${h.ip})`}: icmp_seq=${sent} ttl=64 time=${ms.toFixed(3)} ms\n`); }
      else if (sent % 3 === 0) io.out(`From 10.0.2.15 icmp_seq=${sent} Destination Host Unreachable\n`);
      if (sent >= count) break;
      const end = Date.now() + 1000; while (Date.now() < end && !io.aborted) await LAB.sleep(50);
    }
    if (io.aborted) LAB.term.print('^C\n');
    const el = Date.now() - t0;
    io.out(`\n--- ${h.name === h.ip ? h.ip : h.name} ping statistics ---\n`);
    const loss = Math.round((sent - recv) / sent * 100);
    io.out(`${sent} packets transmitted, ${recv} received, ${loop ? '' : `+${Math.floor(sent / 3)} errors, `}${loss}% packet loss, time ${Math.max(0, el - 1000 + Math.floor(Math.random() * 60))}ms\n`);
    if (recv) { const mn = Math.min(...times), mx = Math.max(...times), av = times.reduce((s, x) => s + x, 0) / times.length; const md = Math.sqrt(times.reduce((s, x) => s + (x - av) ** 2, 0) / times.length); io.out(`rtt min/avg/max/mdev = ${mn.toFixed(3)}/${av.toFixed(3)}/${mx.toFixed(3)}/${md.toFixed(3)} ms\n`); }
    return recv ? 0 : 1;
  }, { help: '네트워크 응답 확인 (Ctrl+C로 멈춤, -c 횟수)' });

  /* ======================= 셸 내장·기타 ======================= */
  cmd('clear', async (argv, io) => { LAB.term.clear(); return 0; }, { help: '화면 지우기 (Ctrl+L)' });
  cmd('history', async (argv, io) => {
    const h = io.tab.history;
    if (argv[1] === '-c') { h.splice(0); try { localStorage.setItem('linuxlab.hist.v1', '[]'); } catch (e) { } return 0; }
    const n = argv[1] ? parseInt(argv[1], 10) : h.length;
    h.slice(-n).forEach((c, i) => io.out(`${String(h.length - Math.min(n, h.length) + i + 1).padStart(5)}  ${c}\n`));
    return 0;
  }, { help: '입력한 명령 기록 (!! 직전 명령 다시)' });
  cmd('type', async (argv, io) => {
    let code = 0;
    for (const n of argv.slice(1)) {
      if (LAB.aliases[n]) io.out(`${n} is aliased to \`${LAB.aliases[n]}'\n`);
      else if (['if', 'then', 'else', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac'].includes(n)) io.out(`${n} is a shell keyword\n`);
      else if (LAB.builtins.includes(n)) io.out(`${n} is a shell builtin\n`);
      else if (LAB.commands[n]) io.out(`${n} is ${['useradd', 'userdel', 'adduser', 'deluser', 'reboot'].includes(n) ? '/usr/sbin/' : '/usr/bin/'}${n}\n`);
      else { io.err(`bash: type: ${n}: not found\n`); code = 1; }
    }
    return code;
  }, { help: '명령 종류 (셸 내장 / 별칭 / 외부 유틸리티)' });
  cmd('which', async (argv, io) => {
    let code = 0;
    for (const n of argv.slice(1).filter(x => !x.startsWith('-'))) {
      if (LAB.commands[n] && !LAB.builtins.includes(n) || n === 'echo' || n === 'pwd' || n === 'kill') { if (LAB.aliases[n]) io.out(`alias ${n}='${LAB.aliases[n]}'\n\t`); io.out(`${['useradd', 'userdel', 'adduser', 'reboot'].includes(n) ? '/usr/sbin/' : '/usr/bin/'}${n}\n`); }
      else { io.err(`/usr/bin/which: no ${n} in (/home/user1/.local/bin:/home/user1/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin)\n`); code = 1; }
    }
    return code;
  }, { help: '명령 파일 위치' });
  cmd('alias', async (argv, io) => {
    if (argv.length === 1) { Object.keys(LAB.aliases).sort().forEach(k => io.out(`alias ${k}='${LAB.aliases[k]}'\n`)); return 0; }
    for (const x of argv.slice(1)) { const m = x.match(/^([^=]+)=(.*)$/); if (m) LAB.aliases[m[1]] = m[2]; else if (LAB.aliases[x]) io.out(`alias ${x}='${LAB.aliases[x]}'\n`); else { io.err(`bash: alias: ${x}: not found\n`); return 1; } }
    return 0;
  }, { help: '별칭' });
  cmd('unalias', async (argv, io) => { argv.slice(1).forEach(x => delete LAB.aliases[x]); return 0; }, { help: '별칭 지우기' });
  cmd('true', async () => 0, { help: '항상 성공' });
  cmd('false', async () => 1, { help: '항상 실패' });
  cmd('umask', async (argv, io) => { io.out('0002\n'); return 0; }, { help: '기본 권한 마스크' });
  cmd('export', async (argv, io) => { argv.slice(1).forEach(x => { const m = x.match(/^([A-Za-z_]\w*)=(.*)$/); if (m) { io.tab.vars = io.tab.vars || {}; io.tab.vars[m[1]] = m[2]; } }); return 0; }, { help: '환경 변수 설정' });
  cmd('jobs', async (argv, io) => { if (io.tab.stopped) io.out(`[1]+  Stopped                 ${io.tab.stopped.display}\n`); return 0; }, { help: '중지된 작업' });
  cmd('fg', async (argv, io) => {
    const j = io.tab.stopped; if (!j) { io.err('bash: fg: current: no such job\n'); return 1; }
    io.tab.stopped = null; LAB.term.print(j.display + '\n');
    const m = j.resume.match(/^cat >> (.+)$/);
    if (m) { const buf = []; const r = await LAB.exec(['cat'], Object.assign({}, io, { stdin: null, toTerm: false, tty: false, out: s => buf.push(s), redir: { outFile: m[1], outAppend: true } })); try { FS.write(m[1], buf.join(''), { append: true }, io.sh); } catch (e) { } return r; }
    return LAB.exec(['cat'], io);
  }, { help: '중지한 작업 다시 이어서 (Ctrl+Z 후)' });

  cmd('find', async (argv, io) => {
    const a = argv.slice(1); const paths = []; let i = 0;
    while (i < a.length && !a[i].startsWith('-')) paths.push(a[i++]);
    if (!paths.length) paths.push('.');
    let name = null, type = null, maxd = Infinity, iname = false;
    for (; i < a.length; i++) {
      if (a[i] === '-name' || a[i] === '-iname') { iname = a[i] === '-iname'; name = a[++i]; }
      else if (a[i] === '-type') type = a[++i]; else if (a[i] === '-maxdepth') maxd = parseInt(a[++i], 10);
      else { io.err(`find: unknown predicate ${q(a[i])}\n`); return 1; }
    }
    const re = name ? new RegExp('^' + name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', iname ? 'i' : '') : null;
    let code = 0;
    const walk = (p, n, depth) => {
      const t = n.type === 'f' ? 'f' : n.type;
      if ((!re || re.test(p.split('/').pop() || p)) && (!type || type === t)) io.out(p + '\n');
      if (n.type === 'd' && depth < maxd) {
        if (!FS.can(n, 'r', io.sh) || !FS.can(n, 'x', io.sh)) { io.err(`find: ${lq(p)}: Permission denied\n`); code = 1; return; }
        Object.keys(n.children).sort(byName).forEach(k => walk((p === '/' ? '' : p.replace(/\/$/, '')) + '/' + k, n.children[k], depth + 1));
      }
    };
    for (const p of paths) { const r = FS.resolve(p, {}, io.sh); if (!r.node) { io.err(`find: ${lq(p)}: No such file or directory\n`); code = 1; continue; } walk(p, r.node, 0); }
    return code;
  }, { help: '파일 찾기 (find . -name "*.txt")' });

  cmd('reboot', async (argv, io) => {
    if (!isRoot(io)) { io.err('Call to Reboot failed: Interactive authentication required.\n'); return 1; }
    await LAB.sleep(300); await LAB.reboot(); return 0;
  }, { help: '재부팅 (sudo reboot) — 일시적으로 바꾼 hostname이 원래대로' });
  cmd('shutdown', async (argv, io) => { io.err('이 실습 터미널에서는 shutdown 대신 sudo reboot을 써 보세요.\n'); return 1; }, { help: '(실습에서는 sudo reboot 사용)' });

  async function dnfCmd(argv, io) {
    const name = argv[0]; const sub = argv[1]; const yes = argv.includes('-y');
    if (!sub) { io.out(`usage: ${name} [options] COMMAND\n\nList of Main Commands:\n\ninstall    Install a package or packages on your system\nremove     Remove a package or packages from your system\nlist       List a package or groups of packages\nsearch     Search package details for the given string\ncheck-update  Check for available package upgrades\n`); return 1; }
    if ((sub === 'install' || sub === 'remove' || sub === 'update') && !isRoot(io)) { io.err('Error: This command has to be run with superuser privileges (under the root user on most systems).\n'); return 1; }
    const meta = `Last metadata expiration check: 0:21:43 ago on ${LAB.fmtDate(new Date(Date.now() - 1303000))}.\n`;
    if (sub === 'update' || sub === 'check-update') { io.out(meta + 'Dependencies resolved.\nNothing to do.\nComplete!\n'); return 0; }
    if (sub === 'install') {
      const pk = argv.slice(2).filter(x => !x.startsWith('-'))[0];
      if (!pk) { io.err('Error: Need to pass a list of pkgs to install\n'); return 1; }
      io.out(meta);
      if (pk !== 'tree') { io.err(`No match for argument: ${pk}\nError: Unable to find a match: ${pk}\n`); return 1; }
      if (LAB._S().installed.tree) { io.out('Package tree-2.1.0-8.el10.x86_64 is already installed.\nDependencies resolved.\nNothing to do.\nComplete!\n'); return 0; }
      const bar = '='.repeat(80);
      io.out(`Dependencies resolved.\n${bar}\n Package        Architecture     Version                  Repository        Size\n${bar}\nInstalling:\n tree           x86_64           2.1.0-8.el10             baseos            59 k\n\nTransaction Summary\n${bar}\nInstall  1 Package\n\nTotal download size: 59 k\nInstalled size: 115 k\n`);
      if (!yes) { const ans = await io.readLine({ prompt: 'Is this ok [y/N]: ' }); if (!ans || !/^y/i.test(ans)) { io.out('Operation aborted.\n'); return 1; } }
      for (const l of ['Downloading Packages:', 'tree-2.1.0-8.el10.x86_64.rpm                    412 kB/s |  59 kB     00:00', '-'.repeat(80), 'Total                                           118 kB/s |  59 kB     00:00', 'Running transaction check', 'Transaction check succeeded.', 'Running transaction test', 'Transaction test succeeded.', 'Running transaction', '  Preparing        :                                                        1/1', '  Installing       : tree-2.1.0-8.el10.x86_64                               1/1', '  Running scriptlet: tree-2.1.0-8.el10.x86_64                               1/1', '', 'Installed:', '  tree-2.1.0-8.el10.x86_64', '', 'Complete!']) { io.out(l + '\n'); await LAB.sleep(120); }
      LAB._S().installed.tree = true; const f = FS.mkNode('f', 'tree', 0o755, 0, 0); f.content = '\u007fELF'; FS.lookupAbs('/usr/bin').children.tree = f;
      return 0;
    }
    if (sub === 'list') { io.out('Installed Packages\nbash.x86_64                     5.2.26-6.el10                @anaconda\ncoreutils.x86_64                9.5-6.el10                   @anaconda\nvim-enhanced.x86_64             2:9.1.083-5.el10             @appstream\n' + (LAB._S().installed.tree ? 'tree.x86_64                     2.1.0-8.el10                 @baseos\n' : '')); return 0; }
    io.err(`No such command: ${sub}. Please use /usr/bin/${name} --help\n`); return 1;
  }
  cmd('dnf', dnfCmd, { help: '패키지 설치 (sudo dnf install tree) — CentOS·RHEL 계열' });
  cmd('yum', dnfCmd, { help: 'dnf와 같음 (예전 이름)' });

  cmd('tree', async (argv, io) => {
    if (!LAB._S().installed.tree) { io.err('bash: tree: command not found...\n'); return 127; }
    const { o, a } = getopt(argv, 'L');
    const start = a[0] || '.'; const r = FS.resolve(start, {}, io.sh);
    if (!r.node) { io.out(`${start}  [error opening dir]\n\n0 directories, 0 files\n`); return 2; }
    let nd = 0, nf = 0; const max = o.L ? parseInt(o.L, 10) : Infinity;
    io.outHTML(`<span class="c-dir">${esc(start)}</span>\n`, start + '\n');
    const walk = (n, pre, depth) => {
      if (depth > max) return;
      const ks = Object.keys(n.children).filter(k => o.a || !k.startsWith('.')).sort(byName);
      ks.forEach((k, i) => {
        const c = n.children[k]; const last = i === ks.length - 1;
        const cls = colorClass(c, k);
        io.outHTML(esc(pre + (last ? '└── ' : '├── ')) + (cls ? `<span class="${cls}">${esc(k)}</span>` : esc(k)) + (c.type === 'l' ? ' -&gt; ' + esc(c.target) : '') + '\n', pre + (last ? '└── ' : '├── ') + k + '\n');
        if (c.type === 'd') { nd++; if (FS.can(c, 'r', io.sh)) walk(c, pre + (last ? '    ' : '│   '), depth + 1); } else nf++;
      });
    };
    walk(r.node, '', 1);
    io.out(`\n${nd} director${nd === 1 ? 'y' : 'ies'}, ${nf} file${nf === 1 ? '' : 's'}\n`);
    return 0;
  }, { help: '디렉토리 구조를 나무 모양으로 (먼저 sudo dnf install tree)' });

  /* ======================= help / man ======================= */
  const GROUPS = [
    ['시스템 정보', ['whoami', 'hostname', 'hostnamectl', 'uname', 'date', 'who', 'tty', 'id', 'groups']],
    ['디렉토리', ['pwd', 'cd', 'ls', 'mkdir', 'rmdir', 'tree', 'find']],
    ['파일', ['touch', 'cat', 'head', 'tail', 'more', 'less', 'wc', 'grep', 'seq', 'echo', 'cp', 'mv', 'rm', 'ln', 'mkfifo', 'stat', 'file']],
    ['권한·사용자', ['chmod', 'chown', 'sudo', 'su', 'useradd', 'adduser', 'userdel', 'passwd']],
    ['프로세스·셸', ['ps', 'pstree', 'kill', 'exit', 'logout', 'history', 'type', 'which', 'clear', 'sleep', 'jobs', 'fg']],
    ['편집기·기타', ['vim', 'vi', 'man', 'ping', 'dnf', 'reboot']],
  ];
  cmd('help', async (argv, io) => {
    if (argv[1]) return LAB.exec(['man', argv[1]], io);
    io.out('GNU bash, version 5.2.26(1)-release (x86_64-redhat-linux-gnu) — 실습 터미널에서 쓸 수 있는 명령\n\n');
    for (const [g, list] of GROUPS) {
      io.outHTML(`<span class="c-head">[${esc(g)}]</span>\n`, `[${g}]\n`);
      list.forEach(c => { const m = LAB.meta[c] || {}; io.outHTML(`  <span class="c-exe">${esc(c.padEnd(12))}</span>${esc(m.help || '')}\n`, `  ${c.padEnd(12)}${m.help || ''}\n`); });
    }
    io.out('\n자세한 설명: man 명령어  ·  키: Tab 자동 완성, ↑ 이전 명령, Ctrl+C 중단, Ctrl+L 화면 지우기, Ctrl+Shift+T 새 탭\n');
    return 0;
  }, { help: '명령 목록' });

  const MAN = window.LAB_MAN || {};
  cmd('man', async (argv, io) => {
    const name = argv.filter(x => !/^\d$/.test(x))[1];
    if (!name) { io.err('What manual page do you want?\nFor example, try \'man man\'.\n'); return 1; }
    let page = MAN[name];
    if (!page && LAB.commands[name] && !LAB.builtins.includes(name)) page = `NAME\n       ${name} - ${(LAB.meta[name] || {}).help || ''}\n\nSYNOPSIS\n       ${name} [OPTION]... [ARGUMENT]...\n\nDESCRIPTION\n       (실습용 요약) ${(LAB.meta[name] || {}).help || ''}\n`;
    if (!page) { io.err(`No manual entry for ${name}\n`); return 16; }
    const sec = ['useradd', 'userdel', 'adduser', 'reboot'].includes(name) ? 8 : (['hosts', 'passwd', 'sudoers'].includes(name) ? 5 : 1);
    const head = `${name.toUpperCase()}(${sec})`;
    const title = sec === 8 ? 'System Management Commands' : 'User Commands';
    const text = `${head}${' '.repeat(Math.max(2, 40 - head.length - title.length / 2))}${title}${' '.repeat(Math.max(2, 40 - head.length - title.length / 2))}${head}\n\n${page}\n`;
    if (!io.toTerm) { io.out(text); return 0; }
    await LAB.pager(io, text, { man: true, title: `Manual page ${name}(${sec}) line 1 (press h for help or q to quit)` });
    return 0;
  }, { help: '명령 설명서 보기 (q로 나가기)' });

})(window.LAB);
