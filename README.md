# 리눅스 터미널 실습실

Ubuntu 24.04 터미널을 브라우저에서 흉내 낸 **리눅스 기본 명령어 실습 사이트**예요. 설치 없이 바로 명령을 쳐 볼 수 있어요.

**바로 열기:** https://didgmltmd.github.io/linux-terminal-lab/

## 무엇을 할 수 있나
- 실제 우분투와 같은 프롬프트·출력·에러 메시지 (ls, cd, mkdir, cat, head/tail, cp/mv/rm, chmod, stat, sudo, su, useradd/userdel, ps, pstree, kill, ping, vim, man …)
- 오른쪽 **실습 과제 12개**: 명령을 치면 단계가 자동으로 체크돼요 (힌트·해설 포함, ⭐ = 중간고사 공개 문제 관련)
- 탭 여러 개(Ctrl+Shift+T), Tab 자동 완성, ↑ 이전 명령, Ctrl+C / Ctrl+L / Ctrl+D
- 만든 파일과 진행 상황은 브라우저(localStorage)에만 저장돼요. 실제 컴퓨터에는 아무 영향이 없어요.

## 구조
- `index.html` — 배포용 단일 파일
- `src/` — 원본 모듈. `python src/build.py` 로 다시 묶을 수 있어요 (결과: `src/linuxlab_local.html` → `index.html`로 복사).
