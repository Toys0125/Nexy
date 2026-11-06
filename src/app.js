import { VueQueryPlugin } from '@tanstack/vue-query';
import { createApp } from 'vue';

// TODO: re-enable once Nexy has its own error reporting backend (initSentry used VRCX's DSN endpoint)
import { i18n, initComponents, initErrorReporting, initPlugins, initRouter /*, initSentry */ } from './plugins';
import { initPiniaPlugins, pinia } from './stores';
import { queryClient } from './queries';

import App from './App.vue';

await initPlugins();
await initPiniaPlugins();

// #region | Hey look it's most of VRCX!

const app = createApp(App);

app.use(pinia).use(i18n).use(VueQueryPlugin, { queryClient });
initComponents(app);
initRouter(app);
// await initSentry(app);
initErrorReporting(app);

app.mount('#root');
