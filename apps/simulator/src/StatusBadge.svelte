<script lang="ts">
  let {label, tone = 'neutral'}: {label: string; tone?: 'neutral' | 'success' | 'warning' | 'error'} = $props();
</script>
<span class="badge {tone}"><span aria-hidden="true">●</span>{label}</span>
<style>
  .badge{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:24px;font-size:12px;font-weight:600;background:var(--background);color:var(--muted);overflow-wrap:anywhere}
  .success{color:var(--primary);background:var(--primary-soft)}.warning{color:var(--warning)}.error{color:var(--error);background:var(--error-soft)}
</style>
