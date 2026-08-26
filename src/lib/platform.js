import React from 'react';

export function isMacPlatform() {
  if (typeof navigator === 'undefined') return false;

  const platform =
    navigator.userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    '';

  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function useModifierKey() {
  const [mac, setMac] = React.useState(false);

  React.useEffect(() => {
    setMac(isMacPlatform());
  }, []);

  return {
    mac,
    label: mac ? '⌘K' : 'Ctrl K',
    symbol: mac ? '⌘' : 'Ctrl',
  };
}

export function isMenuModifier(event) {
  return isMacPlatform() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}
