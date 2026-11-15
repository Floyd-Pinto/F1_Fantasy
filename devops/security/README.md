# Security scanning (planned)

Config for the DevSecOps stages in `devops/jenkins/Jenkinsfile.devsecops`. See docs/DEVOPS.md, Part B.

| File | Tool | Purpose |
|---|---|---|
| — | TruffleHog | Secret scan of the git history (no config needed; `--only-verified`) |
| `dependency-check-suppressions.xml` | OWASP Dependency-Check | Accepted false positives |
| `.trivyignore` | Trivy | Accepted image CVEs (with reason + review date) |
| `zap-baseline.conf` | OWASP ZAP | Per-rule WARN/FAIL/IGNORE for the baseline DAST scan |
