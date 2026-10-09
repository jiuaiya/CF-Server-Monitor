import { useMemo } from 'react';
import { useNodeMeta } from '@/hooks/useNode';
import { usePublicConfig, useCarrierNames } from '@/hooks/usePublicConfig';
import { resolveCarrierNames } from '@/services/cfsm/mappers';

export function useBackendPingDisplay(uuid: string) {
  const meta = useNodeMeta(uuid);
  const { data } = usePublicConfig();
  return meta?.pingDisplay ?? data?.pingDisplay;
}

export function useNodeCarrierNames(uuid: string) {
  const globalNames = useCarrierNames();
  const display = useBackendPingDisplay(uuid);
  return useMemo(() => display?.names ? resolveCarrierNames({ ...globalNames, ...display.names }) : globalNames, [globalNames, display]);
}
