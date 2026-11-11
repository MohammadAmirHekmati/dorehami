import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({plugins:[react(),VitePWA({registerType:'prompt',manifest:{name:'دورهمی | کلاب کارت',short_name:'دورهمی',lang:'fa',dir:'rtl',start_url:'/',display:'standalone',background_color:'#101e26',theme_color:'#101e26',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]},workbox:{navigateFallbackDenylist:[/^\/api/,/^\/socket.io/]}})],server:{host:'127.0.0.1'}});
