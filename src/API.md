# 리눅스 실습 터미널 — 내부 API (main이 core.js에 구현)

최종 결과물은 단일 HTML(linuxlab.html). build.py가 style.css + core.js + commands.js + vim.js + missions.js 를 순서대로 인라인한다.
모든 JS는 `window.LAB` 하나를 공유한다. 모듈 패턴: `(function(LAB){ ... })(window.LAB);`

## 환경
- Ubuntu 24.04 흉내. 사용자 user1 (uid 1000, groups: user1 sudo), 호스트 ubuntu, 홈 /home/user1. 메시지는 영어(C 로케일) 그대로.
- sudo 비밀번호: 아무 값이나 허용(빈 값만 거부) — 실습용. passwd/su 비밀번호도 동일 규칙(su는 대상 계정에 비밀번호가 설정돼 있어야 함; root로는 su 불가 → "su: Authentication failure" 대신 sudo -i 안내 X, 단순화: `sudo su -` 허용).

## LAB.fs  (가상 파일시스템)
노드: `{type:'d'|'f'|'l'|'p', name, mode(숫자 0o755 등), uid, gid, content(문자열, f), children(객체 name->node, d), target(l), ino, atime, mtime, ctime, btime(ms)}`
- `LAB.fs.resolve(path, opts?)` → `{node, parent, name, abs}` (node 없으면 null). 상대경로는 현재 셸 cwd 기준, `~` 확장 포함. opts.nofollow
- `LAB.fs.read(path)` → 문자열 또는 throw `{code:'ENOENT'|'EACCES'|'EISDIR'}`; atime 갱신
- `LAB.fs.write(path, text, {append})` → 없으면 생성(umask 0002 → 0664), 있으면 덮어쓰기; mtime/ctime 갱신, 권한 검사
- `LAB.fs.exists(path)`, `LAB.fs.isDir(path)`, `LAB.fs.abs(path)`
- `LAB.fs.can(node, 'r'|'w'|'x')` 현재 사용자(또는 sudo 중이면 root) 기준

## LAB.sh (셸 상태)
- `LAB.sh.user` (현재 사용자 이름), `LAB.sh.cwd` (절대경로), `LAB.sh.hostname`, `LAB.sh.home()`
- `LAB.sh.procs` 스택: `[{pid, ppid, user, cmd:'bash'|'su', tty:'pts/0', start}]`, 현재 셸 = 마지막 bash
- `LAB.sh.lastExit`, `LAB.sh.history` (배열)
- `LAB.sh.users` : `{name: {uid, gid, home, shell, groups:[], hasPassword}}`

## LAB.term (화면)
- `LAB.term.print(text, cls?)` 한 줄 이상 출력 (\n 포함 가능). cls: 'err' 등
- `LAB.term.printHTML(html)`
- `LAB.term.clear()`
- `LAB.term.readLine({prompt, hidden})` → Promise<string|null> (Ctrl+C면 null, Ctrl+D 빈 줄이면 '\u0004')
- `LAB.term.fullscreen(handler)` : 터미널 영역을 전체 화면 앱(vim, less, man)용으로 넘김.
  handler = `{render(el), key(e) → true면 처리됨, exit()}`; `LAB.term.fullscreen(null)`로 반환. 터미널 폰트·색 그대로, 크기는 `LAB.term.size()` → `{cols, rows}`.
- `LAB.term.focus()`

## 명령 등록
`LAB.cmd(name, async function(argv, io){ ... return exitCode; }, {help:'한 줄 설명'})`
- argv[0] = 명령 이름. io = `{out(str), err(str), stdin(문자열|null: 파이프 입력), sudo(bool), tty(bool: 파이프/리다이렉트 아님)}`
- out/err 는 줄바꿈을 직접 넣어야 함 (끝에 '\n').
- 에러 메시지는 실제 coreutils 형식 그대로 (예: `cat: x: No such file or directory`).

## 이벤트 (과제 체크용)
`LAB.on('command', fn)` — 명령줄 하나 실행이 끝날 때마다:
`{line, argv(첫 명령의 argv), cmds:[argv...](파이프 각 단계), exit, out(stdout 합친 문자열), err, cwd(실행 후), user(실행 후), sudo(bool), time}`
`LAB.on('vim', fn)` — vim이 발생시키는 이벤트: `{type:'open'|'write'|'quit'|'mode'|'cmd', path, mode, text}` (vim.js가 `LAB.emit('vim', ...)` 호출)
`LAB.emit(name, data)`

## 상태 조회 (과제 체크 함수에서 사용)
`LAB.state()` → `{user, cwd, hostname, procs, users, history}`; 파일은 LAB.fs로 직접 확인.

## 과제 패널 (missions.js가 구현)
- DOM: `#missions` 컨테이너(오른쪽 패널) 안을 missions.js가 전부 그린다.
- `LAB.insert(text)` : 현재 프롬프트 입력칸에 텍스트를 넣어 줌(실행은 안 함) — "따라 치기" 버튼용.
- 진행 저장: localStorage 키 `linuxlab.progress.v1` (try/catch 필수).
- `LAB.resetAll()` : 파일시스템·셸·진행 초기화 (core가 제공, 패널의 초기화 버튼이 호출).
