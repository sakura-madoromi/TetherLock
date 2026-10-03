import {defineConfig} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
export default defineConfig({plugins:[svelte()],base:'./',server:{port:1420,strictPort:true},build:{outDir:'../../generated/simulator/dist',emptyOutDir:true,chunkSizeWarningLimit:1000},clearScreen:false});
