import keytar from 'keytar';

const SERVICE = 'openvault';

export async function getCredentials(institutionId: string): Promise<{ username: string; password: string } | null> {
  const all = await keytar.findCredentials(SERVICE);
  const entry = all.find(c => c.account.startsWith(`${institutionId}:`));
  if (!entry) return null;
  const username = entry.account.slice(institutionId.length + 1);
  return { username, password: entry.password };
}

export async function setCredentials(institutionId: string, username: string, password: string): Promise<void> {
  await keytar.setPassword(SERVICE, `${institutionId}:${username}`, password);
}

export async function deleteCredentials(institutionId: string, username: string): Promise<void> {
  await keytar.deletePassword(SERVICE, `${institutionId}:${username}`);
}
