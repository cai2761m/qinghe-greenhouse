<script setup lang="ts">
defineProps<{ kind: 'pi' | 'plc' }>()
</script>

<template>
  <svg v-if="kind === 'pi'" class="device-art pi-art" viewBox="0 0 300 135" fill="none" role="img" aria-label="树莓派控制板示意图">
    <defs>
      <linearGradient id="pcb" x1="68" y1="15" x2="235" y2="130" gradientUnits="userSpaceOnUse"><stop stop-color="#648a6d"/><stop offset="1" stop-color="#3f6550"/></linearGradient>
      <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#edf0e9"/><stop offset="1" stop-color="#b3bcb4"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#224a32" flood-opacity=".14"/></filter>
    </defs>
    <g filter="url(#shadow)" transform="translate(12 0)">
      <rect x="66" y="16" width="171" height="105" rx="8" fill="#35503d"/>
      <rect x="63" y="12" width="171" height="105" rx="8" fill="url(#pcb)" stroke="#496c51"/>
      <path d="M76 40h40v17h18m-58 4h24v34h28m33-64v16h35v44m-36 12V87h-24m39-52h24v16m-55 29h-29V65H87m115 40h-22V91" stroke="#9eba89" stroke-opacity=".52" stroke-width="1.2"/>
      <path d="M77 44h34v17m-34 6h17v33h31m41-68v10h33v44m-20-46h27" stroke="#b4ce8d" stroke-opacity=".4"/>
      <g fill="#dce8b1" stroke="#47624b" stroke-width="2"><circle cx="72" cy="21" r="4"/><circle cx="224" cy="21" r="4"/><circle cx="72" cy="107" r="4"/><circle cx="224" cy="107" r="4"/></g>
      <rect x="112" y="40" width="43" height="43" rx="2" fill="#a6aea2" stroke="#cad0c3"/>
      <rect x="117" y="45" width="33" height="33" rx="1" fill="#b8bfb1"/>
      <text x="122" y="62" fill="#667160" font-size="6" font-family="monospace">BCM2712</text><text x="125" y="70" fill="#798372" font-size="4" font-family="monospace">BROADCOM</text>
      <rect x="166" y="47" width="20" height="28" rx="2" fill="#273b30"/><path d="M168 50h16m-16 22h16" stroke="#7c957d"/>
      <rect x="84" y="17" width="105" height="11" rx="1" fill="#29372a"/>
      <path v-for="i in 20" :key="i" :d="`M${86 + i * 4.8} 19v7`" stroke="#c7b97d" stroke-width="1.4"/>
      <g fill="url(#metal)" stroke="#9da99f"><rect x="212" y="31" width="29" height="24" rx="2"/><rect x="212" y="60" width="29" height="24" rx="2"/><rect x="207" y="89" width="34" height="25" rx="2"/></g>
      <path d="M230 35h10v15h-10zm0 29h10v15h-10zm-4 31h14v13h-14z" fill="#46564c"/><path d="M231 37h8m-8 4h8m-8 25h8m-8 4h8" stroke="#7592aa" stroke-width="2"/>
      <g fill="url(#metal)" stroke="#9da99f"><rect x="80" y="107" width="16" height="14" rx="1"/><rect x="114" y="109" width="12" height="11" rx="1"/><rect x="140" y="109" width="12" height="11" rx="1"/></g>
      <rect x="78" y="40" width="11" height="15" rx="1" fill="#d7d8c2"/><rect x="92" y="83" width="11" height="17" rx="1" fill="#d7d8c2"/>
      <g fill="#c8cea8"><rect x="108" y="31" width="8" height="4"/><rect x="121" y="31" width="5" height="4"/><rect x="162" y="82" width="6" height="4"/><rect x="174" y="82" width="6" height="4"/><rect x="166" y="94" width="11" height="5"/><rect x="185" y="92" width="5" height="10"/></g>
      <circle cx="79" cy="98" r="2" fill="#d4eb86"/><circle cx="85" cy="98" r="2" fill="#7dbc70"/>
    </g>
  </svg>
  <svg v-else class="device-art plc-art" viewBox="0 0 300 135" fill="none" role="img" aria-label="西门子 S7-200 SMART PLC 示意图">
    <defs><linearGradient id="plc-case" x1="90" y1="14" x2="190" y2="133" gradientUnits="userSpaceOnUse"><stop stop-color="#e2e4df"/><stop offset="1" stop-color="#bcc3bd"/></linearGradient><filter id="plc-shadow"><feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#234a32" flood-opacity=".13"/></filter></defs>
    <g filter="url(#plc-shadow)">
      <path d="M77 22l7-10h145l8 9v96l-8 7H84l-7-7V22z" fill="#9ca79d"/>
      <rect x="77" y="18" width="152" height="101" rx="3" fill="url(#plc-case)" stroke="#a8b1a7"/>
      <rect x="84" y="13" width="138" height="20" rx="2" fill="#536653"/>
      <rect x="84" y="100" width="138" height="20" rx="2" fill="#536653"/>
      <g v-for="i in 15" :key="i"><path :d="`M${86 + i * 8.3} 15v15M${86 + i * 8.3} 103v14`" stroke="#89977a" stroke-width="1"/><circle :cx="82 + i * 8.3" cy="21" r="2" fill="#354b39"/><circle :cx="82 + i * 8.3" cy="111" r="2" fill="#354b39"/></g>
      <rect x="87" y="39" width="67" height="53" rx="2" fill="#3a5044"/>
      <text x="93" y="50" fill="#e3ece1" font-size="5.5" font-weight="bold" font-family="sans-serif">SIEMENS</text>
      <text x="93" y="60" fill="#bfd7c6" font-size="4.2" font-family="sans-serif">S7-200 SMART</text>
      <circle cx="95" cy="72" r="2" fill="#b4e98e"/><circle cx="95" cy="80" r="2" fill="#d8e1cb"/><text x="101" y="74" fill="#c2d2c2" font-size="4">RUN</text><text x="101" y="82" fill="#c2d2c2" font-size="4">STOP</text>
      <text x="170" y="50" fill="#4c6352" font-size="5" font-weight="bold">CPU ST20</text><text x="170" y="59" fill="#738275" font-size="4">DC/DC/DC</text>
      <g stroke="#a0aca0"><path v-for="i in 8" :key="i" :d="`M${164 + i * 6} 69v20`" stroke-width="2"/></g>
      <path d="M119 88h27v11h-27z" fill="#909e93"/><path d="M122 90h21v7h-21z" fill="#3e5749"/>
      <rect x="87" y="35" width="134" height="2" fill="#bac3b5"/>
    </g>
  </svg>
</template>
