type AvatarUser = {
  id?: number | string;
  username?: string;
  profile_image_url?: string | null;
};

const DICEBEAR_BASE_URL = 'https://api.dicebear.com/10.x/thumbs/svg';

export const getDiceBearAvatarUrl = (user: AvatarUser): string => {
  const stableId = user.id ?? user.username ?? 'guest';
  const seed = `llogis-user-${stableId}`;
  return `${DICEBEAR_BASE_URL}?seed=${encodeURIComponent(seed)}`;
};

const addDefaultAvatar = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(addDefaultAvatar);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(source)) {
    result[key] = addDefaultAvatar(child);
  }

  if (
    typeof source.username === 'string' &&
    source.username.length > 0 &&
    (source.profile_image_url === null || source.profile_image_url === undefined || source.profile_image_url === '')
  ) {
    result.profile_image_url = getDiceBearAvatarUrl({
      id: typeof source.id === 'number' || typeof source.id === 'string' ? source.id : undefined,
      username: source.username,
    });
  }

  return result;
};

const patchStoredUser = () => {
  try {
    const rawUser = localStorage.getItem('user');
    if (!rawUser) return;

    const parsedUser = JSON.parse(rawUser);
    const patchedUser = addDefaultAvatar(parsedUser);
    localStorage.setItem('user', JSON.stringify(patchedUser));
  } catch {
    // 손상된 로컬 데이터는 기존 로그인 복구 흐름에 맡긴다.
  }
};

export const installDiceBearAvatarDefaults = () => {
  patchStoredUser();

  const responsePrototype = Response.prototype as Response & {
    __llogisDiceBearInstalled?: boolean;
  };

  if (responsePrototype.__llogisDiceBearInstalled) return;

  const originalJson = Response.prototype.json;

  Response.prototype.json = async function jsonWithDefaultAvatar() {
    const data = await originalJson.call(this);
    return addDefaultAvatar(data);
  };

  responsePrototype.__llogisDiceBearInstalled = true;
};
