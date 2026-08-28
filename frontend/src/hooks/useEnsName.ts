import { useEffect, useState } from 'react';
import { isAddress } from 'viem';
import { resolveEnsName } from '../services/ens';

export function useEnsName(address: string | null | undefined) {
  const addressKey = address && isAddress(address, { strict: false })
    ? address.toLocaleLowerCase()
    : null;
  const [resolved, setResolved] = useState<{ address: string | null; name: string | null }>({
    address: null,
    name: null,
  });

  useEffect(() => {
    let active = true;
    if (!addressKey) {
      setResolved({ address: null, name: null });
      return () => { active = false; };
    }

    void resolveEnsName(addressKey).then((name) => {
      if (active) setResolved({ address: addressKey, name });
    });
    return () => { active = false; };
  }, [addressKey]);

  return resolved.address === addressKey ? resolved.name : null;
}
