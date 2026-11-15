#!/usr/bin/env bash
# Jenkins + SonarQube for the F1 Fantasy CI/CD pipeline, both in Docker.
#
#   ./devops/jenkins-setup.sh
#
# Safe to re-run: existing containers are started rather than recreated, and data lives in named
# volumes (jenkins_home, sonarqube_*). Both containers use host networking, so Jenkins reaches
# SonarQube and the pipeline's throwaway Postgres on localhost.
#
#   Jenkins    http://localhost:8080
#   SonarQube  http://localhost:9000   (first login admin / admin)
#
# Next steps after this script: docs/DEVOPS.md → "One-time configuration".
set -euo pipefail

JENKINS_IMAGE="jenkins/jenkins:lts"
SONAR_IMAGE="sonarqube:lts-community"
NODE_MAJOR=22
SONAR_SCANNER_VERSION="6.2.1.4610"
DOCKER_CLI_VERSION="27.3.1"
PLUGINS="workflow-aggregator git github sonar ssh-agent pipeline-stage-view credentials-binding"

log() { printf '\n\033[1;31m==>\033[0m %s\n' "$*"; }

# Start an existing container, or create it with the given `docker run` arguments.
ensure_container() {
    local name=$1; shift
    if docker container inspect "$name" >/dev/null 2>&1; then
        log "Starting existing container: $name"
        docker start "$name" >/dev/null
    else
        log "Creating container: $name"
        docker run -d --name "$name" "$@" >/dev/null
    fi
}

wait_for() {
    local what=$1 url=$2 pattern=${3:-}
    printf 'Waiting for %s ' "$what"
    for _ in $(seq 1 90); do
        if body=$(curl -fsS "$url" 2>/dev/null) && [[ -z $pattern || $body == *"$pattern"* ]]; then
            echo " ready"; return 0
        fi
        printf '.'; sleep 2
    done
    echo; echo "$what did not come up — check: docker logs ${what,,}" >&2; exit 1
}

command -v docker >/dev/null || { echo "Docker is required" >&2; exit 1; }

# SonarQube embeds Elasticsearch, which refuses to start below this kernel limit.
if (( $(sysctl -n vm.max_map_count) < 262144 )); then
    log "Raising vm.max_map_count for SonarQube (needs sudo)"
    sudo sysctl -w vm.max_map_count=262144
    echo "To keep it after reboot: echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-sonarqube.conf"
fi

# ── SonarQube ───────────────────────────────────────────────────────────────
ensure_container sonarqube \
    --network host \
    -v sonarqube_data:/opt/sonarqube/data \
    -v sonarqube_logs:/opt/sonarqube/logs \
    -v sonarqube_extensions:/opt/sonarqube/extensions \
    "$SONAR_IMAGE"

# ── Jenkins ─────────────────────────────────────────────────────────────────
# The Docker socket is mounted so pipeline stages can run containers (test database, image builds)
# on the host's Docker engine.
ensure_container jenkins \
    --network host \
    -v jenkins_home:/var/jenkins_home \
    -v /var/run/docker.sock:/var/run/docker.sock \
    "$JENKINS_IMAGE"

wait_for Jenkins http://localhost:8080/login

log "Installing build tools inside Jenkins (Node.js $NODE_MAJOR, SonarScanner, Docker CLI)"
docker exec -u root jenkins bash -euc "
    apt-get update -qq
    apt-get install -y -qq curl unzip libatomic1 >/dev/null

    if ! node --version 2>/dev/null | grep -q '^v$NODE_MAJOR'; then
        curl -fsSL https://deb.nodesource.com/setup_$NODE_MAJOR.x | bash - >/dev/null
        apt-get install -y -qq nodejs >/dev/null
    fi

    if [ ! -x /usr/local/bin/sonar-scanner ]; then
        curl -fsSL https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-$SONAR_SCANNER_VERSION-linux-x64.zip -o /tmp/sonar.zip
        unzip -qo /tmp/sonar.zip -d /opt/
        ln -sf /opt/sonar-scanner-$SONAR_SCANNER_VERSION-linux-x64/bin/sonar-scanner /usr/local/bin/sonar-scanner
    fi

    if ! command -v docker >/dev/null; then
        curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-$DOCKER_CLI_VERSION.tgz | tar -xz -C /tmp
        mv /tmp/docker/docker /usr/local/bin/docker
    fi
"

# Let the jenkins user talk to the host's Docker socket (match the socket's group id).
SOCK_GID=$(stat -c %g /var/run/docker.sock)
docker exec -u root jenkins bash -c "
    getent group $SOCK_GID >/dev/null || groupadd -g $SOCK_GID docker-host
    usermod -aG \$(getent group $SOCK_GID | cut -d: -f1) jenkins
"

log "Installing Jenkins plugins: $PLUGINS"
docker exec jenkins jenkins-plugin-cli --plugins $PLUGINS >/dev/null
docker restart jenkins >/dev/null
wait_for Jenkins http://localhost:8080/login
wait_for SonarQube http://localhost:9000/api/system/status '"status":"UP"'

log "Versions inside Jenkins"
docker exec jenkins bash -c 'node --version; npm --version; sonar-scanner --version 2>/dev/null | grep -m1 SonarScanner; docker --version; docker ps >/dev/null && echo "docker socket: OK"'

cat <<MSG

Jenkins    http://localhost:8080
SonarQube  http://localhost:9000   (admin / admin on first login)

Jenkins initial admin password (first run only):
$(docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword 2>/dev/null || echo "  (already set up)")

Next: docs/DEVOPS.md → "One-time configuration" (SonarQube token + webhook, GitHub webhook, job).
MSG
