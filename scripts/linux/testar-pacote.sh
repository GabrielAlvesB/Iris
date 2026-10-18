#!/bin/bash
# Teste de fumaça de um pacote do Iris na distribuição dele, dentro de um
# contêiner (o workflow de release roda antes de publicar):
#
#   docker run --rm --security-opt seccomp=unconfined -v "$PWD/release:/r:ro" \
#     -v "$PWD/scripts/linux:/s:ro" fedora:41 bash /s/testar-pacote.sh fedora
#
# Instala pelo gerenciador da distro (é ele que resolve as dependências
# declaradas no package.json) e abre o Iris como usuário comum em X11 (xvfb) e
# em Wayland (weston sem tela). Falha se não chegar à primeira tela.
# seccomp=unconfined: o seccomp padrão do Docker bloqueia o sandbox do Chromium.
set -u
DISTRO="$1"

case "$DISTRO" in
  fedora)
    dnf install -y -q xorg-x11-server-Xvfb xorg-x11-xauth weston >/dev/null
    dnf install -y -q /r/iris-*.x86_64.rpm || exit 1
    ;;
  arch)
    pacman -Sy --noconfirm --needed xorg-server-xvfb xorg-xauth weston >/dev/null
    pacman -U --noconfirm /r/iris-*-x86_64.pkg.tar.* || exit 1
    ;;
  ubuntu)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq && apt-get install -y -qq xvfb xauth weston >/dev/null
    apt-get install -y -qq /r/iris_*_amd64.deb || exit 1
    ;;
  *)
    echo "distro desconhecida: $DISTRO" && exit 2
    ;;
esac

useradd -m teste
cat > /home/teste/abrir.sh <<'EOS'
export IRIS_MEDIR_ABERTURA=1 IRIS_SAIR_APOS_ABRIR=1
# Os mesmos argumentos que o atalho do menu passa (build.linux.executableArgs).
ARGS="--ozone-platform-hint=auto --enable-features=WaylandWindowDecorations"
falhou=0

timeout -k 5 60 xvfb-run -a /usr/bin/iris $ARGS --user-data-dir=/tmp/iris-x11 > /tmp/x11.log 2>&1
if grep "primeira tela" /tmp/x11.log; then echo "X11: abriu"; else echo "X11: NÃO abriu"; tail -20 /tmp/x11.log; falhou=1; fi

# O hint "auto" decide pelo XDG_SESSION_TYPE, como numa sessão GNOME/KDE real.
export XDG_RUNTIME_DIR=/tmp/xdg XDG_SESSION_TYPE=wayland
mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"
weston --backend=headless --socket=wayland-1 > /tmp/weston.log 2>&1 &
WESTON=$!
sleep 3
env -u DISPLAY WAYLAND_DISPLAY=wayland-1 timeout -k 5 60 /usr/bin/iris $ARGS --user-data-dir=/tmp/iris-wl > /tmp/wl.log 2>&1
kill "$WESTON" 2>/dev/null
if grep "primeira tela" /tmp/wl.log; then echo "Wayland: abriu"; else echo "Wayland: NÃO abriu"; tail -20 /tmp/wl.log; falhou=1; fi
exit $falhou
EOS
chmod +x /home/teste/abrir.sh
su teste -c /home/teste/abrir.sh
