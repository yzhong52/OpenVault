import { useState } from 'react';
import { getInstLogoUrl, getInstColor, getInstAbbr } from './utils';

interface Props { name: string; size?: number; }

export function InstBadge({ name, size = 28 }: Props) {
  const [failed, setFailed] = useState(false);
  const logoUrl = getInstLogoUrl(name);

  const containerStyle = {
    width: size, height: size, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
  };

  if (logoUrl && !failed) {
    return (
      <div style={{ ...containerStyle }}>
        <img
          src={logoUrl}
          alt={name}
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{ objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div style={{
      ...containerStyle,
      background: getInstColor(name), color: '#fff',
      fontSize: size * 0.32, fontWeight: 600, letterSpacing: '-0.02em',
    }}>
      {getInstAbbr(name)}
    </div>
  );
}
