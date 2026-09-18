import { defineConfig } from 'wxt';
import { frequencyPlugin } from './scripts/frequency-plugin';

// No host_permissions and no <all_urls>: the script is injected on demand, so the extension
// holds no standing access. The always-run origins must still be declared optional here or
// permissions.request() rejects them. No default_popup either - Chrome suppresses
// action.onClicked and the action context menu as soon as a popup is attached, so the panel
// is attached for the length of one openPopup() call and detached by the panel itself.
export default defineConfig({
  srcDir: 'src',
  outDir: '.output',
  // The word lists are assembled in memory from the pinned data packages; see
  // scripts/frequency-plugin.ts. Keeps generated data out of src/.
  vite: () => ({ plugins: [frequencyPlugin()] }),
  manifest: {
    name: 'Skimgram',
    description: 'Skim reading driven by surprisal: fade what you can guess, emphasise what you cannot. No AI model, no download.',
    permissions: ['activeTab', 'contextMenus', 'scripting', 'storage'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: 'Skimgram — click to toggle reading view and open settings',
      // The idle variant. `background.ts` swaps `icon/<size>-on.png` in per tab
      // while that tab's reading view is up, so the four sizes of each variant
      // have to stay in step — see scripts/gen-icons.mjs.
      default_icon: { 16: 'icon/16-off.png', 32: 'icon/32-off.png' },
    },
  },
});
