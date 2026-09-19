{{/* Chart label value. */}}
{{- define "meridian.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Common labels; call with (dict "root" $ "name" <component>). */}}
{{- define "meridian.labels" -}}
helm.sh/chart: {{ include "meridian.chart" .root }}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/part-of: meridian
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
{{- end -}}

{{- define "meridian.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end -}}

{{- define "meridian.configName" -}}{{ .Release.Name }}-config{{- end -}}

{{- define "meridian.secretName" -}}
{{- default (printf "%s-secrets" .Release.Name) .Values.existingSecret -}}
{{- end -}}

{{/* Image reference for a service; call with (dict "root" $ "svc" .). */}}
{{- define "meridian.image" -}}
{{- $img := .root.Values.image -}}
{{- $repo := printf "%s/%s" $img.repository .svc.name -}}
{{- if $img.registry }}{{ $repo = printf "%s/%s" $img.registry $repo }}{{ end -}}
{{- printf "%s:%s" $repo (toString (default $img.tag .svc.tag)) -}}
{{- end -}}

{{/* preStop sleep seconds: one second longer than SHUTDOWN_DRAIN_MS, rounded up. */}}
{{- define "meridian.preStopSeconds" -}}
{{- $drain := atoi (toString (default "0" .Values.config.SHUTDOWN_DRAIN_MS)) -}}
{{- add1 (div (add $drain 999) 1000) -}}
{{- end -}}
