<script lang="ts">
 import type {LogEntry} from './types';
 let {entries=[]}:{entries:LogEntry[]}=$props();let scroll=$state(0);const height=36;
 let start=$derived(Math.max(0,Math.floor(scroll/height)-2));let visible=$derived(entries.slice(start,start+12));
</script>
<div class="logs" onscroll={(event)=>scroll=event.currentTarget.scrollTop} role="log" aria-label="最近 1000 条日志">
 <div style:height={`${entries.length*height}px`} class="space">
  <div class="rows" style:top={`${start*height}px`}>
   {#each visible as entry (entry.id)}<div class="row" title={entry.message}><time>{(entry.simulation_ms/1000).toFixed(2)}s</time> {entry.message}</div>{/each}
  </div>
 </div>
</div>
<style>
.logs{height:360px;max-height:55dvh;overflow:auto;background:var(--background);color:var(--ink);font:12px ui-monospace,monospace;border:1px solid var(--border);border-radius:10px}.space{position:relative}.rows{position:absolute;width:100%}.row{height:36px;box-sizing:border-box;padding:10px 12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid var(--border)}time{color:var(--primary);margin-right:12px;font-variant-numeric:tabular-nums}
</style>
