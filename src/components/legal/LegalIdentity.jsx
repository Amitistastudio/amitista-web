import React from 'react';
import {
  LEGAL_ENTITY,
  LEGAL_ADDRESS,
  TAX_NUMBER,
  REGISTRY_NUMBER,
  JURISDICTION,
} from '../../siteConfig';

export function IdentityLine() {
  const details = [LEGAL_ADDRESS, TAX_NUMBER && `ΑΦΜ ${TAX_NUMBER}`, REGISTRY_NUMBER && `ΓΕΜΗ ${REGISTRY_NUMBER}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {LEGAL_ENTITY}
      {details ? `, ${details}` : `, a studio trading from ${JURISDICTION}`}
    </>
  );
}
