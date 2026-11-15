# devops/

Infrastructure and pipeline files. **Full guide: [docs/DEVOPS.md](../docs/DEVOPS.md).**

| Path | Status | What |
|---|---|---|
| `jenkins-setup.sh` | ✅ in use | Jenkins + SonarQube in Docker (pipeline: `/Jenkinsfile`) |
| `jenkins/Jenkinsfile.devsecops` | 📋 planned | Full DevSecOps pipeline: TruffleHog, Dependency-Check, SonarQube, Trivy, GHCR, GitOps, ZAP |
| `security/` | 📋 planned | Scanner configs (suppressions, ignores, ZAP rules) |
| `k8s/k3d-cluster.yaml` | 📋 planned | Local Kubernetes cluster |
| `helm/f1-fantasy/` | 📋 planned | Helm chart (lints and renders) + Grafana dashboard |
| `argocd/application.yaml` | 📋 planned | GitOps app definition |
| `monitoring/` | 📋 planned | kube-prometheus-stack values |
| `vault/` | 📋 planned | Vault policy + External Secrets |

Files marked planned are templates for future work and are not wired into any running pipeline.
