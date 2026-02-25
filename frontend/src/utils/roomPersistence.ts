/**
 * Persists room credentials to localStorage for auto-reconnect on refresh.
 */

const STORAGE_KEY = 'collabboard_room_credentials';

export interface StoredRoomCredentials {
  roomId: string;
  userName: string;
  password?: string;
}

export function saveRoomCredentials(
  roomId: string,
  userName: string,
  password?: string
): void {
  try {
    const data: StoredRoomCredentials = {
      roomId,
      userName,
      ...(password ? { password } : {}),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save room credentials:', e);
  }
}

export function loadRoomCredentials(): StoredRoomCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredRoomCredentials;
    if (!data.roomId || !data.userName) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearRoomCredentials(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear room credentials:', e);
  }
}
