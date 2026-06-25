// Stores the Oura Personal Access Token in the device secure enclave / keystore.
// Never written to plain storage or synced anywhere.
import * as SecureStore from 'expo-secure-store';

const KEY = 'oura_access_token';

export async function saveToken(token) {
  await SecureStore.setItemAsync(KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}

export async function getToken() {
  return SecureStore.getItemAsync(KEY);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(KEY);
}
