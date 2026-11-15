{{- define "f1.name" -}}{{ .Release.Name }}{{- end -}}

{{- define "f1.labels" -}}
app.kubernetes.io/part-of: f1-fantasy
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "f1.secretName" -}}
{{- default (printf "%s-secrets" .Release.Name) .Values.secrets.existingSecret -}}
{{- end -}}
