# STATUS: PLANNED — read-only access to the app's secrets, for Jenkins and the cluster.
#   vault kv put secret/f1-fantasy jwt_secret=... jwt_refresh_secret=... postgres_password=...
#   vault policy write f1-fantasy devops/vault/f1-fantasy-policy.hcl
path "secret/data/f1-fantasy" {
  capabilities = ["read"]
}
path "secret/data/f1-fantasy/*" {
  capabilities = ["read"]
}
