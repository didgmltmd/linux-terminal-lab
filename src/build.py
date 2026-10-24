# page.html + style.css + JS 모듈 → linuxlab.html (아티팩트용 본문) / linuxlab_local.html (독립 실행용 전체 문서)
import pathlib
H = pathlib.Path(__file__).resolve().parent
page = (H / 'page.html').read_text(encoding='utf-8')
css = (H / 'style.css').read_text(encoding='utf-8')
mods = ['man.js', 'core.js', 'commands.js', 'vim.js', 'missions.js']
js = '\n'.join((H / m).read_text(encoding='utf-8') for m in mods) + '\nwindow.LAB.boot();\n'
js = js.replace('</script', '<\\/script')
out = page.replace('/*STYLE*/', css).replace('/*SCRIPTS*/', js)
(H / 'linuxlab.html').write_text(out, encoding='utf-8')
full = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + out.split('<header', 1)[0] + '</head>\n<body>\n<header' + out.split('<header', 1)[1] + '\n</body>\n</html>\n')
(H / 'linuxlab_local.html').write_text(full, encoding='utf-8')
print('built', len(out), 'bytes')
