/* missions.js — 오른쪽 실습 과제 패널 (LAB API만 사용) */
(function (LAB) {
  'use strict';
  if (!LAB) { console.warn('missions.js: LAB 없음'); return; }

  var KEY = 'linuxlab.progress.v1';
  var H = '/home/user1';

  /* ---------- 작은 도우미 ---------- */
  function A(e) {                      // sudo 와 sudo 옵션을 떼어 낸 실제 명령 argv
    var a = (e && e.argv ? e.argv : []).slice();
    while (a[0] === 'sudo') { a.shift(); while (a[0] && a[0].charAt(0) === '-') a.shift(); }
    return a;
  }
  function isSudo(e) { return !!(e && (e.sudo || (e.argv || [])[0] === 'sudo')); }
  function cmd(e) { return A(e)[0] || ''; }
  function is(e, name) { var c = cmd(e); return Array.isArray(name) ? name.indexOf(c) >= 0 : c === name; }
  function opts(e) {                   // 짧은 옵션 글자 모음 (-al == -la == -a -l)
    var s = '', a = A(e);
    for (var i = 1; i < a.length; i++) {
      var x = a[i];
      if (x && x.charAt(0) === '-' && x.charAt(1) !== '-' && x.length > 1 && !/^-\d/.test(x)) s += x.slice(1);
    }
    return s;
  }
  function has(e, letters) { var o = opts(e); return letters.split('').every(function (c) { return o.indexOf(c) >= 0; }); }
  function args(e) {                   // 옵션이 아닌 인자들
    var a = A(e), r = [];
    for (var i = 1; i < a.length; i++) if (!(a[i].charAt(0) === '-' && a[i].length > 1)) r.push(a[i]);
    return r;
  }
  function ok(e) { return e && e.exit === 0; }
  function out(e) { return (e && e.out) || ''; }
  function err(e) { return (e && e.err) || ''; }
  function line(e) { return (e && e.line) || ''; }
  function st() { try { return LAB.state() || {}; } catch (x) { return {}; } }
  function home() { try { return (LAB.sh && LAB.sh.home && LAB.sh.home()) || H; } catch (x) { return H; } }
  function node(p) { try { var r = LAB.fs.resolve(p); return r && r.node; } catch (x) { return null; } }
  function exists(p) { return !!node(p); }
  function content(p) { var n = node(p); return n && n.type === 'f' ? (n.content || '') : ''; }
  function cwdIs(p) { return st().cwd === p; }
  function endsWithPath(path, tail) { return path === tail || (path && path.slice(-tail.length - 1) === '/' + tail); }
  function users() { return st().users || {}; }
  function bashCount() { return (st().procs || []).filter(function (p) { return p.cmd === 'bash'; }).length; }
  function lines(s) { return s.replace(/\n+$/, '').split('\n').filter(function (l) { return l !== ''; }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* 진행 데이터 */
  var P = { done: {}, active: 'm1', data: {} };
  function load() { try { var s = localStorage.getItem(KEY); if (s) { var o = JSON.parse(s); if (o && o.done) P = o; P.data = P.data || {}; } } catch (x) { } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (x) { } }

  var prevCwd = null;                 // 직전 명령 실행 전의 cwd (경로 이동 과제용)

  /* ---------- 과제 정의 ---------- */
  // step: {t:지시문, hint:'명령'|fn, ex:해설, chk(e)|on:'vim', opt:true(선택)}
  var M = [
    {
      id: 'm1', ch: '1장', title: '터미널과 친해지기',
      intro: '프롬프트 [user1@localhost ~]$ 는 "[사용자@호스트 현재디렉토리]$" 예요. ~ 는 홈, 끝이 $ 면 일반 사용자, # 이면 root. 아래 명령을 하나씩 쳐 보세요.',
      steps: [
        { t: '지금 로그인한 사용자 이름을 확인하세요.', hint: 'whoami', chk: function (e) { return is(e, 'whoami') && ok(e); },
          ex: 'whoami = "who am i?". 관리자(root)인지 일반 사용자인지 확인할 때 써요.' },
        { t: '이 컴퓨터의 호스트 이름을 확인하세요.', hint: 'hostname', chk: function (e) { return is(e, 'hostname') && args(e).length === 0 && ok(e); },
          ex: '호스트 이름 = 네트워크에서 컴퓨터를 구분하는 이름 (윈도우의 "내 컴퓨터 이름"). CentOS 설치 직후에는 localhost 예요.' },
        { t: '운영체제와 커널 정보를 모두 출력하세요.', hint: 'uname -a', chk: function (e) { return is(e, 'uname') && has(e, 'a'); },
          ex: 'uname = UNIX name. -s 커널 이름, -r 커널 버전, -m 하드웨어(x86_64), -o 운영체제 이름. -a는 전부.' },
        { t: '커널 이름만(-s), 운영체제 이름만(-o) 따로 출력해 보세요.', hint: 'uname -o', chk: function (e) { return is(e, 'uname') && (has(e, 'o') || has(e, 's') || has(e, 'r')) && !has(e, 'a'); },
          ex: '옵션은 "-" 뒤에 글자를 붙여 명령의 세부 기능을 고르는 거예요.' },
        { t: '현재 날짜와 시간을 확인하세요.', hint: 'date', chk: function (e) { return is(e, 'date') && ok(e); },
          ex: 'date는 시스템 시계를 보여 줘요.' },
        { t: '로그인한 사용자 목록을 보세요. (who -a 도 해 보기)', hint: 'who', chk: function (e) { return is(e, 'who') && ok(e); },
          ex: '사용자이름 · 터미널(tty/pts) · 로그인 시간 · 원격 주소 순서예요. who -a는 부팅 시간까지 함께 보여 줘요.' },
        { t: '지금 쓰는 터미널 장치 이름을 확인하세요.', hint: 'tty', chk: function (e) { return is(e, 'tty') && /pts|tty/.test(out(e)); },
          ex: '/dev/pts/0 = 가상(의사) 터미널. GUI 터미널·SSH는 pts, Ctrl+Alt+F3 같은 콘솔은 tty예요.' },
        { t: '화면을 깨끗이 지우세요. (Ctrl+L 도 같은 동작)', hint: 'clear', chk: function (e) { return is(e, 'clear'); },
          ex: '화면만 지워지고 기록(history)은 남아요.' },
        { t: 'ls 명령의 매뉴얼을 열고, q 를 눌러 나오세요.', hint: 'man ls', chk: function (e) { return is(e, 'man') && args(e)[0] === 'ls'; },
          ex: 'man = manual. 명령의 사용법·옵션을 볼 수 있어요. 스페이스로 넘기고 q로 나가요.' }
      ]
    },
    {
      id: 'm2', ch: '3장', title: '명령어 구조: 명령 [옵션] [인자]',
      intro: '명령 = 무엇을 할지, 옵션 = 세부 기능(-로 시작), 인자 = 대상(파일·디렉토리 이름).',
      steps: [
        { t: '현재 디렉토리의 파일 목록을 보세요.', hint: 'ls', chk: function (e) { return is(e, 'ls') && opts(e) === '' && args(e).length === 0; },
          ex: '명령만 쓴 형태. 대상이 없으면 현재 디렉토리를 보여 줘요.' },
        { t: '자세히(long) 보세요.', hint: 'ls -l', chk: function (e) { return is(e, 'ls') && has(e, 'l') && args(e).length === 0; },
          ex: '권한 · 링크 수 · 소유자 · 그룹 · 크기 · 수정 시간 · 이름 순서예요.' },
        { t: '숨김 파일까지 모두(all) 보세요.', hint: 'ls -a', chk: function (e) { return is(e, 'ls') && has(e, 'a') && !has(e, 'l'); },
          ex: '이름이 .으로 시작하면 숨김 파일이에요 (.bashrc 등). . 은 현재, .. 은 상위 디렉토리.' },
        { t: '두 옵션을 합쳐 쓰세요. (-al 과 -la 는 같아요)', hint: 'ls -al', chk: function (e) { return is(e, 'ls') && has(e, 'al'); },
          ex: '짧은 옵션은 순서 상관없이 붙여 쓸 수 있어요.' },
        { t: '옵션과 인자를 함께: /etc 디렉토리를 자세히 보세요.', hint: 'ls -l /etc', chk: function (e) { return is(e, 'ls') && has(e, 'l') && args(e).some(function (a) { return a === '/etc' || a === '/etc/'; }); },
          ex: '/etc = 루트(/) 아래 etc. 시스템 설정 파일이 모여 있어요.' },
        { t: '파일 종류 표시(-F)를 붙여 보세요.', hint: 'ls -F', chk: function (e) { return is(e, 'ls') && has(e, 'F'); },
          ex: '디렉토리 /, 실행 파일 *, 심볼릭 링크 @, 파이프 | 가 붙어요.' },
        { t: 'cd 가 어떤 명령인지 확인하세요.', hint: 'type cd', chk: function (e) { return is(e, 'type') && args(e).indexOf('cd') >= 0; },
          ex: 'cd는 셸 안에 들어 있는 "셸 내장 명령"이에요.' },
        { t: 'ls 는 어디 있는 프로그램인지 확인하세요.', hint: 'which ls', chk: function (e) { return (is(e, 'which') || is(e, 'type')) && args(e).indexOf('ls') >= 0; },
          ex: 'ls는 /usr/bin/ls 에 있는 별도 프로그램(유틸리티)이에요. 명령은 셸 내장 + 유틸리티로 나뉘어요.' }
      ]
    },
    {
      id: 'm3', ch: '3장', title: '호스트 이름 바꾸기', star: true,
      intro: '공개 예상문제 ⑤ "sudo hostname test-server" 를 직접 해 봐요.',
      steps: [
        { t: '호스트 이름을 test-server 로 바꾸세요. (관리자 권한 필요)', hint: 'sudo hostname test-server', chk: function (e) { return is(e, 'hostname') && args(e).indexOf('test-server') >= 0 && isSudo(e) && ok(e); },
          ex: 'sudo = 관리자(root) 권한으로 실행. hostname 이름 → 이름을 바꾸지만 재부팅하면 원래대로(일시적).' },
        { t: '바뀐 이름을 확인하세요.', hint: 'hostname', chk: function (e) { return is(e, 'hostname') && args(e).length === 0 && /test-server/.test(out(e)); },
          ex: '프롬프트의 @ 뒤 이름은 새 셸을 열어야 바뀌어요. 실제 이름은 이미 바뀌었어요.' },
        { t: '이번엔 영구적으로 lab-server 로 바꾸세요.', hint: 'sudo hostnamectl set-hostname lab-server', chk: function () { return st().hostname === 'lab-server'; },
          ex: 'hostnamectl = hostname + ctl(control). set-hostname 은 /etc/hostname 파일까지 고쳐서 재부팅 후에도 유지돼요.' },
        { t: '설정 파일에 기록됐는지 확인하세요.', hint: 'cat /etc/hostname', chk: function (e) { return is(e, 'cat') && args(e).indexOf('/etc/hostname') >= 0 && /lab-server/.test(out(e)); },
          ex: '/etc/hostname 에 방금 정한 이름이 들어 있어요.' },
        { t: 'IP ↔ 이름 변환표를 보세요.', hint: 'cat /etc/hosts', chk: function (e) { return is(e, 'cat') && args(e).indexOf('/etc/hosts') >= 0 && /127\.0\.0\.1/.test(out(e)); },
          ex: '/etc/hosts 는 DNS보다 먼저 참조하는 로컬 이름표예요. "127.0.0.1 localhost" = 자기 자신.' },
        { t: '자기 자신에게 ping 을 보내고, Ctrl+C 로 멈추세요.', hint: 'ping localhost', chk: function (e) { return is(e, 'ping') && args(e).some(function (a) { return a === 'localhost' || a === '127.0.0.1'; }); },
          ex: 'localhost = 루프백(자기 자신) 주소. IPv4 는 127.0.0.1, IPv6 는 ::1 — CentOS 는 ::1 로 응답해요. 랜카드·케이블 없이도 항상 자기 자신이라 테스트용으로 써요.' }
      ]
    },
    {
      id: 'm4', ch: '3장', title: '루트·홈 디렉토리와 경로 이동', star: true,
      intro: '루트(/) = 파일 시스템의 맨 꼭대기. 홈(~) = 사용자 개인 디렉토리(/home/user1).',
      steps: [
        { t: '지금 위치를 확인하세요.', hint: 'pwd', chk: function (e) { return is(e, 'pwd') && ok(e); },
          ex: 'pwd = print working directory. 처음 위치는 홈(/home/user1)이에요.' },
        { t: '루트 디렉토리로 이동하세요.', hint: 'cd /', chk: function (e) { return is(e, 'cd') && cwdIs('/'); },
          ex: '/ 로 시작하면 루트부터 찾아가는 절대경로예요.' },
        { t: '루트 아래에 무엇이 있는지 보세요.', hint: 'ls', chk: function (e) { return is(e, 'ls') && e.cwd === '/' && /home/.test(out(e)); },
          ex: 'bin · etc · home · root · tmp · usr · var … 주요 디렉토리예요. home 아래에 사용자 홈들이 있어요.' },
        { t: '홈 디렉토리로 돌아가세요.', hint: 'cd ~', chk: function (e) { return is(e, 'cd') && cwdIs(home()); },
          ex: 'cd ~ 또는 그냥 cd 만 쳐도 홈으로 가요.' },
        { t: 'choi 아래에 temp 와 temp2 를 한 번에 만드세요.', hint: 'mkdir -p choi/temp choi/temp2', chk: function () { return exists(home() + '/choi/temp') && exists(home() + '/choi/temp2'); },
          ex: '-p 는 중간 디렉토리(choi)가 없으면 같이 만들어 줘요.' },
        { t: 'temp2 로 들어가세요.', hint: 'cd choi/temp2', chk: function (e) { return is(e, 'cd') && cwdIs(home() + '/choi/temp2'); },
          ex: '이제 현재 디렉토리가 temp2 예요. 여기서 형제 디렉토리 temp 로 "한 번에" 가 봐요.' },
        { t: '① 상대경로로 한 번에 temp 로 이동하세요.', hint: 'cd ../temp', chk: function (e) {
            var a = args(e)[0] || ''; return is(e, 'cd') && cwdIs(home() + '/choi/temp') && endsWithPath(prevCwd || '', 'choi/temp2') && a.charAt(0) !== '/' && a.charAt(0) !== '~'; },
          ex: '.. = 상위(choi). 현재 위치를 기준으로 가니까 상대경로예요.' },
        { t: '② cd ../temp2 로 돌아간 뒤, 절대경로로 한 번에 temp 로 이동하세요.', hint: 'cd /home/user1/choi/temp', chk: function (e) {
            var a = args(e)[0] || ''; return is(e, 'cd') && cwdIs(home() + '/choi/temp') && endsWithPath(prevCwd || '', 'choi/temp2') && a.charAt(0) === '/' && line(e).indexOf('~') < 0; },
          ex: '/ 부터 모든 디렉토리 이름을 적어서 어디서 쳐도 같은 곳으로 가요.' },
        { t: '③ 다시 temp2 로 돌아간 뒤, ~ 를 써서 한 번에 이동하세요.', hint: 'cd ~/choi/temp', chk: function (e) {
            return is(e, 'cd') && cwdIs(home() + '/choi/temp') && endsWithPath(prevCwd || '', 'choi/temp2') && /(^|\s|;)cd\s+~/.test(line(e)); },
          ex: '~ = 홈. ~/choi/temp = /home/user1/choi/temp. 시험에선 절대경로·상대경로 두 가지 이상을 쓰면 돼요.' }
      ]
    },
    {
      id: 'm5', ch: '3장', title: '디렉토리 만들기·지우기',
      intro: '홈(~)에서 시작하세요. 에러 메시지도 실습의 일부예요.',
      steps: [
        { t: '홈으로 가서 tmp 디렉토리를 만드세요.', hint: 'mkdir tmp', chk: function (e) { return is(e, 'mkdir') && exists(home() + '/tmp'); },
          ex: 'mkdir = make directory.' },
        { t: 'aaa bbb ccc 세 개를 한 번에 만드세요.', hint: 'mkdir aaa bbb ccc', chk: function () { return ['aaa', 'bbb', 'ccc'].every(function (n) { return exists(home() + '/' + n); }); },
          ex: '인자를 여러 개 주면 하나씩 다 만들어요.' },
        { t: '-p 없이 temp1/temp2 를 만들어 에러를 확인하세요.', hint: 'mkdir temp1/temp2', chk: function (e) { return is(e, 'mkdir') && !has(e, 'p') && !ok(e) && /No such file|그런 파일이나/.test(err(e)); },
          ex: 'temp1 이 없어서 그 안에 temp2 를 만들 수 없어요.' },
        { t: '이번엔 -p 로 만드세요.', hint: 'mkdir -p temp1/temp2', chk: function () { return exists(home() + '/temp1/temp2'); },
          ex: '-p = 중간 디렉토리까지 생성.' },
        { t: 'temp1 안을 자세히 보세요.', hint: 'ls -l temp1', chk: function (e) { return is(e, 'ls') && has(e, 'l') && args(e).some(function (a) { return /temp1\/?$/.test(a); }); },
          ex: '맨 앞 d = 디렉토리.' },
        { t: '빈 디렉토리 aaa 를 지우세요.', hint: 'rmdir aaa', chk: function (e) { return is(e, 'rmdir') && !exists(home() + '/aaa'); },
          ex: 'rmdir 은 비어 있는 디렉토리만 지워요.' },
        { t: 'temp1 을 rmdir 로 지워 보고 에러를 확인하세요.', hint: 'rmdir temp1', chk: function (e) { return is(e, 'rmdir') && !ok(e) && /not empty|비어있지 않음/i.test(err(e)); },
          ex: 'temp1 안에 temp2 가 있어서 "Directory not empty". 안까지 지우려면 rm -r 을 써요.' }
      ]
    },
    {
      id: 'm6', ch: '3장', title: '파일 만들고 내용 보기',
      intro: '홈(~)에서 하세요. cat > 파일 은 입력한 내용을 파일로 저장해요.',
      steps: [
        { t: 'hello.txt 를 만들고 두세 줄 입력한 뒤 Ctrl+D 로 저장하세요.', hint: 'cat > hello.txt', chk: function (e) { return is(e, 'cat') && />\s*hello\.txt/.test(line(e)) && content('hello.txt').length > 0; },
          ex: '> = 화면 대신 파일로 보내기(리다이렉션). Ctrl+D = 입력 끝(EOF).' },
        { t: '내용을 확인하세요.', hint: 'cat hello.txt', chk: function (e) { return is(e, 'cat') && args(e).indexOf('hello.txt') >= 0 && line(e).indexOf('>') < 0 && ok(e); },
          ex: 'cat = 파일 내용을 화면에 출력.' },
        { t: '줄 번호를 붙여 보세요.', hint: 'cat -n hello.txt', chk: function (e) { return is(e, 'cat') && has(e, 'n'); },
          ex: '-n = number.' },
        { t: '1부터 20까지 숫자를 num.txt 로 저장하세요.', hint: 'seq 1 20 > num.txt', chk: function () { return lines(content('num.txt')).length >= 20; },
          ex: 'seq = 숫자 차례로 출력. > 로 파일에 저장.' },
        { t: '앞 3줄만 보세요.', hint: 'head -n 3 num.txt', chk: function (e) { return is(e, 'head') && lines(out(e)).length === 3; },
          ex: 'head = 앞부분(기본 10줄). -n 3 = 3줄.' },
        { t: '뒤 3줄만 보세요.', hint: 'tail -n 3 num.txt', chk: function (e) { return is(e, 'tail') && lines(out(e)).length === 3; },
          ex: 'tail = 뒷부분. 로그 파일 끝을 볼 때 많이 써요 (-f 는 계속 따라가며 보기).' },
        { t: '한 화면씩 넘겨 보세요. (스페이스, q)', hint: 'more num.txt', chk: function (e) { return is(e, ['more', 'less']); },
          ex: 'more/less = 긴 파일을 페이지 단위로 보기.' },
        { t: '줄 수를 세 보세요.', hint: 'wc -l num.txt', chk: function (e) { return is(e, 'wc') && /20/.test(out(e)); },
          ex: 'wc = word count. -l 줄, -w 단어, -c 바이트.' },
        { t: 'hello.txt 끝에 hi 를 덧붙이세요.', hint: 'echo "hi" >> hello.txt', chk: function () { return /hi\n?$/.test(content('hello.txt')); },
          ex: '>> = 덧붙이기, > = 덮어쓰기. 헷갈리면 파일이 날아가요!' }
      ]
    },
    {
      id: 'm7', ch: '3장', title: '복사·이동·삭제', star: true,
      intro: '노트 문제: ~/tmp/tmp1 에서 cp ~/test2.sh . 를 하면 무슨 일이 일어날까?',
      steps: [
        { t: '~/tmp/tmp1 을 만드세요.', hint: 'mkdir -p ~/tmp/tmp1', chk: function () { return exists(home() + '/tmp/tmp1'); },
          ex: '~ 를 쓰면 어디서 쳐도 홈 기준이에요.' },
        { t: 'tmp1 으로 이동하세요.', hint: 'cd ~/tmp/tmp1', chk: function (e) { return is(e, 'cd') && cwdIs(home() + '/tmp/tmp1'); },
          ex: '이제 현재 디렉토리 = ~/tmp/tmp1.' },
        { t: '홈의 test2.sh 를 현재 디렉토리로 복사하세요.', hint: 'cp ~/test2.sh .', chk: function () { return exists(home() + '/tmp/tmp1/test2.sh'); },
          ex: '. = 현재 디렉토리. "홈의 test2.sh 를 현재 디렉토리(~/tmp/tmp1)에 복사해라"예요.' },
        { t: '복사됐는지 확인하세요.', hint: 'ls', chk: function (e) { return is(e, 'ls') && /test2\.sh/.test(out(e)); },
          ex: '원본(~/test2.sh)은 그대로 남아 있어요.' },
        { t: '이름을 run.sh 로 바꾸세요.', hint: 'mv test2.sh run.sh', chk: function () { return exists(home() + '/tmp/tmp1/run.sh') && !exists(home() + '/tmp/tmp1/test2.sh'); },
          ex: 'mv = 이동. 같은 디렉토리 안에서 옮기면 이름 바꾸기가 돼요.' },
        { t: 'run.sh 를 지우세요.', hint: 'rm run.sh', chk: function () { return !exists(home() + '/tmp/tmp1/run.sh'); },
          ex: 'rm 은 휴지통이 없어요. 바로 사라져요.' },
        { t: '홈으로 돌아가서 tmp 를 통째로 지우세요.', hint: 'cd ~ ; rm -r tmp', chk: function (e) { return is(e, 'rm') && has(e, 'r') && !exists(home() + '/tmp'); },
          ex: '-r = 안쪽까지 재귀적으로. 내가 들어가 있는 디렉토리는 먼저 빠져나온 뒤 지우세요.' }
      ]
    },
    {
      id: 'm8', ch: '3장', title: '파일 종류와 stat 시간 4가지', star: true,
      intro: '공개 예상문제 ③ Access · Modify · Change · Birth 시간을 직접 바꿔 보며 확인해요. 홈(~)에서 하세요.',
      steps: [
        { t: '홈을 자세히 보고 맨 앞 글자를 확인하세요.', hint: 'ls -l', chk: function (e) { return is(e, 'ls') && has(e, 'l'); },
          ex: '- 일반 파일, d 디렉토리, l 심볼릭 링크, p 파이프, c/b 장치 파일.' },
        { t: '이름 있는 파이프 mypipe 를 만드세요.', hint: 'mkfifo mypipe', chk: function () { var n = node(home() + '/mypipe'); return !!n && n.type === 'p'; },
          ex: 'mkfifo = 이름 있는 파이프(FIFO). | 와 달리 파일로 남아서 다른 터미널끼리 주고받을 수 있어요.' },
        { t: 'mypipe 의 종류 글자를 확인하세요.', hint: 'ls -l mypipe', chk: function (e) { return is(e, 'ls') && /^p/m.test(out(e)); },
          ex: '맨 앞이 p = 파이프 파일.' },
        { t: '빈 파일 memo.txt 를 만드세요.', hint: 'touch memo.txt', chk: function () { return exists(home() + '/memo.txt'); },
          ex: 'touch = 없으면 빈 파일 생성, 있으면 시간만 갱신.' },
        { t: 'memo.txt 의 상세 정보를 보세요.', hint: 'stat memo.txt', chk: function (e) { return is(e, 'stat') && /Birth|생성/.test(out(e)); },
          ex: 'Access 마지막으로 읽은 시간 · Modify 내용 수정 · Change 정보(권한·소유자 등) 변경 · Birth 생성 시간.' },
        { t: '파일을 읽은 뒤(cat) 다시 stat 하세요. Access 를 보세요.', hint: 'cat memo.txt', chk: function (e) { return is(e, 'stat') && /memo\.txt/.test(line(e)) && (P.data.m8cat === true); },
          ex: '읽기만 하면 Access 만 바뀌어요.', pre: function (e) { if (is(e, 'cat') && /memo\.txt/.test(line(e)) && line(e).indexOf('>') < 0) P.data.m8cat = true; } },
        { t: '내용을 덧붙인 뒤 다시 stat 하세요.', hint: 'echo hi >> memo.txt', chk: function (e) { return is(e, 'stat') && /memo\.txt/.test(line(e)) && /hi/.test(content(home() + '/memo.txt')); },
          ex: '내용이 바뀌면 Modify 와 Change 가 함께 바뀌어요 (크기 같은 정보도 바뀌니까).' },
        { t: '권한을 600 으로 바꾼 뒤 다시 stat 하세요.', hint: 'chmod 600 memo.txt', chk: function (e) { var n = node(home() + '/memo.txt'); return is(e, 'stat') && n && (n.mode & 511) === 384; },
          ex: '권한만 바꾸면 Change 만 바뀌어요. Birth 는 처음 만든 시각 그대로예요.' }
      ]
    },
    {
      id: 'm9', ch: '3장', title: '권한과 sudo',
      intro: '노트 문제: cat etc/sudoers 와 cat /etc/sudoers 는 어떻게 다를까?',
      steps: [
        { t: '그냥 sudo 설정 파일을 읽어 보세요.', hint: 'cat /etc/sudoers', chk: function (e) { return is(e, 'cat') && !isSudo(e) && /Permission denied|허가 거부/.test(err(e)); },
          ex: '/etc/sudoers 는 root 만 읽을 수 있어요 (-r--r----- root root).' },
        { t: '관리자 권한으로 읽어 보세요.', hint: 'sudo cat /etc/sudoers', chk: function (e) { return is(e, 'cat') && isSudo(e) && ok(e); },
          ex: 'sudo = 이 명령 한 번만 root 권한으로. "%sudo ALL=(ALL:ALL) ALL" 줄 덕분에 user1 이 sudo 를 쓸 수 있어요.' },
        { t: 'sudo 로 실행하면 누구로 실행되는지 보세요.', hint: 'sudo whoami', chk: function (e) { return is(e, 'whoami') && isSudo(e) && /root/.test(out(e)); },
          ex: 'sudo 붙인 명령은 root 로 실행돼요.' },
        { t: '홈에서 / 없이 etc/sudoers 를 읽어 보세요.', hint: 'cat etc/sudoers', chk: function (e) { return is(e, 'cat') && args(e).some(function (a) { return /^etc\/sudoers/.test(a); }) && /No such file|그런 파일이나/.test(err(e)); },
          ex: '/ 가 없으면 상대경로 → "현재 디렉토리 아래 etc/sudoers" 를 찾아요. 홈엔 etc 가 없으니 No such file or directory.' },
        { t: '~/test2.sh 에 실행 권한을 주세요 (rwxr-xr-x).', hint: 'chmod 755 ~/test2.sh', chk: function () { var n = node(home() + '/test2.sh'); return !!n && (n.mode & 511) === 493; },
          ex: '7=rwx(4+2+1), 5=r-x(4+1). 소유자 · 그룹 · 기타 순서.' },
        { t: 'ls -l 로 x 가 붙었는지 확인하세요.', hint: 'ls -l ~/test2.sh', chk: function (e) { return is(e, 'ls') && has(e, 'l') && /-rwxr-xr-x/.test(out(e)); },
          ex: '실행 파일은 ls 에서 초록색으로 보여요.' }
      ]
    },
    {
      id: 'm10', ch: '3장', title: '사용자 계정 관리', star: true,
      intro: '공개 예상문제 ② 계정 관리 명령어 + 노트 "rm -rf /home/jung 과 userdel -rf jung 의 차이".',
      steps: [
        { t: 'jung 계정을 만드세요.', hint: 'sudo useradd jung', chk: function () { return !!users().jung; },
          ex: 'useradd 는 관리자만. CentOS 는 -m 을 안 붙여도 홈 디렉토리(/home/jung)를 자동으로 만들어요. (우분투는 -m 이 필요해요)' },
        { t: 'jung 계정 정보를 확인하세요.', hint: 'id jung', chk: function (e) { return is(e, 'id') && /uid=/.test(out(e)) && /jung/.test(line(e)); },
          ex: 'uid(사용자 번호) · gid(기본 그룹) · groups(소속 그룹).' },
        { t: '/home 아래를 자세히 보세요.', hint: 'ls -l /home', chk: function (e) { return is(e, 'ls') && /jung/.test(out(e)); },
          ex: '사용자마다 홈 디렉토리가 하나씩 있어요. CentOS 홈 권한은 drwx------ (본인만 접근). 권한 뒤의 점(.)은 SELinux 표시예요.' },
        { t: 'jung 의 비밀번호를 1234 로 정하세요. (두 번 입력)', hint: 'sudo passwd jung', chk: function () { var u = users().jung; return !!u && !!u.hasPassword; },
          ex: '화면에 안 보여도 입력되고 있어요. 두 번 똑같이 입력해요.' },
        { t: '홈 디렉토리만 지워 보세요.', hint: 'sudo rm -rf /home/jung', chk: function () { return !exists('/home/jung') && !!users().jung; },
          ex: 'rm -rf = 디렉토리를 통째로 강제 삭제. 계정 정보는 그대로예요.' },
        { t: '계정이 아직 있는지 확인하세요.', hint: 'id jung', chk: function (e) { return is(e, 'id') && /uid=/.test(out(e)) && /jung/.test(line(e)); },
          ex: '디렉토리는 사라졌지만 계정은 남아 있어요 → 로그인은 가능.' },
        { t: '이번엔 계정 자체를 지우세요.', hint: 'sudo userdel -rf jung', chk: function () { return !users().jung; },
          ex: 'userdel 계정 삭제, -r 홈·메일 스풀도 삭제, -f 강제. 계정과 디렉토리가 완전히 사라져요.' },
        { t: '다시 확인하세요.', hint: 'id jung', chk: function (e) { return is(e, 'id') && /no such user|그런 사용자가 없습니다/i.test(err(e)); },
          ex: '"그런 사용자가 없습니다(no such user)" = 계정이 완전히 사라짐.' }
      ]
    },
    {
      id: 'm11', ch: '3장', title: '프로세스·su·exit', star: true,
      intro: '노트 "kill 대신 exit 을 써야 하는 이유". su 할 때마다 자식 bash 가 하나씩 생겨요.',
      steps: [
        { t: 'jung 계정을 만드세요.', hint: 'sudo useradd jung', chk: function () { return !!users().jung && exists('/home/jung'); },
          ex: '홈이 없다고 나오면 sudo userdel -rf jung 후 다시 만드세요.' },
        { t: 'jung 의 비밀번호를 1234 로 정하세요. (두 번 입력)', hint: 'sudo passwd jung', chk: function () { var u = users().jung; return !!u && !!u.hasPassword; },
          ex: 'su 로 들어가려면 비밀번호가 필요해요. 8자보다 짧으면 BAD PASSWORD 경고가 나오지만 root 가 바꾸는 거라 그대로 설정돼요.' },
        { t: '지금 bash 의 PID 를 확인하세요.', hint: 'echo $$', chk: function (e) {
            var v = out(e).trim(); if (is(e, 'echo') && /^\d+$/.test(v) && st().user === 'user1') { P.data.pid1 = v; return true; } return false; },
          ex: '$$ = 지금 실행 중인 셸(bash)의 PID. 이 번호를 기억해 두세요.' },
        { t: 'jung 으로 전환하세요.', hint: 'su jung', chk: function () { return st().user === 'jung'; },
          ex: 'su = switch user. user1 의 bash 위에 su → 새 bash(jung) 가 자식으로 생겨요.' },
        { t: '다시 PID 를 확인하세요. 처음과 달라요.', hint: 'echo $$', chk: function (e) { var v = out(e).trim(); return is(e, 'echo') && /^\d+$/.test(v) && v !== P.data.pid1; },
          ex: '새 bash 니까 PID 도 새 번호예요.' },
        { t: '처음 bash 부터 프로세스 나무를 보세요.', hint: function () { return 'pstree -p ' + (P.data.pid1 || '처음PID'); }, chk: function (e) { return is(e, 'pstree') && /su\(/.test(out(e)); },
          ex: 'bash(처음) ─ su ─ bash(jung) ─ pstree. 셸이 중첩된 구조예요.' },
        { t: '현재 bash 의 부모(PPID)를 확인하세요.', hint: 'ps -fp $$', chk: function (e) { return is(e, 'ps') && /PPID/.test(out(e)); },
          ex: 'PPID = 부모 프로세스 번호. jung 의 bash 의 부모는 su 예요.' },
        { t: '나는 누구? 확인하세요.', hint: 'whoami', chk: function (e) { return is(e, 'whoami') && /jung/.test(out(e)); },
          ex: '지금 셸의 주인은 jung.' },
        { t: 'exit 로 jung 셸을 끝내고 user1 로 돌아오세요.', hint: 'exit', chk: function () { return st().user === 'user1' && bashCount() <= 1; },
          ex: 'exit 은 현재(자식) 셸만 끝내고 부모로 돌아가요. 중첩된 셸은 exit 으로 하나씩 순서대로 닫아요.' },
        { opt: true, t: '(선택) su jung → su user1 로 셸을 세 겹으로 만드세요.', hint: 'su jung', chk: function () { return st().user === 'user1' && bashCount() >= 3; },
          ex: 'user1 bash ─ su ─ jung bash ─ su ─ user1 bash.' },
        { opt: true, t: '(선택) 이 상태에서 jung 계정을 지워 보세요.', hint: 'sudo userdel -rf jung', chk: function (e) { return is(e, 'userdel') && /currently used by process|프로세스가 사용 중/.test(err(e)); },
          ex: 'jung 의 bash 가 아직 살아 있어서 "currently used by process" 에러가 나요.' },
        { opt: true, t: '(선택) exit 을 두 번 쳐서 처음 셸로 돌아온 뒤 다시 지우세요.', hint: 'exit', chk: function () { return bashCount() <= 1 && !users().jung; },
          ex: 'exit 으로 자식부터 순서대로 닫으면 문제없이 지워져요. ⚠️ sudo kill -9 로 부모 bash 를 죽이면 그 아래 셸이 전부 "죽었음(Killed)" 으로 꺼지고 터미널이 닫혀요. 그래서 kill 대신 exit 을 써요.' }
      ]
    },
    {
      id: 'm12', ch: '4장', title: 'vim 기초',
      intro: 'vim 은 모드가 있는 편집기예요. 명령 모드(시작) → i 로 입력 모드 → Esc 로 명령 모드 → : 로 마지막 행 모드.',
      steps: [
        { on: 'vim', t: 'memo.txt 를 vim 으로 여세요.', hint: 'vim memo.txt', chk: function (v) { return v.type === 'open' && /memo\.txt$/.test(v.path || ''); },
          ex: '처음엔 명령 모드. 이때 누르는 키는 글자가 아니라 명령이에요.' },
        { on: 'vim', t: 'i 를 눌러 입력 모드로 가세요.', hint: 'i', chk: function (v) { return v.type === 'mode' && v.mode === 'insert'; },
          ex: '아래에 -- INSERT -- 가 보여요. i a o 도 입력 모드로 가는 키예요.' },
        { on: 'vim', t: '두세 줄 입력한 뒤 Esc 로 명령 모드로 돌아오세요.', hint: 'Esc', chk: function (v) { return v.type === 'mode' && v.mode === 'normal'; },
          ex: '입력한 내용은 아직 메모리(버퍼)에만 있어요.' },
        { on: 'vim', t: ':wq 로 저장하고 나오세요.', hint: ':wq', chk: function (v) { return v.type === 'write' && /memo\.txt$/.test(v.path || ''); },
          ex: 'w = 디스크에 저장, q = 종료. 저장 명령을 줘야 파일에 기록돼요.' },
        { t: '저장됐는지 확인하세요.', hint: 'cat memo.txt', chk: function (e) { return is(e, 'cat') && /memo\.txt/.test(line(e)) && ok(e); },
          ex: '방금 쓴 내용이 보이면 성공.' },
        { on: 'vim', t: '다시 열어서 첫 줄에서 yy(한 줄 복사)를 누르세요.', hint: 'vim memo.txt → yy', chk: function (v) { return v.type === 'cmd' && /^\d*yy$/.test(v.text || ''); },
          ex: '복사한 내용은 버퍼(클립보드 같은 임시 공간)에 들어가요.' },
        { on: 'vim', t: 'p 로 붙여 넣으세요.', hint: 'p', chk: function (v) { return v.type === 'cmd' && /^p$/i.test(v.text || ''); },
          ex: 'p = 커서 아래에, P = 위에 붙이기.' },
        { on: 'vim', t: 'dd 로 한 줄을 지우세요.', hint: 'dd', chk: function (v) { return v.type === 'cmd' && /^\d*dd$/.test(v.text || ''); },
          ex: 'dd = 한 줄 잘라내기(삭제 + 버퍼에 저장).' },
        { on: 'vim', t: '/ 로 글자를 검색하고 n 으로 다음을 찾으세요.', hint: '/hi → n', chk: function (v) { return v.type === 'cmd' && (v.text === 'n' || v.text === 'N'); },
          ex: '/ 아래로 검색, ? 위로 검색, n 같은 방향, N 반대 방향.' },
        { on: 'vim', t: ':q! 로 저장하지 않고 나오세요.', hint: ':q!', chk: function (v) { return (v.type === 'cmd' || v.type === 'quit') && /q!/.test(v.text || ''); },
          ex: '! = 강제. 바꾼 내용을 버리고 나가요.' },
        { opt: true, on: 'vim', t: '(선택) 이름 있는 버퍼: "1yy 로 복사하고 "1p 로 붙이세요.', hint: '"1yy → "1p', chk: function (v) { return v.type === 'cmd' && /^"\w\d*p$/i.test(v.text || ''); },
          ex: '"이름 + 명령 = 그 이름의 버퍼 사용. 여러 내용을 따로 저장해 둘 수 있어요.' }
      ]
    }
  ];

  /* ---------- 진행 계산 ---------- */
  function doneSet(m) { return P.done[m.id] || (P.done[m.id] = []); }
  function isDone(m, i) { return doneSet(m).indexOf(i) >= 0; }
  function reqCount(m) { return m.steps.filter(function (s) { return !s.opt; }).length; }
  function reqDone(m) { var d = 0; m.steps.forEach(function (s, i) { if (!s.opt && isDone(m, i)) d++; }); return d; }
  function complete(m) { return reqDone(m) >= reqCount(m); }
  function curIndex(m) { for (var i = 0; i < m.steps.length; i++) if (!isDone(m, i)) return i; return -1; }
  function byId(id) { for (var i = 0; i < M.length; i++) if (M[i].id === id) return M[i]; return M[0]; }
  function hintText(s) { return typeof s.hint === 'function' ? s.hint() : s.hint; }

  /* ---------- 이벤트 처리 ---------- */
  function handle(kind, e) {
    var m = byId(P.active);
    var i = curIndex(m);
    if (i >= 0) {
      var s = m.steps[i];
      if (kind === 'command' && s.pre) { try { s.pre(e); } catch (x) { } }
      if ((s.on || 'command') === kind) {
        var passed = false;
        try { passed = !!s.chk(e); } catch (x) { passed = false; }
        // cd ~ ; rm -r tmp 처럼 한 줄에 여러 명령을 쓰면 첫 명령만 argv 에 들어오므로, 줄 안의 명령을 하나씩 따로 확인
        if (!passed && kind === 'command' && e && e.cmds && e.cmds.length > 1) {
          for (var k = 0; k < e.cmds.length && !passed; k++) { try { passed = !!s.chk(Object.assign({}, e, { argv: e.cmds[k] })); } catch (x) { } }
        }
        if (passed) {
          doneSet(m).push(i);
          recent = { m: m.id, i: i, fresh: true };
          save();
          render();
          if (complete(m)) { if (!(P.fin && P.fin[m.id])) { window.LMTrack && window.LMTrack.event('mission'); } P.fin = P.fin || {}; P.fin[m.id] = true; save(); }
        }
      }
    }
    if (kind === 'command') prevCwd = e && e.cwd;
  }

  function skip(m, i) { if (!isDone(m, i)) { doneSet(m).push(i); save(); render(); } }

  /* ---------- 화면 ---------- */
  var root, confirmOpen = false, listOpen = false, openHints = {}, recent = null;

  function css() {
    var s = document.createElement('style');
    s.textContent = [
      '#missions{--m-bg:var(--lab-panel,#26232b);--m-fg:var(--lab-fg,#ece8f0);--m-mut:var(--lab-muted,#a49cae);--m-acc:var(--lab-accent,#a974e8);--m-ok:var(--lab-ok,#4cc38a);--m-line:var(--lab-line,#3a3540);color:var(--m-fg);font-size:14px;line-height:1.5;display:flex;flex-direction:column;gap:12px;min-width:0;position:relative;overflow:hidden;padding:12px}',
      '#missions *{box-sizing:border-box}',
      '#missions button{font:inherit;cursor:pointer;color:inherit}',
      '#missions button:focus-visible{outline:2px solid var(--m-acc);outline-offset:2px}',
      '#missions kbd{font-family:var(--lab-mono,ui-monospace,monospace);font-size:11px;padding:0 5px;border-radius:4px;border:1px solid currentColor;opacity:.75;margin-left:6px;white-space:nowrap}',
      /* 상단: 과제 고르기 */
      '#missions .mtop{display:grid;grid-template-columns:40px minmax(0,1fr) 40px;gap:6px;align-items:stretch;flex:none}',
      '#missions .nb{border:1px solid var(--m-line);background:transparent;border-radius:9px;font-size:20px;line-height:1;display:grid;place-items:center}',
      '#missions .nb:hover:not(:disabled){border-color:var(--m-mut);background:#ffffff0a}',
      '#missions .nb:disabled{opacity:.3;cursor:default}',
      '#missions .pick{border:1px solid var(--m-line);background:#ffffff08;border-radius:9px;padding:7px 12px;text-align:left;display:flex;align-items:center;gap:10px;min-width:0}',
      '#missions .pick:hover{border-color:var(--m-mut)}',
      '#missions .pick .pk{flex:1;min-width:0;display:flex;flex-direction:column}',
      '#missions .pick .pk-n{font-size:11.5px;color:var(--m-mut)}',
      '#missions .pick .pk-t{font-size:15.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#missions .pick .car{color:var(--m-mut);font-size:12px;transition:transform .15s}',
      '#missions .pick[aria-expanded="true"] .car{transform:rotate(180deg)}',
      /* 단계 점 */
      '#missions .dots{display:flex;gap:4px;flex:none}',
      '#missions .dots i{flex:1;height:6px;border-radius:3px;background:var(--m-line)}',
      '#missions .dots i.ok{background:var(--m-ok)} #missions .dots i.cur{background:var(--m-acc)} #missions .dots i.opt{opacity:.45}',
      '#missions .pwbox{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;padding:6px 10px;border-radius:8px;background:#ffffff0a;border:1px solid var(--m-line)}',
      '#missions .pwbox code{font-family:var(--lab-mono,ui-monospace,monospace);font-size:14px;font-weight:700;color:#fce94f;background:#0000004d;padding:0 7px;border-radius:5px}',
      '#missions .pwbox span{color:var(--m-mut);font-size:12px}',
      '#missions .intro{margin:0;color:var(--m-mut);font-size:12.5px;line-height:1.5}',
      '#missions .tag{display:inline-block;font-size:11px;font-weight:700;padding:0 7px;border-radius:999px;border:1px solid var(--m-acc);color:var(--m-acc);margin-right:6px;vertical-align:1px}',
      /* 방금 완료 */
      '#missions .got{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.5;color:var(--m-mut);padding-bottom:10px;border-bottom:1px solid var(--m-line)}',
      '#missions .got b{color:var(--m-ok);white-space:nowrap}',
      '#missions .got.pop{animation:mgot .5s ease-out}',
      '@keyframes mgot{0%{transform:translateY(-4px);opacity:0}100%{transform:none;opacity:1}}',
      /* 지금 할 일 */
      '#missions .now{flex:none;border:1.5px solid var(--m-acc);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px;background:color-mix(in srgb,var(--m-acc) 8%,var(--m-bg))}',
      '#missions .now.pop{animation:mnow .45s ease-out}',
      '@keyframes mnow{0%{transform:scale(.97);opacity:.4}100%{transform:none;opacity:1}}',
      '#missions .now-h{font-size:12px;color:var(--m-mut);margin-bottom:-6px}',
      '#missions .now-h b{color:var(--m-acc);font-size:12.5px}',
      '#missions .now-t{font-size:17px;font-weight:700;line-height:1.45;text-wrap:pretty}',
      '#missions .cmd{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap}',
      '#missions .cmd code{flex:1 1 160px;min-width:0;font-family:var(--lab-mono,ui-monospace,monospace);font-size:15px;background:#0000004d;border:1px solid var(--m-line);padding:8px 11px;border-radius:8px;word-break:break-all;display:flex;align-items:center}',
      '#missions .cmd code::before{content:"$ ";color:var(--m-mut);white-space:pre}',
      '#missions .reveal{flex:1;border:1px dashed var(--m-mut);background:transparent;border-radius:8px;padding:9px 12px;font-size:13.5px;color:var(--m-mut);text-align:center}',
      '#missions .reveal:hover{border-color:var(--m-fg);color:var(--m-fg)}',
      '#missions .ins{border:0;background:var(--m-acc);color:#fff;border-radius:8px;padding:8px 14px;font-weight:700;font-size:13.5px;white-space:nowrap}',
      '#missions .ins:hover{filter:brightness(1.1)}',
      '#missions .sub{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:var(--m-mut)}',
      '#missions .lnk{border:0;background:none;padding:2px 0;font-size:12px;color:var(--m-mut);text-decoration:underline;text-underline-offset:3px}',
      '#missions .lnk:hover{color:var(--m-fg)}',
      /* 과제 완료 */
      '#missions .fin{flex:none;border:1.5px solid var(--m-ok);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;background:color-mix(in srgb,var(--m-ok) 12%,var(--m-bg));animation:mnow .45s ease-out}',
      '#missions .fin h3{margin:0;font-size:18px}',
      '#missions .fin p{margin:0;font-size:13px;color:var(--m-mut)}',
      '#missions .go{border:0;background:var(--m-ok);color:#0e2418;border-radius:9px;padding:11px 14px;font-weight:800;font-size:14.5px;text-align:left;display:flex;justify-content:space-between;align-items:center;gap:8px}',
      '#missions .go:hover{filter:brightness(1.08)}',
      /* 단계 목록 */
      '#missions .sl{flex:1 1 auto;min-height:60px;overflow:auto;display:flex;flex-direction:column;gap:6px;scrollbar-width:thin}',
      '#missions .sl-h{font-size:12px;color:var(--m-mut);display:flex;justify-content:space-between}',
      '#missions ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}',
      '#missions li button{width:100%;border:0;background:transparent;border-radius:7px;padding:5px 8px;display:grid;grid-template-columns:20px minmax(0,1fr);gap:8px;align-items:start;text-align:left;font-size:13px}',
      '#missions li .ic{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--m-line);display:grid;place-items:center;font-size:10.5px;margin-top:1px;color:var(--m-mut)}',
      '#missions li .tx{color:var(--m-mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#missions li.ok .ic{background:var(--m-ok);border-color:var(--m-ok);color:#10261b;font-weight:800}',
      '#missions li.ok button:hover{background:#ffffff0a}',
      '#missions li.cur button{background:color-mix(in srgb,var(--m-acc) 14%,transparent)}',
      '#missions li.cur .ic{border-color:var(--m-acc);color:var(--m-acc)} #missions li.cur .tx{color:var(--m-fg);font-weight:700}',
      '#missions li.pend button{cursor:default}',
      '#missions li .opt{font-size:10.5px;margin-left:4px;opacity:.8}',
      '#missions li .ex{grid-column:2;white-space:normal;font-size:12.5px;color:var(--m-fg);opacity:.85;border-left:2px solid var(--m-ok);padding-left:8px;margin-top:3px}',
      /* 아래 */
      '#missions .mfoot .pw code{font-family:var(--lab-mono,ui-monospace,monospace);font-size:13.5px;font-weight:700;color:#fce94f;margin-left:2px}',
      '#missions .mfoot .fr{display:flex;align-items:center;gap:12px}',
      '#missions .mfoot{flex:none;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid var(--m-line);padding-top:9px;font-size:12px;color:var(--m-mut)}',
      '#missions .mfoot label{display:flex;gap:6px;align-items:center;cursor:pointer}',
      '#missions .mfoot input{accent-color:var(--m-acc)}',
      '#missions .cfm{flex:none;border:1px solid var(--m-acc);border-radius:9px;padding:10px;font-size:13px;display:flex;flex-direction:column;gap:8px}',
      '#missions .cfm .row{display:flex;gap:6px}',
      '#missions .btn{border:1px solid var(--m-line);background:transparent;border-radius:7px;padding:5px 12px;font-size:12.5px}',
      '#missions .btn.pri{background:var(--m-acc);border-color:var(--m-acc);color:#fff}',
      /* 과제 목록 펼침 */
      '#missions .menu{position:absolute;left:12px;right:12px;top:76px;bottom:12px;z-index:5;background:var(--m-bg);border:1px solid var(--m-line);border-radius:12px;box-shadow:0 18px 40px #0009;display:flex;flex-direction:column;overflow:hidden;animation:mgot .18s ease-out}',
      '#missions .menu-h{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--m-line);font-size:12.5px;color:var(--m-mut)}',
      '#missions .menu-b{overflow:auto;padding:6px;display:flex;flex-direction:column;gap:2px}',
      '#missions .mi{border:0;background:transparent;border-radius:8px;padding:8px 10px;display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:10px;align-items:center;text-align:left;font-size:14px}',
      '#missions .mi:hover{background:#ffffff0d}',
      '#missions .mi.on{background:color-mix(in srgb,var(--m-acc) 18%,transparent)}',
      '#missions .mi .n{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:11.5px;font-weight:700;background:var(--m-line)}',
      '#missions .mi.on .n{background:var(--m-acc);color:#fff} #missions .mi.fin .n{background:var(--m-ok);color:#10261b}',
      '#missions .mi .c{font-size:11.5px;color:var(--m-mut);font-variant-numeric:tabular-nums}',
      '#missions .mi .ch{font-size:11px;color:var(--m-mut);margin-left:6px}',
      '@media (prefers-reduced-motion:reduce){#missions .now.pop,#missions .got.pop,#missions .fin,#missions .menu{animation:none}}',
      '@media (max-width:900px){#missions{overflow:visible}#missions .sl{overflow:visible}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function totals() {
    var all = 0, d = 0, fin = 0;
    M.forEach(function (m) { all += reqCount(m); d += reqDone(m); if (complete(m) || (P.fin && P.fin[m.id])) fin++; });
    return { all: all, d: d, fin: fin };
  }
  function isFin(m) { return complete(m) || !!(P.fin && P.fin[m.id]); }
  function canInsert(s, hint) { return (s.on || 'command') === 'command' && hint && !/→/.test(hint) && !/처음PID/.test(hint); }
  var lastKey = '';

  function render() {
    if (!root) return;
    var m = byId(P.active), cur = curIndex(m), T = totals(), idx = M.indexOf(m);
    var h = [];
    var req = reqCount(m), rd = reqDone(m);

    h.push('<div class="mtop">');
    h.push('<button class="nb" data-a="prev" aria-label="이전 과제"' + (idx === 0 ? ' disabled' : '') + '>‹</button>');
    h.push('<button class="pick" data-a="list" aria-haspopup="true" aria-expanded="' + listOpen + '"><span class="pk"><span class="pk-n">과제 ' + (idx + 1) + ' / ' + M.length + '</span>' +
      '<span class="pk-t">' + (m.star ? '⭐ ' : '') + esc(m.title) + '</span></span><span class="car">▼</span></button>');
    h.push('<button class="nb" data-a="next" aria-label="다음 과제"' + (idx === M.length - 1 ? ' disabled' : '') + '>›</button>');
    h.push('</div>');

    h.push('<div class="dots" aria-hidden="true">');
    m.steps.forEach(function (s, i) { h.push('<i class="' + (isDone(m, i) ? 'ok' : (i === cur ? 'cur' : '')) + (s.opt ? ' opt' : '') + '"></i>'); });
    h.push('</div>');
    var gotHTML = '';
    if (recent && recent.m === m.id && m.steps[recent.i]) {
      gotHTML = '<div class="got' + (recent.fresh ? ' pop' : '') + '" role="status"><b>✓</b><span>' + esc(m.steps[recent.i].ex) + '</span></div>';
      recent.fresh = false;
    }

    var key = m.id + ':' + cur;
    if (cur >= 0 && !(complete(m) && m.steps[cur].opt && P.skipOpt)) {
      var s = m.steps[cur], hint = hintText(s), shown = P.showAll || openHints[key];
      h.push('<section class="now' + (key !== lastKey ? ' pop' : '') + '" aria-live="polite">');
      h.push(gotHTML || (cur === 0 ? '<p class="intro">' + esc(m.intro) + '</p>' : ''));
      h.push('<div class="now-h"><b>' + (cur + 1) + '단계</b>' + (s.opt ? ' · 선택' : '') + (s.on === 'vim' ? ' · vim 안에서' : '') + '</div>');
      h.push('<div class="now-t">' + esc(s.t) + '</div>');
      h.push('<div class="cmd">');
      if (shown) {
        h.push('<code>' + esc(hint) + '</code>');
        if (canInsert(s, hint)) h.push('<button class="ins" data-a="ins" data-h="' + esc(hint) + '" title="단축키 Alt+H">입력하기</button>');
      } else {
        h.push('<button class="reveal" data-a="hint" data-k="' + key + '" title="단축키 Alt+H">명령어 보기</button>');
      }
      h.push('</div>');
      if (s.opt) h.push('<div class="sub"><button class="lnk" data-a="skip" data-i="' + cur + '">건너뛰기</button></div>');
      h.push('</section>');
    }
    lastKey = key;

    if (complete(m)) {
      var nx = M[idx + 1];
      h.push('<section class="fin" role="status">' + gotHTML + '<h3>🎉 과제 완료!</h3>');
      if (nx) h.push('<button class="go" data-a="next" title="단축키 Alt+N"><span>다음: ' + esc(nx.title) + '</span><span>→</span></button>');
      else h.push('<p>모든 과제를 끝냈어요. 수고했어요!</p>');
      h.push('</section>');
    }

    h.push('<div class="sl"><ol>');
    m.steps.forEach(function (s, i) {
      var ok_ = isDone(m, i), c = ok_ ? 'ok' : (i === cur ? 'cur' : 'pend');
      var open = ok_ && P.exOpen && P.exOpen[m.id + ':' + i];
      h.push('<li class="' + c + '"><button data-a="row" data-i="' + i + '"' + (ok_ ? ' aria-expanded="' + !!open + '"' : ' tabindex="-1"') + '><span class="ic">' + (ok_ ? '✓' : (i + 1)) + '</span><span class="tx">' + esc(s.t) + (s.opt ? '<span class="opt">선택</span>' : '') + '</span>' +
        (open ? '<span class="ex">' + esc(s.ex) + '</span>' : '') + '</button></li>');
    });
    h.push('</ol></div>');

    if (confirmOpen) {
      h.push('<div class="cfm" role="alertdialog"><div>모든 과제의 진행 기록과 파일·계정이 처음 상태로 돌아가요. 초기화할까요?</div>' +
        '<div class="row"><button class="btn pri" data-a="resetyes">초기화</button><button class="btn" data-a="resetno">취소</button></div></div>');
    }
    h.push('<div class="mfoot"><span class="pw" title="user1 · root 같음. 칠 때 화면에 안 보여요(정상)">🔑 비밀번호 <code>1234</code></span>' +
      '<span class="fr"><label title="힌트 없이 명령어를 바로 보여 줘요"><input type="checkbox" data-a="showall"' + (P.showAll ? ' checked' : '') + '> 명령어 표시</label>' +
      '<button class="lnk" data-a="redo" title="이 과제를 새 터미널로 다시 시작">처음부터</button><button class="lnk" data-a="reset" title="모든 진행 기록 지우기">초기화</button></span></div>');

    if (listOpen) {
      h.push('<div class="menu" role="dialog" aria-label="과제 목록"><div class="menu-h"><span>완료 ' + T.fin + ' / ' + M.length + ' · ⭐ = 시험 관련</span><button class="lnk" data-a="list">닫기 (Esc)</button></div><div class="menu-b">');
      M.forEach(function (x, k) {
        var cls = 'mi' + (x.id === m.id ? ' on' : '') + (isFin(x) ? ' fin' : '');
        h.push('<button class="' + cls + '" data-a="go" data-id="' + x.id + '"><span class="n">' + (isFin(x) ? '✓' : (k + 1)) + '</span>' +
          '<span>' + (x.star ? '⭐ ' : '') + esc(x.title) + '<span class="ch">' + x.ch + '</span></span><span class="c">' + reqDone(x) + '/' + reqCount(x) + '</span></button>');
      });
      h.push('</div></div>');
    }
    root.innerHTML = h.join('');
    if (listOpen) { var on = root.querySelector('.mi.on'); if (on) { on.scrollIntoView({ block: 'nearest' }); on.focus({ preventScroll: true }); } }
    var cr = root.querySelector('li.cur'); if (cr && !listOpen) { var sl = root.querySelector('.sl'); if (sl && sl.scrollHeight > sl.clientHeight) cr.scrollIntoView({ block: 'nearest' }); }
  }

  function hintAction() {
    var m = byId(P.active), cur = curIndex(m); if (cur < 0) return;
    var s = m.steps[cur], key = m.id + ':' + cur, hint = hintText(s);
    if (!(P.showAll || openHints[key])) { openHints[key] = true; render(); return; }
    if (canInsert(s, hint)) { try { LAB.insert(hint); } catch (x) { } }
  }
  function goNext() { var m = byId(P.active), idx = M.indexOf(m); if (idx < M.length - 1) { P.active = M[idx + 1].id; openMission(M[idx + 1]); } }

  function click(ev) {
    var b = ev.target.closest('[data-a]');
    if (!b || !root.contains(b)) return;
    var a = b.getAttribute('data-a'), m = byId(P.active), idx = M.indexOf(m);
    if (a === 'go') { P.active = b.getAttribute('data-id'); listOpen = false; openMission(byId(P.active)); }
    else if (a === 'list') { listOpen = !listOpen; render(); if (!listOpen) focusTerm(); }
    else if (a === 'hint') { openHints[b.getAttribute('data-k')] = true; render(); focusTerm(); }
    else if (a === 'ins') { try { LAB.insert(b.getAttribute('data-h')); } catch (x) { } focusTerm(); }
    else if (a === 'skip') { skip(m, +b.getAttribute('data-i')); focusTerm(); }
    else if (a === 'row') { var i = +b.getAttribute('data-i'); if (isDone(m, i)) { P.exOpen = P.exOpen || {}; var k = m.id + ':' + i; P.exOpen[k] = !P.exOpen[k]; save(); render(); } }
    else if (a === 'showall') { P.showAll = b.checked; save(); render(); focusTerm(); }
    else if (a === 'prev' && idx > 0) { P.active = M[idx - 1].id; openMission(M[idx - 1]); }
    else if (a === 'next') goNext();
    else if (a === 'redo') { openMission(m); }
    else if (a === 'reset') { confirmOpen = true; render(); }
    else if (a === 'resetno') { confirmOpen = false; render(); }
    else if (a === 'resetyes') {
      confirmOpen = false; P = { done: {}, active: 'm1', data: {} }; openHints = {}; recent = null; save();
      try { localStorage.removeItem(KEY); } catch (x) { }
      openMission(M[0]);
    }
  }
  function focusTerm() { try { LAB.term.focus(); } catch (x) { } }
  function keys(ev) {
    if (ev.key === 'Escape' && listOpen) { listOpen = false; render(); focusTerm(); ev.preventDefault(); return; }
    if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.code === 'KeyH') { ev.preventDefault(); ev.stopPropagation(); hintAction(); }
    else if (ev.code === 'KeyN') { ev.preventDefault(); ev.stopPropagation(); if (complete(byId(P.active))) goNext(); }
  }

  // 과제를 열 때마다: 진행 단계 초기화 + 파일·계정·호스트명이 처음 상태인 새 터미널
  function openMission(m) {
    if (!m) return;
    P.fin = P.fin || {}; if (complete(m)) P.fin[m.id] = true;
    P.done[m.id] = []; P.data = {}; openHints = {}; recent = null; listOpen = false; confirmOpen = false; P.exOpen = {};
    save();
    try { LAB.prepare({ setup: m.setup }); } catch (x) { }
    try { prevCwd = st().cwd || null; } catch (x) { }
    render();
    try { LAB.term.focus(); } catch (x) { }
  }
  LAB.openMission = function (id) { var m = byId(id); if (m) { P.active = id; openMission(m); } };

  function init() {
    root = document.getElementById('missions');
    if (!root) return;
    load();
    if (!byId(P.active) || byId(P.active).id !== P.active) P.active = 'm1';
    css();
    root.addEventListener('click', click);
    window.addEventListener('keydown', keys, true);
    try { prevCwd = st().cwd || null; } catch (x) { }
    LAB.on('command', function (e) { handle('command', e); });
    LAB.on('vim', function (e) { handle('vim', e); });
    render();
  }

  LAB.missions = { list: M, render: render, progress: function () { return P; } };
  if (document.getElementById('missions') || document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})(window.LAB);
