/* 리눅스 실습 터미널 — core: 이벤트, 가상 파일시스템, 사용자, 탭/터미널 화면, 파서, 실행기, 페이저 */
(function () {
  'use strict';
  const LAB = (window.LAB = window.LAB || {});

  /* ---------------- 이벤트 ---------------- */
  const listeners = {};
  LAB.on = (n, f) => { (listeners[n] = listeners[n] || []).push(f); };
  LAB.emit = (n, d) => { (listeners[n] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } }); };
  LAB.sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------------- 상태 ---------------- */
  const STORE_KEY = 'linuxlab.fs.v1';
  let S = null;            // 영구 상태(파일시스템·사용자·호스트명)
  const HOME0 = '/home/user1';

  function freshState() {
    const t = Date.now() - 1000 * 60 * 60 * 24 * 3;
    const st = {
      ino: 1310000, pid: 2340, hostnameStatic: 'ubuntu', hostname: 'ubuntu',
      users: {
        root: { uid: 0, gid: 0, home: '/root', shell: '/bin/bash', hasPassword: false, gecos: 'root' },
        user1: { uid: 1000, gid: 1000, home: HOME0, shell: '/bin/bash', hasPassword: true, gecos: 'user1' },
      },
      groups: {
        root: { gid: 0, members: [] }, adm: { gid: 4, members: ['user1'] }, cdrom: { gid: 24, members: ['user1'] },
        sudo: { gid: 27, members: ['user1'] }, dip: { gid: 30, members: ['user1'] }, plugdev: { gid: 46, members: ['user1'] },
        users: { gid: 100, members: ['user1'] }, lpadmin: { gid: 114, members: ['user1'] }, user1: { gid: 1000, members: [] },
      },
      nextUid: 1001, installed: {}, mail: {},
      root: null,
    };
    S = st;
    st.root = mkNode('d', '', 0o755, 0, 0, t);
    const D = (p, mode, uid, gid) => mkdirAbs(p, mode == null ? 0o755 : mode, uid || 0, gid || 0, t);
    const F = (p, content, mode, uid, gid) => mkfileAbs(p, content, mode == null ? 0o644 : mode, uid || 0, gid || 0, t);
    ['boot', 'dev', 'dev/pts', 'etc', 'home', 'media', 'mnt', 'opt', 'proc', 'run', 'srv', 'sys', 'usr', 'usr/bin', 'usr/sbin', 'usr/lib',
      'usr/local', 'usr/local/bin', 'usr/share', 'var', 'var/log', 'var/mail', 'var/tmp', 'snap', 'etc/skel'].forEach(p => D('/' + p));
    D('/root', 0o700); D('/tmp', 0o1777); D('/var/tmp', 0o1777);
    symAbs('/bin', 'usr/bin', t); symAbs('/sbin', 'usr/sbin', t); symAbs('/lib', 'usr/lib', t);
    ['null', 'zero', 'random', 'tty', 'sda', 'sda1', 'sda2', 'tty1', 'tty2', 'tty3'].forEach(n => {
      const node = mkNode(n.startsWith('sda') ? 'b' : 'c', n, n === 'null' || n === 'zero' || n === 'tty' || n === 'random' ? 0o666 : 0o660, 0, n.startsWith('tty') && n !== 'tty' ? 5 : (n.startsWith('sda') ? 6 : 0), t);
      lookupAbs('/dev').children[n] = node;
    });
    F('/etc/hostname', 'ubuntu\n');
    F('/etc/hosts', '127.0.0.1\tlocalhost\n127.0.1.1\tubuntu\n\n# The following lines are desirable for IPv6 capable hosts\n::1     ip6-localhost ip6-loopback\nfe00::0 ip6-localnet\nff00::0 ip6-mcastprefix\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n');
    F('/etc/os-release', 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nVERSION_CODENAME=noble\nID=ubuntu\nID_LIKE=debian\nHOME_URL="https://www.ubuntu.com/"\n');
    F('/etc/issue', 'Ubuntu 24.04.1 LTS \\n \\l\n\n');
    F('/etc/shells', '# /etc/shells: valid login shells\n/bin/sh\n/bin/bash\n/usr/bin/bash\n/bin/dash\n');
    F('/etc/passwd', '', 0o644).dynamic = 'passwd';
    F('/etc/group', '', 0o644).dynamic = 'group';
    F('/etc/shadow', '', 0o640, 0, 42).dynamic = 'shadow';
    F('/etc/sudoers', '#\n# This file MUST be edited with the \'visudo\' command as root.\n#\nDefaults\tenv_reset\nDefaults\tmail_badpass\nDefaults\tsecure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\n\n# User privilege specification\nroot\tALL=(ALL:ALL) ALL\n\n# Members of the admin group may gain root privileges\n%admin ALL=(ALL) ALL\n\n# Allow members of group sudo to execute any command\n%sudo\tALL=(ALL:ALL) ALL\n\n@includedir /etc/sudoers.d\n', 0o440);
    D('/etc/sudoers.d', 0o750);
    F('/etc/skel/.bashrc', BASHRC); F('/etc/skel/.profile', PROFILE); F('/etc/skel/.bash_logout', '# ~/.bash_logout: executed by bash(1) when login shell exits.\n');
    F('/var/log/syslog', 'Oct 27 08:58:02 ubuntu systemd[1]: Started session-2.scope - Session 2 of User user1.\n', 0o640, 104, 4);
    D(HOME0, 0o750, 1000, 1000);
    ['Desktop', 'Documents', 'Downloads', 'Music', 'Pictures', 'Public', 'Templates', 'Videos'].forEach(n => D(HOME0 + '/' + n, 0o755, 1000, 1000));
    F(HOME0 + '/.bashrc', BASHRC, 0o644, 1000, 1000); F(HOME0 + '/.profile', PROFILE, 0o644, 1000, 1000);
    F(HOME0 + '/.bash_logout', '# ~/.bash_logout: executed by bash(1) when login shell exits.\n', 0o644, 1000, 1000);
    F(HOME0 + '/test2.sh', '#!/bin/bash\necho "Hello, Linux!"\necho "오늘 날짜: $(date +%F)"\n', 0o664, 1000, 1000);
    F(HOME0 + '/Documents/linux_note.txt', 'Linux = 커널(kernel)\nShell = 명령어 해석기(bash)\n루트 디렉토리 = /\n홈 디렉토리 = ~\n', 0o664, 1000, 1000);
    BIN.forEach(n => F('/usr/bin/' + n, '\u007fELF', 0o755));
    ['useradd', 'userdel', 'usermod', 'adduser', 'deluser', 'reboot', 'shutdown'].forEach(n => F('/usr/sbin/' + n, '\u007fELF', 0o755));
    return st;
  }
  const BASHRC = '# ~/.bashrc: executed by bash(1) for non-login shells.\n\n# If not running interactively, don\'t do anything\ncase $- in\n    *i*) ;;\n      *) return;;\nesac\n\nHISTSIZE=1000\nHISTFILESIZE=2000\n\nalias ls=\'ls --color=auto\'\nalias grep=\'grep --color=auto\'\nalias ll=\'ls -alF\'\nalias la=\'ls -A\'\nalias l=\'ls -CF\'\n';
  const PROFILE = '# ~/.profile: executed by the command interpreter for login shells.\n\nif [ -n "$BASH_VERSION" ]; then\n    if [ -f "$HOME/.bashrc" ]; then\n\t. "$HOME/.bashrc"\n    fi\nfi\n';
  const BIN = ['bash', 'sh', 'ls', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'echo', 'pwd', 'head', 'tail', 'more', 'less', 'wc', 'grep', 'seq', 'date',
    'uname', 'hostname', 'hostnamectl', 'whoami', 'who', 'id', 'groups', 'tty', 'stat', 'file', 'chmod', 'chown', 'passwd', 'su', 'sudo', 'ps', 'pstree',
    'kill', 'man', 'mkfifo', 'ping', 'vi', 'vim', 'ln', 'find', 'which', 'clear', 'sleep', 'true', 'false', 'apt', 'gnome-terminal'];

  function mkNode(type, name, mode, uid, gid, t) {
    t = t || Date.now();
    const n = { type, name, mode, uid, gid, ino: (S ? ++S.ino : 1310000), atime: t, mtime: t, ctime: t, btime: t };
    if (type === 'd') n.children = {};
    if (type === 'f') n.content = '';
    return n;
  }
  function lookupAbs(p) {
    let n = S.root;
    for (const part of p.split('/').filter(Boolean)) { if (!n || n.type !== 'd') return null; n = n.children[part]; }
    return n || null;
  }
  function mkdirAbs(p, mode, uid, gid, t) {
    const parts = p.split('/').filter(Boolean); let n = S.root;
    parts.forEach((part, i) => {
      if (!n.children[part]) n.children[part] = mkNode('d', part, i === parts.length - 1 ? mode : 0o755, i === parts.length - 1 ? uid : 0, i === parts.length - 1 ? gid : 0, t);
      n = n.children[part];
    });
    return n;
  }
  function mkfileAbs(p, content, mode, uid, gid, t) {
    const i = p.lastIndexOf('/'); const dir = lookupAbs(p.slice(0, i) || '/'); const name = p.slice(i + 1);
    const f = mkNode('f', name, mode, uid, gid, t); f.content = content; dir.children[name] = f; return f;
  }
  function symAbs(p, target, t) {
    const i = p.lastIndexOf('/'); const dir = lookupAbs(p.slice(0, i) || '/'); const name = p.slice(i + 1);
    const l = mkNode('l', name, 0o777, 0, 0, t); l.target = target; dir.children[name] = l; return l;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* 저장 불가 환경 */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) { const st = JSON.parse(raw); if (st && st.root && st.users) { S = st; S.hostname = S.hostnameStatic = readHostnameFile() || S.hostnameStatic; return true; } }
    } catch (e) { /* 무시 */ }
    return false;
  }
  function readHostnameFile() { const n = S && lookupAbs('/etc/hostname'); return n && n.type === 'f' ? n.content.trim() : null; }
  LAB.save = save;

  /* ---------------- 사용자 ---------------- */
  const U = LAB.users = {
    get: name => S.users[name] || null,
    byUid: uid => Object.keys(S.users).find(k => S.users[k].uid === uid) || String(uid),
    groupByGid: gid => Object.keys(S.groups).find(k => S.groups[k].gid === gid) || String(gid),
    groupsOf(name) {
      const u = S.users[name]; if (!u) return [];
      const prim = U.groupByGid(u.gid);
      const list = [prim];
      Object.keys(S.groups).sort((a, b) => S.groups[a].gid - S.groups[b].gid).forEach(g => { if (g !== prim && S.groups[g].members.includes(name)) list.push(g); });
      return list;
    },
    inGroup: (name, gid) => { const u = S.users[name]; if (!u) return false; if (u.gid === gid) return true; const g = U.groupByGid(gid); return !!(S.groups[g] && S.groups[g].members.includes(name)); },
    add(name, opts) {
      const uid = S.nextUid++;
      S.users[name] = { uid, gid: uid, home: '/home/' + name, shell: opts.shell || '/bin/sh', hasPassword: false, gecos: opts.gecos || '' };
      S.groups[name] = { gid: uid, members: [] };
      return S.users[name];
    },
    del(name) {
      delete S.users[name];
      if (S.groups[name]) delete S.groups[name];
      Object.values(S.groups).forEach(g => { g.members = g.members.filter(m => m !== name); });
    },
  };
  function dynamicContent(n) {
    if (n.dynamic === 'passwd') {
      const sys = 'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nbin:x:2:2:bin:/bin:/usr/sbin/nologin\nsys:x:3:3:sys:/dev:/usr/sbin/nologin\nsync:x:4:65534:sync:/bin:/bin/sync\n';
      return Object.keys(S.users).sort((a, b) => S.users[a].uid - S.users[b].uid).map((k, i) => {
        const u = S.users[k]; const line = `${k}:x:${u.uid}:${u.gid}:${u.gecos}:${u.home}:${u.shell}\n`;
        return i === 0 ? line + sys : line;
      }).join('');
    }
    if (n.dynamic === 'group') return Object.keys(S.groups).sort((a, b) => S.groups[a].gid - S.groups[b].gid).map(k => `${k}:x:${S.groups[k].gid}:${S.groups[k].members.join(',')}\n`).join('');
    if (n.dynamic === 'shadow') return Object.keys(S.users).sort((a, b) => S.users[a].uid - S.users[b].uid).map(k => `${k}:${S.users[k].hasPassword ? '$y$j9T$' + btoa(k + 'salt').slice(0, 22) : (k === 'root' ? '*' : '!')}:20380:0:99999:7:::\n`).join('');
    return n.content;
  }

  /* ---------------- 탭(터미널) & 셸 ---------------- */
  const tabs = []; let active = null; let nextPts = 0;
  function newShell(tab) {
    const term = { pid: ++S.pid + 200, ppid: 2290, user: 'user1', cmd: 'bash', tty: tab.tty, start: Date.now(), cwd: HOME0, login: false, oldpwd: null };
    S.pid = term.pid;
    tab.procs = [term];
  }
  const shOf = tab => ({
    get tab() { return tab; },
    get proc() { const ps = tab.procs; for (let i = ps.length - 1; i >= 0; i--) if (ps[i].cmd === 'bash') return ps[i]; return null; },
    get user() { return this.proc ? this.proc.user : 'user1'; },
    get euser() { return tab.euser || this.user; },
    get cwd() { return this.proc ? this.proc.cwd : '/'; },
    set cwd(v) { this.proc.oldpwd = this.proc.cwd; this.proc.cwd = v; },
    get hostname() { return S.hostname; },
    home(u) { const x = S.users[u || this.user]; return x ? x.home : '/'; },
    get procs() { return tab.procs; },
    get lastExit() { return tab.lastExit || 0; },
    get history() { return tab.history; },
    get users() { return S.users; },
  });
  LAB.sh = new Proxy({}, { get: (_, k) => { const s = shOf(active); const v = s[k]; return typeof v === 'function' ? v.bind(s) : v; } });
  LAB.state = () => ({ user: LAB.sh.user, euser: LAB.sh.euser, cwd: LAB.sh.cwd, hostname: S.hostname, hostnameStatic: readHostnameFile(), procs: active.procs.slice(), users: JSON.parse(JSON.stringify(S.users)), groups: JSON.parse(JSON.stringify(S.groups)), history: active.history.slice(), tty: active.tty, tabs: tabs.length });
  LAB._S = () => S;
  LAB._tab = () => active;
  LAB.allProcs = () => tabs.flatMap(t => t.procs);

  /* ---------------- 파일시스템 API ---------------- */
  const FS = LAB.fs = {};
  function normalize(path, cwd, user) {
    if (path === '' || path == null) return cwd;
    if (path[0] === '~') {
      const m = path.match(/^~([a-z_][a-z0-9_-]*)?(\/.*)?$/);
      if (m) { const h = m[1] ? (S.users[m[1]] ? S.users[m[1]].home : null) : (S.users[user] ? S.users[user].home : '/'); if (h) path = h + (m[2] || ''); }
    }
    const abs = path[0] === '/' ? path : (cwd === '/' ? '' : cwd) + '/' + path;
    const out = [];
    abs.split('/').forEach(p => { if (!p || p === '.') return; if (p === '..') out.pop(); else out.push(p); });
    return '/' + out.join('/');
  }
  FS.abs = (p, sh) => normalize(p, (sh || LAB.sh).cwd, (sh || LAB.sh).user);
  function canU(node, perm, user) {
    const u = S.users[user]; if (!u) return false;
    if (u.uid === 0) return perm !== 'x' || node.type === 'd' || (node.mode & 0o111) !== 0;
    const bit = perm === 'r' ? 4 : perm === 'w' ? 2 : 1;
    if (node.uid === u.uid) return ((node.mode >> 6) & bit) !== 0;
    if (U.inGroup(user, node.gid)) return ((node.mode >> 3) & bit) !== 0;
    return (node.mode & bit) !== 0;
  }
  FS.can = (node, perm, sh) => canU(node, perm, (sh || LAB.sh).euser);
  // resolve: 경로 탐색(중간 디렉토리 x 권한·심볼릭 링크 처리)
  FS.resolve = function (path, opts, sh) {
    opts = opts || {}; sh = sh || LAB.sh;
    const abs = normalize(path, sh.cwd, sh.user);
    const parts = abs.split('/').filter(Boolean);
    let node = S.root, parent = null, cur = '';
    for (let i = 0; i < parts.length; i++) {
      if (node.type !== 'd') return { node: null, parent: null, name: parts[i], abs, err: 'ENOTDIR' };
      if (!canU(node, 'x', sh.euser)) return { node: null, parent: null, name: parts[i], abs, err: 'EACCES' };
      parent = node; let child = node.children[parts[i]];
      cur += '/' + parts[i];
      const last = i === parts.length - 1;
      let guard = 0;
      while (child && child.type === 'l' && (!last || !opts.nofollow) && guard++ < 8) {
        const tgt = normalize(child.target, cur.slice(0, cur.lastIndexOf('/')) || '/', sh.user);
        const r = FS.resolve(tgt, { nofollow: false }, { cwd: '/', user: sh.user, euser: sh.euser });
        child = r.node;
        if (!child) return { node: null, parent: last ? parent : null, name: parts[i], abs, err: r.err || 'ENOENT', dangling: true };
      }
      if (!child) return { node: null, parent: last ? parent : null, name: parts[i], abs, err: 'ENOENT' };
      node = child;
    }
    return { node, parent, name: parts.length ? parts[parts.length - 1] : '/', abs };
  };
  FS.exists = (p, sh) => !!FS.resolve(p, {}, sh).node;
  FS.isDir = (p, sh) => { const r = FS.resolve(p, {}, sh); return !!(r.node && r.node.type === 'd'); };
  FS.content = n => (n.dynamic ? dynamicContent(n) : (n.content || ''));
  FS.read = function (path, sh) {
    sh = sh || LAB.sh;
    const r = FS.resolve(path, {}, sh);
    if (!r.node) throw { code: r.err || 'ENOENT' };
    if (r.node.type === 'd') throw { code: 'EISDIR' };
    if (!canU(r.node, 'r', sh.euser)) throw { code: 'EACCES' };
    const nw = Date.now(), n0 = r.node;
    if (n0.atime <= n0.mtime || n0.atime <= n0.ctime || nw - n0.atime > 864e5) n0.atime = nw; // relatime
    return FS.content(r.node);
  };
  FS.create = function (path, type, sh, mode) {
    sh = sh || LAB.sh;
    const r = FS.resolve(path, { nofollow: true }, sh);
    if (r.node) throw { code: 'EEXIST', node: r.node };
    if (!r.parent) throw { code: r.err || 'ENOENT' };
    if (!canU(r.parent, 'w', sh.euser)) throw { code: 'EACCES' };
    const u = S.users[sh.euser];
    const def = type === 'd' ? 0o775 : 0o664;
    const n = mkNode(type, r.name, mode != null ? mode : (u.uid === 0 ? (type === 'd' ? 0o755 : 0o644) : def), u.uid, u.gid);
    r.parent.children[r.name] = n; r.parent.mtime = r.parent.ctime = Date.now();
    return n;
  };
  FS.write = function (path, text, opts, sh) {
    opts = opts || {}; sh = sh || LAB.sh;
    const r = FS.resolve(path, {}, sh);
    let n = r.node;
    if (n && n.type === 'd') throw { code: 'EISDIR' };
    if (!n) {
      if (r.dangling) throw { code: 'ENOENT' };
      n = FS.create(path, 'f', sh);
    } else if (!canU(n, 'w', sh.euser)) throw { code: 'EACCES' };
    if (n.type === 'p') { return LAB.fifoWrite(n, text); }
    if (n.dynamic) throw { code: 'EACCES' };
    if (n.type === 'c' || n.type === 'b') return;
    n.content = opts.append ? (n.content || '') + text : text;
    n.mtime = n.ctime = Date.now();
    if (abspathOf(n) === '/etc/hostname') S.hostnameStatic = n.content.trim();
    return n;
  };
  FS.unlink = function (r) { delete r.parent.children[r.name]; r.parent.mtime = r.parent.ctime = Date.now(); };
  FS.lookupAbs = p => lookupAbs(p);
  function abspathOf(target) {
    const walk = (n, p) => { if (n === target) return p || '/'; if (n.type !== 'd') return null; for (const k in n.children) { const x = walk(n.children[k], (p === '/' ? '' : p) + '/' + k); if (x) return x; } return null; };
    return walk(S.root, '/');
  }
  FS.pathOf = abspathOf;
  FS.newIno = () => ++S.ino;
  FS.mkNode = (type, name, mode, uid, gid) => mkNode(type, name, mode, uid, gid);

  /* FIFO (이름 있는 파이프): 탭 사이에서 쓰기/읽기가 만나야 진행 */
  const fifos = new Map();
  function fq(n) { if (!fifos.has(n.ino)) fifos.set(n.ino, { data: [], readers: [], writers: [] }); return fifos.get(n.ino); }
  LAB.fifoWrite = (n, text) => new Promise(res => {
    const q = fq(n);
    if (q.readers.length) { const rd = q.readers.shift(); rd(text); res(); }
    else q.writers.push({ text, done: res });
  });
  LAB.fifoRead = (n, abortCheck) => new Promise(res => {
    const q = fq(n);
    if (q.writers.length) { const w = q.writers.shift(); w.done(); res(w.text); return; }
    q.readers.push(res);
  });
  LAB.fifoCancel = n => { const q = fq(n); q.readers = []; q.writers.forEach(w => w.done()); q.writers = []; };

  /* ---------------- 화면 ---------------- */
  const $ = s => document.querySelector(s);
  let els = {};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  LAB.esc = esc;

  function makeTab() {
    const tab = { id: Math.random().toString(36).slice(2), tty: 'pts/' + (nextPts++), out: document.createElement('div'), history: loadHist(), hidx: -1,
      lastExit: 0, busy: false, abort: false, read: null, fs: null, buf: '', euser: null, closed: false };
    tab.out.className = 'term-out';
    newShell(tab);
    tabs.push(tab);
    return tab;
  }
  function loadHist() { try { return JSON.parse(localStorage.getItem('linuxlab.hist.v1') || '[]'); } catch (e) { return []; } }
  function saveHist(h) { try { localStorage.setItem('linuxlab.hist.v1', JSON.stringify(h.slice(-300))); } catch (e) { } }

  function switchTab(tab) {
    if (active && active.fs) { /* 전체화면 앱은 탭에 남겨 둠 */ }
    active = tab;
    els.screen.innerHTML = ''; els.screen.appendChild(tab.out);
    renderTabs(); renderTitle(); renderInput(); scrollBottom();
    els.fsLayer.hidden = !tab.fs; if (tab.fs) tab.fs.render(els.fsLayer);
    els.closed.hidden = !tab.closed;
    LAB.term.focus();
  }
  function renderTabs() {
    els.tabs.hidden = tabs.length < 2;
    els.tabs.innerHTML = tabs.map(t => `<button class="tt${t === active ? ' on' : ''}" data-id="${t.id}" type="button"><span>${esc(titleOf(t))}</span><i data-close="${t.id}" title="탭 닫기">×</i></button>`).join('');
  }
  function titleOf(t) {
    const p = (() => { const s = t.procs.slice().reverse().find(x => x.cmd === 'bash'); return s; })();
    if (!p) return 'Terminal';
    return `${p.user}@${S.hostname}: ${prettyPath(p.cwd, p.user)}`;
  }
  function renderTitle() { els.title.textContent = titleOf(active); document.title = '리눅스 터미널 실습실'; }
  function prettyPath(cwd, user) {
    const h = S.users[user] ? S.users[user].home : null;
    if (h && h !== '/' && (cwd === h || cwd.startsWith(h + '/'))) return '~' + cwd.slice(h.length);
    return cwd;
  }
  LAB.prettyPath = prettyPath;
  function promptHTML(tab) {
    const s = shOf(tab); const root = s.user === 'root';
    return `<span class="p-user">${esc(s.user)}@${esc(S.hostname)}</span><span class="p-colon">:</span><span class="p-path">${esc(prettyPath(s.cwd, s.user))}</span><span class="p-sign">${root ? '#' : '$'}</span> `;
  }
  function printTo(tab, text, cls) {
    const lines = String(text).split('\n');
    const frag = document.createDocumentFragment();
    // 마지막 줄이 열려 있으면 이어 붙임
    let last = tab.out.lastElementChild;
    lines.forEach((ln, i) => {
      if (i === 0 && last && last.dataset.open === '1') { appendSpan(last, ln, cls); if (lines.length > 1) last.dataset.open = '0'; return; }
      const d = document.createElement('div'); d.className = 'ln';
      appendSpan(d, ln, cls);
      if (i === lines.length - 1) { if (ln === '') return; d.dataset.open = '1'; }
      frag.appendChild(d);
    });
    tab.out.appendChild(frag);
    trim(tab);
    if (tab === active) scrollBottom();
  }
  function appendSpan(div, text, cls) {
    if (text === '') { if (!div.firstChild) div.innerHTML = ''; return; }
    if (cls === 'html') { div.insertAdjacentHTML('beforeend', text); return; }
    const sp = document.createElement('span'); if (cls) sp.className = cls; sp.textContent = text; div.appendChild(sp);
  }
  function trim(tab) { while (tab.out.childElementCount > 3000) tab.out.firstElementChild.remove(); }
  function scrollBottom() { els.body.scrollTop = els.body.scrollHeight; }

  LAB.term = {
    print: (t, cls) => printTo(active, t, cls),
    printHTML: h => printTo(active, h, 'html'),
    clear: () => { active.out.innerHTML = ''; },
    focus: () => { if (els.kbd) { try { els.kbd.focus({ preventScroll: true }); } catch (e) { els.kbd.focus(); } } },
    size() { const cw = charW(); const w = els.body.clientWidth - 20; const h = els.body.clientHeight - 12; return { cols: Math.max(20, Math.floor(w / cw.w)), rows: Math.max(8, Math.floor(h / cw.h)) }; },
    readLine: o => readLineOn(active, o || {}),
    fullscreen: h => setFullscreen(active, h),
  };
  let cwCache = null;
  function charW() {
    if (cwCache) return cwCache;
    const s = document.createElement('span'); s.className = 'ln'; s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'; s.textContent = 'MMMMMMMMMM';
    els.body.appendChild(s); const r = s.getBoundingClientRect(); s.remove();
    cwCache = { w: r.width / 10 || 9, h: r.height || 18 }; return cwCache;
  }
  window.addEventListener('resize', () => { cwCache = null; if (active && active.fs) active.fs.render(els.fsLayer); });

  function readLineOn(tab, o) {
    return new Promise(res => { tab.read = { prompt: o.prompt || '', hidden: !!o.hidden, res, buf: '' }; tab.buf = ''; if (tab === active) { els.kbd.value = ''; renderInput(); } });
  }
  function setFullscreen(tab, h) {
    if (tab.fs && tab.fs.exit && h === null) { /* 앱이 스스로 종료 */ }
    tab.fs = h;
    if (tab === active) {
      els.fsLayer.hidden = !h; els.inputLine.hidden = !!h || tab.busy && !tab.read;
      if (h) { h.render(els.fsLayer); } else { els.fsLayer.innerHTML = ''; renderInput(); scrollBottom(); LAB.term.focus(); }
    }
  }
  LAB.fsRender = () => { if (active.fs) active.fs.render(els.fsLayer); };

  function renderInput() {
    const tab = active;
    if (!els.inputLine) return;
    if (tab.closed) { els.inputLine.hidden = true; return; }
    const reading = !!tab.read;
    els.inputLine.hidden = !!tab.fs || (tab.busy && !reading);
    const val = els.kbd.value; const pos = els.kbd.selectionStart == null ? val.length : els.kbd.selectionStart;
    const shown = reading && tab.read.hidden ? '' : val;
    const p = reading ? esc(tab.read.prompt) : promptHTML(tab);
    const before = esc(shown.slice(0, reading && tab.read.hidden ? 0 : pos));
    const atRaw = reading && tab.read.hidden ? ' ' : (shown[pos] || ' ');
    const after = esc(reading && tab.read.hidden ? '' : shown.slice(pos + 1));
    els.inputLine.innerHTML = `${p}<span class="in">${before}<span class="cur${els.focused ? '' : ' blur'}">${esc(atRaw)}</span>${after}</span>`;
    if (tab === active) scrollBottom();
  }
  LAB.renderInput = renderInput;
  LAB.insert = text => {
    const tab = active; if (tab.busy || tab.fs || tab.closed) { LAB.term.focus(); return; }
    els.kbd.value = text; els.kbd.setSelectionRange(text.length, text.length); renderInput(); LAB.term.focus();
  };

  /* ---------------- 입력 처리 ---------------- */
  function onKeyDown(e) {
    const tab = active;
    if (tab.closed) return;
    // Ctrl+Shift+T: 새 탭
    if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) { e.preventDefault(); openTab(); return; }
    if (tab.fs) {
      if (e.isComposing || e.key === 'Process') return;
      const handled = tab.fs.key(e);
      if (handled !== false) e.preventDefault();
      return;
    }
    if (e.ctrlKey && !e.altKey && (e.key === 'c' || e.key === 'C') && !e.shiftKey) {
      const sel = window.getSelection && String(window.getSelection());
      if (sel && sel.length && !tab.busy) return; // 복사 허용
      e.preventDefault();
      if (tab.read) { const r = tab.read; tab.read = null; printTo(tab, (r.hidden ? r.prompt : r.prompt + els.kbd.value) + '^C\n'); els.kbd.value = ''; r.res(null); renderInput(); return; }
      if (tab.busy) { tab.abort = true; if (tab.onAbort) tab.onAbort(); return; }
      printTo(tab, promptHTML(tab) + esc(els.kbd.value) + '^C\n', 'html'); els.kbd.value = ''; tab.lastExit = 130; renderInput(); return;
    }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); if (!tab.busy) { LAB.term.clear(); renderInput(); } return; }
    if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      if (tab.read) { if (els.kbd.value === '') { const r = tab.read; tab.read = null; r.res('\u0004'); renderInput(); } return; }
      if (!tab.busy && els.kbd.value === '') { printTo(tab, promptHTML(tab) + '\n', 'html'); runLine(tab, 'exit', true); }
      return;
    }
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (tab.read && tab.onStop) tab.onStop(); return; }
    if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); const p = els.kbd.selectionStart; els.kbd.value = els.kbd.value.slice(p); els.kbd.setSelectionRange(0, 0); renderInput(); return; }
    if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); els.kbd.value = els.kbd.value.slice(0, els.kbd.selectionStart); renderInput(); return; }
    if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); els.kbd.setSelectionRange(0, 0); renderInput(); return; }
    if (e.ctrlKey && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); const n = els.kbd.value.length; els.kbd.setSelectionRange(n, n); renderInput(); return; }
    if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); const p = els.kbd.selectionStart; const v = els.kbd.value; const m = v.slice(0, p).match(/\S+\s*$/); const s = m ? p - m[0].length : p; els.kbd.value = v.slice(0, s) + v.slice(p); els.kbd.setSelectionRange(s, s); renderInput(); return; }
    if (e.key === 'Enter') {
      e.preventDefault(); if (e.isComposing) return;
      const v = els.kbd.value; els.kbd.value = '';
      if (tab.read) { const r = tab.read; tab.read = null; printTo(tab, r.prompt + (r.hidden ? '' : v) + '\n'); r.res(v); renderInput(); return; }
      if (tab.busy) return;
      printTo(tab, promptHTML(tab) + esc(v) + '\n', 'html');
      runLine(tab, v, true);
      return;
    }
    if (tab.busy && !tab.read) { if (e.key.length === 1 || e.key === 'Backspace') e.preventDefault(); return; }
    if (e.key === 'Tab') { e.preventDefault(); if (!tab.read) complete(tab); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); if (tab.read) return;
      const h = tab.history; if (!h.length) return;
      if (tab.hidx === -1) { tab.draft = els.kbd.value; tab.hidx = h.length; }
      tab.hidx += e.key === 'ArrowUp' ? -1 : 1;
      if (tab.hidx < 0) tab.hidx = 0;
      if (tab.hidx >= h.length) { tab.hidx = -1; els.kbd.value = tab.draft || ''; } else els.kbd.value = h[tab.hidx];
      const n = els.kbd.value.length; els.kbd.setSelectionRange(n, n); renderInput(); return;
    }
    setTimeout(renderInput, 0);
  }
  function onInput(e) {
    const tab = active;
    if (tab.fs) {
      const v = els.kbd.value; els.kbd.value = '';
      if (v && !e.isComposing) for (const ch of v) tab.fs.key({ key: ch, synthetic: true, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, preventDefault() { } });
      return;
    }
    if (tab.busy && !tab.read) { els.kbd.value = ''; return; }
    tab.hidx = -1; renderInput();
  }

  /* 탭 완성 */
  function complete(tab) {
    const v = els.kbd.value; const pos = els.kbd.selectionStart; const left = v.slice(0, pos);
    const m = left.match(/(\S*)$/); const word = m[1]; const isCmd = /^\s*(sudo\s+)?\S*$/.test(left);
    const sh = shOf(tab);
    let cands = [];
    if (isCmd && !word.includes('/')) {
      cands = Object.keys(CMDS).concat(Object.keys(ALIASES)).filter(c => c.startsWith(word) && !c.startsWith('_')).sort();
      cands = [...new Set(cands)].map(c => c + ' ');
    } else {
      const slash = word.lastIndexOf('/'); const dirPart = slash >= 0 ? word.slice(0, slash + 1) : ''; const base = slash >= 0 ? word.slice(slash + 1) : word;
      const r = FS.resolve(dirPart || '.', {}, sh);
      if (r.node && r.node.type === 'd' && canU(r.node, 'r', sh.euser)) {
        cands = Object.keys(r.node.children).filter(n => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.'))).sort().map(n => {
          let c = r.node.children[n]; if (c.type === 'l') { const rr = FS.resolve((dirPart || '') + n, {}, sh); c = rr.node || c; }
          return dirPart + n + (c.type === 'd' ? '/' : ' ');
        });
      }
    }
    if (!cands.length) return;
    let common = cands[0];
    cands.forEach(c => { let i = 0; while (i < common.length && c[i] === common[i]) i++; common = common.slice(0, i); });
    if (cands.length === 1 || common.length > word.length) {
      const ins = cands.length === 1 ? cands[0] : common;
      els.kbd.value = left.slice(0, left.length - word.length) + ins + v.slice(pos);
      const np = left.length - word.length + ins.length; els.kbd.setSelectionRange(np, np); renderInput();
    } else if (tab.lastTab === v) {
      printTo(tab, promptHTML(tab) + esc(v) + '\n', 'html');
      printTo(tab, cands.map(c => c.trim()).join('  ') + '\n');
      renderInput();
    }
    tab.lastTab = v;
  }

  /* ---------------- 파서 ---------------- */
  // 결과: [{pipeline:[{argv, redirs:[{op,target,fd}]}], op:';'|'&&'|'||'}]
  function tokenize(line, sh, tab) {
    const toks = []; let cur = null; let i = 0; const L = line.length;
    const push = () => { if (cur) { toks.push(cur); cur = null; } };
    const word = () => { if (!cur) cur = { t: 'w', v: '', q: false, glob: false }; return cur; };
    while (i < L) {
      const c = line[i];
      if (c === ' ' || c === '\t') { push(); i++; continue; }
      if (c === '#' && !cur) break;
      if (c === '|' && line[i + 1] === '|') { push(); toks.push({ t: 'op', v: '||' }); i += 2; continue; }
      if (c === '&' && line[i + 1] === '&') { push(); toks.push({ t: 'op', v: '&&' }); i += 2; continue; }
      if (c === '|' || c === ';') { push(); toks.push({ t: 'op', v: c }); i++; continue; }
      if (c === '2' && line[i + 1] === '>' && !cur) { push(); if (line[i + 2] === '&' && line[i + 3] === '1') { toks.push({ t: 'r', v: '2>&1' }); i += 4; } else if (line[i + 2] === '>') { toks.push({ t: 'r', v: '2>>' }); i += 3; } else { toks.push({ t: 'r', v: '2>' }); i += 2; } continue; }
      if (c === '>' ) { push(); if (line[i + 1] === '>') { toks.push({ t: 'r', v: '>>' }); i += 2; } else { toks.push({ t: 'r', v: '>' }); i++; } continue; }
      if (c === '<') { push(); toks.push({ t: 'r', v: '<' }); i++; continue; }
      if (c === '&') { push(); i++; continue; }
      if (c === '\\' && i + 1 < L) { word().v += line[i + 1]; cur.q = true; i += 2; continue; }
      if (c === "'") { const j = line.indexOf("'", i + 1); const end = j < 0 ? L : j; word().v += line.slice(i + 1, end); cur.q = true; i = end + 1; continue; }
      if (c === '"') {
        let j = i + 1; let s = '';
        while (j < L && line[j] !== '"') { if (line[j] === '\\' && j + 1 < L && '"\\$`'.includes(line[j + 1])) { s += line[j + 1]; j += 2; continue; } s += line[j]; j++; }
        s = s.replace(/\$\(([^)]*)\)/g, (m, inner) => CMDSUB(inner, sh, tab)).replace(/`([^`]*)`/g, (m, inner) => CMDSUB(inner, sh, tab));
        word().v += expandVars(s, sh, tab); cur.q = true; i = j + 1; continue;
      }
      if (c === '$') {
        const m = line.slice(i).match(/^\$(\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*|\$|\?|#|0|\(([^)]*)\))/);
        if (m) {
          if (m[2] !== undefined) { word().v += CMDSUB(m[2], sh, tab); i += m[0].length; continue; }
          word().v += expandVars(m[0], sh, tab); i += m[0].length; continue;
        }
      }
      if (c === '`') { const j = line.indexOf('`', i + 1); const end = j < 0 ? L : j; word().v += CMDSUB(line.slice(i + 1, end), sh, tab); i = end + 1; continue; }
      const w = word(); if ((c === '*' || c === '?') ) w.glob = true;
      if (c === '~' && w.v === '' && !w.q) w.tilde = true;
      w.v += c; i++;
    }
    push();
    return toks;
  }
  // $(...) 명령 치환: 간단한 명령만 동기로 처리
  function CMDSUB(src, sh, tab) {
    src = src.trim();
    if (/^date\b/.test(src)) { const a = src.split(/\s+/); return fmtDate(new Date(), a[1] && a[1][0] === '+' ? a[1].slice(1) : null).trim(); }
    if (src === 'whoami') return sh.euser; if (src === 'pwd') return sh.cwd; if (src === 'hostname') return S.hostname;
    if (src === 'tty') return '/dev/' + tab.tty;
    return '';
  }
  function expandVars(s, sh, tab) {
    return s.replace(/\$(\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*)|\$|\?|#|0)/g, (all, _, b, c) => {
      const name = b || c || all.slice(1);
      switch (name) {
        case '$': return String(sh.proc.pid);
        case '?': return String(tab.lastExit || 0);
        case '#': return '0';
        case '0': return 'bash';
        case 'USER': case 'LOGNAME': return sh.user;
        case 'HOME': return sh.home();
        case 'PWD': return sh.cwd;
        case 'OLDPWD': return sh.proc.oldpwd || '';
        case 'HOSTNAME': return S.hostname;
        case 'SHELL': return (S.users[sh.user] || {}).shell || '/bin/bash';
        case 'PATH': return '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin';
        case 'LANG': return 'C.UTF-8';
        case 'TERM': return 'xterm-256color';
        case 'PPID': return String(sh.proc.ppid);
        case 'UID': return String((S.users[sh.user] || {}).uid);
        case 'BASH_VERSION': return '5.2.21(1)-release';
        case 'PS1': return '\\u@\\h:\\w\\$ ';
        default: return (tab.vars && tab.vars[name]) || '';
      }
    });
  }
  function globExpand(pattern, sh) {
    const slash = pattern.lastIndexOf('/'); const dir = slash >= 0 ? pattern.slice(0, slash + 1) : ''; const pat = pattern.slice(slash + 1);
    if (!/[*?]/.test(pat)) return [pattern];
    const r = FS.resolve(dir || '.', {}, sh);
    if (!r.node || r.node.type !== 'd' || !canU(r.node, 'r', sh.euser)) return [pattern];
    const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const hits = Object.keys(r.node.children).filter(n => re.test(n) && (pat.startsWith('.') || !n.startsWith('.'))).sort();
    return hits.length ? hits.map(h => dir + h) : [pattern];
  }
  function parse(line, sh, tab) {
    const toks = tokenize(line, sh, tab);
    const lists = []; let pipeline = []; let cmd = { argv: [], redirs: [] };
    const endCmd = () => { if (cmd.argv.length || cmd.redirs.length) pipeline.push(cmd); cmd = { argv: [], redirs: [] }; };
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === 'w') {
        let v = t.v;
        if (t.tilde) v = v.replace(/^~([a-z_][a-z0-9_-]*)?/, (m, u) => { const x = u ? S.users[u] : S.users[sh.user]; return x ? x.home : m; });
        if (t.glob && !t.q) cmd.argv.push(...globExpand(v, sh)); else cmd.argv.push(v);
      } else if (t.t === 'r') {
        if (t.v === '2>&1') { cmd.redirs.push({ op: '2>&1' }); continue; }
        const nx = toks[k + 1];
        if (!nx || nx.t !== 'w') return { error: "bash: syntax error near unexpected token `newline'" };
        let v = nx.v; if (nx.tilde) v = v.replace(/^~/, sh.home());
        cmd.redirs.push({ op: t.v, target: v }); k++;
      } else if (t.t === 'op') {
        if (t.v === '|') { if (!cmd.argv.length) return { error: "bash: syntax error near unexpected token `|'" }; endCmd(); }
        else { endCmd(); if (pipeline.length) lists.push({ pipeline, op: t.v }); pipeline = []; }
      }
    }
    endCmd(); if (pipeline.length) lists.push({ pipeline, op: ';' });
    return { lists };
  }

  /* ---------------- 명령 레지스트리 & 실행 ---------------- */
  const CMDS = {}; const META = {};
  const ALIASES = { ls: 'ls --color=auto', grep: 'grep --color=auto', ll: 'ls -alF', la: 'ls -A', l: 'ls -CF' };
  LAB.aliases = ALIASES;
  LAB.cmd = (name, fn, meta) => { CMDS[name] = fn; META[name] = meta || {}; };
  LAB.commands = CMDS; LAB.meta = META;
  const BUILTINS = ['cd', 'pwd', 'echo', 'exit', 'logout', 'history', 'type', 'alias', 'kill', 'help', 'true', 'false', 'umask', 'unalias', 'export'];
  LAB.builtins = BUILTINS;

  async function runLine(tab, line, interactive) {
    const sh = shOf(tab);
    let src = line;
    if (/!!/.test(src)) {
      const prev = tab.history[tab.history.length - 1];
      if (!prev) { printTo(tab, 'bash: !!: event not found\n', 'err'); renderInput(); return; }
      src = src.replace(/!!/g, prev); printTo(tab, src + '\n');
    }
    if (src.trim() && interactive) { if (tab.history[tab.history.length - 1] !== src) tab.history.push(src); saveHist(tab.history); tab.hidx = -1; }
    if (!src.trim()) { renderInput(); return; }
    const parsed = parse(src, sh, tab);
    if (parsed.error) { printTo(tab, parsed.error + '\n', 'err'); tab.lastExit = 2; renderInput(); return; }
    tab.busy = true; tab.abort = false; renderInput();
    let outAll = '', errAll = ''; let exit = 0; let firstArgv = null; const cmdsAll = []; let usedSudo = false;
    try {
      let prevOp = null;
      for (const item of parsed.lists) {
        if ((prevOp === '&&' && exit !== 0) || (prevOp === '||' && exit === 0)) { prevOp = item.op; continue; }
        prevOp = item.op;
        const r = await runPipeline(tab, item.pipeline);
        exit = r.exit; outAll += r.out; errAll += r.err; if (!firstArgv) firstArgv = item.pipeline[0].argv; cmdsAll.push(...item.pipeline.map(c => c.argv)); usedSudo = usedSudo || r.sudo;
        tab.lastExit = exit;
        if (tab.closed) break;
      }
    } catch (e) { console.error(e); printTo(tab, 'bash: internal error: ' + (e && e.message || e) + '\n', 'err'); exit = 1; }
    tab.busy = false; tab.abort = false; tab.euser = null;
    if (!tab.closed) {
      const last = tab.out.lastElementChild; if (last && last.dataset.open === '1') { /* 줄바꿈 없는 출력 뒤 프롬프트 */ last.dataset.open = '0'; }
    }
    renderTitle(); renderTabs(); renderInput(); save();
    LAB.emit('command', { line: src, argv: firstArgv || [], cmds: cmdsAll, exit, out: outAll, err: errAll, cwd: sh.cwd, user: sh.user, sudo: usedSudo, time: Date.now(), tty: tab.tty });
  }
  LAB.run = line => runLine(active, line, true);

  async function runPipeline(tab, pipeline) {
    const sh = shOf(tab);
    let stdin = null; let exit = 0; let outCollected = ''; let errCollected = ''; let sudoUsed = false;
    for (let idx = 0; idx < pipeline.length; idx++) {
      const c = pipeline[idx]; const lastStage = idx === pipeline.length - 1;
      let argv = c.argv.slice();
      if (!argv.length) continue;
      // alias 확장
      if (ALIASES[argv[0]]) { const ex = ALIASES[argv[0]].split(' '); argv = (ALIASES[ex[0]] && ex[0] !== argv[0] ? ALIASES[ex[0]].split(' ').concat(ex.slice(1)) : ex).concat(argv.slice(1)); }
      // 리다이렉션 준비
      let outFile = null, outAppend = false, errFile = null, errAppend = false, errToOut = false, inFile = null;
      for (const r of c.redirs) {
        if (r.op === '>' || r.op === '>>') { outFile = r.target; outAppend = r.op === '>>'; }
        else if (r.op === '2>' || r.op === '2>>') { errFile = r.target; errAppend = r.op === '2>>'; }
        else if (r.op === '2>&1') errToOut = true;
        else if (r.op === '<') inFile = r.target;
      }
      if (inFile) {
        try { stdin = FS.read(inFile, sh); } catch (e) { const m = `bash: ${inFile}: ${errMsg(e.code)}\n`; printTo(tab, m, 'err'); errCollected += m; exit = 1; stdin = ''; continue; }
      }
      // > 파일은 명령 실행 전에 비움(bash와 동일)
      if (outFile && !outAppend) {
        const rr = FS.resolve(outFile, {}, sh);
        if (rr.node && rr.node.type === 'd') { const m = `bash: ${outFile}: Is a directory\n`; printTo(tab, m, 'err'); errCollected += m; exit = 1; continue; }
        if (!(rr.node && rr.node.type === 'p')) {
          try { if (outFile !== '/dev/null') FS.write(outFile, '', {}, sh); } catch (e) { const m = `bash: ${outFile}: ${errMsg(e.code)}\n`; printTo(tab, m, 'err'); errCollected += m; exit = 1; continue; }
        }
      }
      const toTerm = lastStage && !outFile;
      let buf = '';
      const io = {
        sh, tab,
        out: s => { s = String(s); if (toTerm) { printTo(tab, s); outCollected += s; } else buf += s; },
        outHTML: (html, plain) => { if (toTerm) { printTo(tab, html, 'html'); outCollected += plain; } else buf += plain; },
        err: s => { s = String(s); if (errToOut) { io.out(s); return; } errCollected += s; if (errFile) { if (errFile !== '/dev/null') { try { FS.write(errFile, s, { append: true }, sh); } catch (e) { } } } else printTo(tab, s, 'err'); },
        stdin, tty: toTerm, toTerm, piped: stdin !== null, redir: { outFile, outAppend },
        get aborted() { return tab.abort; },
        sudo: false,
        readLine: o => readLineOn(tab, o || {}),
      };
      exit = await execArgv(argv, io);
      if (io.sudo) sudoUsed = true;
      if (outFile) {
        if (outFile !== '/dev/null') {
          try { const w = FS.write(outFile, buf, { append: outAppend }, sh); if (w && w.then) { tab.onAbort = () => { const rr = FS.resolve(outFile, {}, sh); if (rr.node) LAB.fifoCancel(rr.node); }; await w; tab.onAbort = null; } }
          catch (e) { const m = `bash: ${outFile}: ${errMsg(e.code)}\n`; printTo(tab, m, 'err'); errCollected += m; exit = 1; }
        }
        outCollected += buf; stdin = null;
      } else stdin = lastStage ? null : buf;
      if (tab.closed) break;
    }
    return { exit, out: outCollected, err: errCollected, sudo: sudoUsed };
  }

  async function execArgv(argv, io) {
    const name = argv[0];
    const tab = io.tab;
    const asg = name.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (asg) { if (argv.length === 1) { tab.vars = tab.vars || {}; tab.vars[asg[1]] = asg[2]; return 0; } argv = argv.slice(1); return execArgv(argv, io); }
    // ./script 실행
    if (name.includes('/')) return runScript(name, argv, io);
    const fn = CMDS[name];
    if (!fn) {
      const sug = SUGGEST[name];
      if (sug) io.err(`Command '${name}' not found, but can be installed with:\nsudo apt install ${sug}\n`);
      else io.err(`${name}: command not found\n`);
      return 127;
    }
    try { const r = await fn(argv, io); return r == null ? 0 : r; }
    catch (e) { console.error(e); io.err(`${name}: ${e && e.message || e}\n`); return 1; }
  }
  LAB.exec = execArgv;
  const SUGGEST = { tree: 'tree', ifconfig: 'net-tools', curl: 'curl', python: 'python3', gcc: 'gcc', nano: 'nano', htop: 'htop', neofetch: 'neofetch', sl: 'sl', cowsay: 'cowsay', git: 'git' };
  LAB.suggest = SUGGEST;

  async function runScript(path, argv, io) {
    const sh = io.sh; const r = FS.resolve(path, {}, sh);
    if (!r.node) { io.err(`bash: ${path}: No such file or directory\n`); return 127; }
    if (r.node.type === 'd') { io.err(`bash: ${path}: Is a directory\n`); return 126; }
    if (!canU(r.node, 'x', sh.euser) || !canU(r.node, 'r', sh.euser)) { io.err(`bash: ${path}: Permission denied\n`); return 126; }
    const text = FS.content(r.node);
    let code = 0;
    for (const raw of text.split('\n')) {
      const line = raw.trim(); if (!line || line.startsWith('#')) continue;
      const parsed = parse(line, sh, io.tab); if (parsed.error) { io.err(parsed.error + '\n'); continue; }
      for (const item of parsed.lists) for (const c of item.pipeline) {
        if (c.argv[0] === 'exit') { return parseInt(c.argv[1] || '0', 10) || 0; }
        code = await execArgv(c.argv, Object.assign({}, io, { stdin: null }));
      }
    }
    return code;
  }

  function errMsg(code) {
    return { ENOENT: 'No such file or directory', EACCES: 'Permission denied', EISDIR: 'Is a directory', ENOTDIR: 'Not a directory', EEXIST: 'File exists', ENOTEMPTY: 'Directory not empty', EPERM: 'Operation not permitted' }[code] || code;
  }
  LAB.errMsg = errMsg;

  /* ---------------- sudo / su 지원 ---------------- */
  LAB.sudoAuth = async function (io) {
    const sh = io.sh; const tab = io.tab; const user = sh.user;
    if (S.users[user].uid === 0) return true;
    if (!U.groupsOf(user).includes('sudo')) {
      const pw = await readLineOn(tab, { prompt: `[sudo] password for ${user}: `, hidden: true });
      if (pw === null) return false;
      io.err(`${user} is not in the sudoers file.\n`); return false;
    }
    tab.sudoUntil = tab.sudoUntil || {};
    if (tab.sudoUntil[user] && tab.sudoUntil[user] > Date.now()) return true;
    for (let i = 0; i < 3; i++) {
      const pw = await readLineOn(tab, { prompt: `[sudo] password for ${user}: `, hidden: true });
      if (pw === null) return false;
      if (pw && pw !== '\u0004') { tab.sudoUntil[user] = Date.now() + 15 * 60 * 1000; return true; }
      if (i < 2) io.err('Sorry, try again.\n');
    }
    io.err('sudo: 3 incorrect password attempts\n'); return false;
  };
  LAB.withEuser = async function (tab, euser, fn) { const prev = tab.euser; tab.euser = euser; try { return await fn(); } finally { tab.euser = prev; } };
  LAB.pushShell = function (tab, user, login, suCmd, exe) {
    const parent = shOf(tab).proc;
    const su = { pid: ++S.pid, ppid: parent.pid, user: 'root', cmd: 'su', exe: exe || 'su', args: suCmd, tty: tab.tty, start: Date.now() };
    const bash = { pid: ++S.pid, ppid: su.pid, user, cmd: 'bash', tty: tab.tty, start: Date.now(), cwd: login ? (S.users[user].home) : parent.cwd, login, oldpwd: null };
    if (login && !lookupAbs(S.users[user].home)) bash.cwd = '/';
    tab.procs.push(su, bash);
    renderTitle(); renderTabs();
    return bash;
  };
  LAB.popShell = function (tab) {
    const ps = tab.procs; let i = ps.length - 1;
    while (i >= 0 && ps[i].cmd !== 'bash') i--;
    ps.splice(i);
    while (ps.length && ps[ps.length - 1].cmd !== 'bash') ps.pop();
    if (!ps.length) closeTab(tab);
  };
  LAB.killProc = function (tab0, pid) {
    // 해당 pid와 그 자식들을 모두 제거. 현재 탭이면 셸이 바뀜
    for (const tab of tabs) {
      const i = tab.procs.findIndex(p => p.pid === pid);
      if (i < 0) continue;
      tab.procs.splice(i);
      while (tab.procs.length && tab.procs[tab.procs.length - 1].cmd !== 'bash') tab.procs.pop();
      if (!tab.procs.length) closeTab(tab);
      return tab;
    }
    return null;
  };

  /* ---------------- 탭 열기/닫기, 재부팅 ---------------- */
  function openTab() {
    if (tabs.length >= 4) { flash('탭은 4개까지 열 수 있어요.'); return; }
    const t = makeTab(); switchTab(t);
  }
  function closeTab(tab) {
    tab.closed = true;
    if (tabs.length > 1) {
      const i = tabs.indexOf(tab); tabs.splice(i, 1);
      if (tab === active) switchTab(tabs[Math.max(0, i - 1)]); else renderTabs();
    } else {
      if (tab === active) { els.closed.hidden = false; els.inputLine.hidden = true; }
    }
  }
  LAB.closeTab = closeTab; LAB.openTab = openTab;
  function reopen() {
    const t = active; t.closed = false; newShell(t); t.out.innerHTML = ''; els.closed.hidden = true; banner(t); renderTitle(); renderTabs(); renderInput(); LAB.term.focus();
  }
  LAB.reboot = async function () {
    els.boot.hidden = false; els.boot.querySelector('.boot-msg').textContent = '다시 시작하는 중…';
    await LAB.sleep(1400);
    S.hostname = readHostnameFile() || 'ubuntu'; S.hostnameStatic = S.hostname;
    tabs.splice(0); nextPts = 0; const t = makeTab(); active = null; switchTab(t); banner(t);
    els.boot.hidden = true; save(); LAB.emit('reboot', {});
  };
  LAB.resetAll = function () {
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem('linuxlab.hist.v1'); localStorage.removeItem('linuxlab.progress.v1'); } catch (e) { }
    freshState(); tabs.splice(0); nextPts = 0; const t = makeTab(); t.history = []; active = null; switchTab(t); banner(t); save(); LAB.emit('reset', {});
  };
  function flash(msg) { els.toast.textContent = msg; els.toast.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { els.toast.hidden = true; }, 2200); }
  LAB.flash = flash;

  function banner(tab) {
    printTo(tab, 'Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64) — 실습용 가상 터미널\n', 'dim');
    printTo(tab, "도움말: help  ·  새 탭: Ctrl+Shift+T  ·  자동 완성: Tab  ·  이전 명령: ↑  ·  중단: Ctrl+C\n\n", 'dim');
  }

  /* ---------------- 날짜 포맷 ---------------- */
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const p2 = n => String(n).padStart(2, '0');
  function tzName(d) { const off = -d.getTimezoneOffset(); if (off === 540) return 'KST'; if (off === 0) return 'UTC'; const h = Math.trunc(off / 60); return (h >= 0 ? '+' : '-') + p2(Math.abs(h)); }
  function tzOff(d) { const off = -d.getTimezoneOffset(); return (off >= 0 ? '+' : '-') + p2(Math.floor(Math.abs(off) / 60)) + p2(Math.abs(off) % 60); }
  function fmtDate(d, fmt) {
    if (!fmt) return `${DAYS[d.getDay()].slice(0, 3)} ${MONS[d.getMonth()].slice(0, 3)} ${String(d.getDate()).padStart(2, ' ')} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${tzName(d)} ${d.getFullYear()}`;
    const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
    return fmt.replace(/%([a-zA-Z%])/g, (m, c) => ({
      Y: d.getFullYear(), y: p2(d.getFullYear() % 100), m: p2(d.getMonth() + 1), d: p2(d.getDate()), e: String(d.getDate()).padStart(2, ' '),
      H: p2(d.getHours()), I: p2(d.getHours() % 12 || 12), M: p2(d.getMinutes()), S: p2(d.getSeconds()), p: d.getHours() < 12 ? 'AM' : 'PM',
      A: DAYS[d.getDay()], a: DAYS[d.getDay()].slice(0, 3), B: MONS[d.getMonth()], b: MONS[d.getMonth()].slice(0, 3), h: MONS[d.getMonth()].slice(0, 3),
      j: String(doy).padStart(3, '0'), T: `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`, D: `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${p2(d.getFullYear() % 100)}`,
      F: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, s: Math.floor(d / 1000), Z: tzName(d), z: tzOff(d), u: d.getDay() || 7, w: d.getDay(), n: '\n', t: '\t', '%': '%',
    }[c] ?? m));
  }
  LAB.fmtDate = fmtDate; LAB.tzOff = tzOff;

  /* ---------------- 페이저 (more/less/man) ---------------- */
  LAB.pager = function (io, text, opts) {
    opts = opts || {};
    const tab = io.tab;
    const lines = text.replace(/\n$/, '').split('\n');
    return new Promise(res => {
      let top = 0; let msg = ''; let search = null; let searching = null;
      const h = {
        render(el) {
          const { rows } = LAB.term.size(); const n = rows - 1;
          const view = lines.slice(top, top + n);
          let html = view.map(l => `<div class="ln">${hl(l)}</div>`).join('');
          for (let i = view.length; i < n; i++) html += `<div class="ln">${opts.more ? '' : '<span class="dim">~</span>'}</div>`;
          const end = top + n >= lines.length;
          let status;
          if (searching !== null) status = '/' + esc(searching);
          else if (opts.more) status = `<span class="rev">--More--(${Math.min(100, Math.round((top + n) / lines.length * 100))}%)</span>`;
          else status = msg ? `<span class="rev">${esc(msg)}</span>` : (end ? '<span class="rev">(END)</span>' : (top === 0 && opts.title ? `<span class="rev">${esc(opts.title)}</span>` : ':'));
          el.innerHTML = `<div class="pager">${html}<div class="ln">${status}</div></div>`;
        },
        key(e) {
          const { rows } = LAB.term.size(); const n = rows - 1; const max = Math.max(0, lines.length - n);
          if (searching !== null) {
            if (e.key === 'Enter') { search = searching; searching = null; find(1, true); }
            else if (e.key === 'Escape') searching = null;
            else if (e.key === 'Backspace') searching = searching.slice(0, -1);
            else if (e.key.length === 1) searching += e.key;
            h.render(LAB.fsLayer()); return true;
          }
          msg = '';
          const k = e.key;
          if (k === 'q' || k === 'Q' || (e.ctrlKey && (k === 'c' || k === 'C'))) { done(); return true; }
          if (k === ' ' || k === 'f' || k === 'PageDown') { if (opts.more && top >= max) { done(); return true; } top = Math.min(max, top + n); }
          else if (k === 'b' || k === 'PageUp') top = Math.max(0, top - n);
          else if (k === 'Enter' || k === 'j' || k === 'ArrowDown' || k === 'e') { if (opts.more && top >= max) { done(); return true; } top = Math.min(max, top + 1); }
          else if (k === 'k' || k === 'ArrowUp' || k === 'y') top = Math.max(0, top - 1);
          else if (k === 'g' || k === 'Home') top = 0; else if (k === 'G' || k === 'End') top = max;
          else if (k === '/') searching = '';
          else if (k === 'n') find(1); else if (k === 'N') find(-1);
          else if (k === 'h') msg = 'q:종료  Space:다음 쪽  b:이전 쪽  /단어:검색  n:다음 결과';
          h.render(LAB.fsLayer()); return true;
          function find(dir, fromTop) {
            if (!search) return;
            for (let i = (fromTop ? top : top + dir); i >= 0 && i < lines.length; i += dir) if (lines[i].includes(search)) { top = Math.min(i, max); return; }
            msg = 'Pattern not found';
          }
        },
      };
      function hl(l) { let s = esc(l); if (search) s = s.split(esc(search)).join(`<span class="rev">${esc(search)}</span>`); if (opts.man) s = s.replace(/^([A-Z][A-Z ]+)$/, '<b>$1</b>'); return s; }
      function done() { setFullscreen(tab, null); if (opts.more) { printTo(tab, lines.slice(0, Math.min(lines.length, top + LAB.term.size().rows - 1)).join('\n') + '\n'); } res(0); }
      setFullscreen(tab, h);
    });
  };
  LAB.fsLayer = () => els.fsLayer;

  /* ---------------- 시작 ---------------- */
  LAB.boot = function () {
    els = {
      win: $('#termwin'), body: $('#term-body'), screen: $('#term-screen'), inputLine: $('#term-input'), kbd: $('#term-kbd'), title: $('#term-title'),
      tabs: $('#term-tabs'), fsLayer: $('#term-fs'), closed: $('#term-closed'), boot: $('#term-boot'), toast: $('#term-toast'), focused: false,
    };
    if (!load()) { freshState(); save(); }
    const t = makeTab(); switchTab(t); banner(t);
    els.kbd.addEventListener('keydown', onKeyDown);
    els.kbd.addEventListener('input', onInput);
    els.kbd.addEventListener('compositionend', () => { if (active.fs) onInput({ isComposing: false }); else renderInput(); });
    els.kbd.addEventListener('focus', () => { els.focused = true; renderInput(); els.win.classList.add('focus'); });
    els.kbd.addEventListener('blur', () => { els.focused = false; renderInput(); els.win.classList.remove('focus'); });
    document.addEventListener('selectionchange', () => { if (document.activeElement === els.kbd) renderInput(); });
    els.body.addEventListener('mouseup', () => { const s = String(window.getSelection() || ''); if (!s) LAB.term.focus(); });
    els.tabs.addEventListener('click', e => {
      const c = e.target.closest('[data-close]'); if (c) { e.stopPropagation(); const tb = tabs.find(x => x.id === c.dataset.close); if (tb) { tb.procs.splice(0); closeTab(tb); } return; }
      const b = e.target.closest('.tt'); if (b) switchTab(tabs.find(x => x.id === b.dataset.id));
    });
    $('#btn-newtab').addEventListener('click', openTab);
    $('#btn-reopen').addEventListener('click', reopen);
    $('#btn-clear').addEventListener('click', () => { if (!active.busy) { LAB.term.clear(); renderInput(); } LAB.term.focus(); });
    LAB.term.focus();
    LAB.emit('ready', {});
  };
})();
