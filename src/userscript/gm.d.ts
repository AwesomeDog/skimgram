// Minimal Tampermonkey surface: only what src/userscript uses, so no @types package is needed.

declare function GM_getValue<T = unknown>(key: string, defaultValue?: T): T | undefined;

declare function GM_setValue(key: string, value: unknown): void;

declare function GM_addValueChangeListener(
  key: string,
  callback: (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
): number;

declare function GM_registerMenuCommand(
  name: string,
  callback: () => void,
  accessKey?: string,
): number;
