#!/bin/sh
# Three tunnel modes, decided by environment:
#   TUNNEL_TOKEN set   -> the named tunnel that token belongs to (production).
#   TUNNEL_TOKEN unset -> a throwaway trycloudflare.com quick tunnel; its public URL is
#                         printed in the container logs. Fine for demos, changes every boot.
#   TUNNEL_DISABLE=1   -> no tunnel at all; publish the port yourself (-p 8787:8787).
set -eu

if [ "${TUNNEL_DISABLE:-0}" = "1" ]; then
  echo "[cloudflared] TUNNEL_DISABLE=1 - tunnel off; app is on container port ${PORT:-8787}"
  exec sleep infinity
fi

if [ -n "${TUNNEL_TOKEN:-}" ]; then
  echo "[cloudflared] starting named tunnel"
  exec cloudflared tunnel --no-autoupdate run --token "$TUNNEL_TOKEN"
fi

echo "[cloudflared] no TUNNEL_TOKEN - opening a quick tunnel (public URL follows; it is world-reachable)"
exec cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:${PORT:-8787}"
