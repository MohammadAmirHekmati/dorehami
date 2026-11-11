#!/usr/bin/env bash
set -euo pipefail
image=${1:?Pass the dorehami image tag}
env_file=/opt/dorehami/shared/app.env
test -r "$env_file"
previous="dorehami-previous-$(date +%s)"
had_previous=false
if docker container inspect dorehami-app >/dev/null 2>&1; then
  had_previous=true
  docker stop --time 20 dorehami-app >/dev/null
  docker rename dorehami-app "$previous"
fi
rollback() {
  docker rm -f dorehami-app >/dev/null 2>&1 || true
  if [ "$had_previous" = true ]; then docker rename "$previous" dorehami-app; docker start dorehami-app >/dev/null; fi
  echo 'Deployment failed; previous application restored where available.' >&2
}
trap rollback ERR
docker run -d --name dorehami-app --restart unless-stopped --network host \
  --env-file "$env_file" --memory=256m --memory-swap=256m --cpus=0.5 \
  --pids-limit=128 --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --log-driver=json-file --log-opt max-size=5m --log-opt max-file=2 "$image" >/dev/null
healthy=false
for attempt in $(seq 1 15); do
  if curl --fail --silent http://127.0.0.1:3036/api/health >/dev/null; then healthy=true; break; fi
  sleep 1
done
if [ "$healthy" != true ]; then false; fi
trap - ERR
echo 'Deployment healthy. Previous container retained stopped for rollback.'
