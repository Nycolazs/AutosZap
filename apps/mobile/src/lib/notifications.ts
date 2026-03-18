import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

let notificationHandlerConfigured = false;

async function loadNotificationsModule() {
  // Android push notifications are not supported in Expo Go (store client).
  // Returning null avoids runtime crashes while preserving behavior in dev builds.
  if (
    Platform.OS === 'android' &&
    Constants.executionEnvironment === 'storeClient'
  ) {
    return null;
  }

  try {
    const module = await import('expo-notifications');
    return module;
  } catch {
    return null;
  }
}

async function ensureNotificationHandler() {
  if (notificationHandlerConfigured) {
    return;
  }

  const notifications = await loadNotificationsModule();

  if (!notifications) {
    return;
  }

  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  notificationHandlerConfigured = true;
}

export async function registerForPushToken() {
  const notifications = await loadNotificationsModule();

  if (!notifications) {
    return null;
  }

  await ensureNotificationHandler();

  if (!Device.isDevice) {
    return null;
  }

  const permissions = await notifications.getPermissionsAsync();
  let status = permissions.status;

  if (status !== 'granted') {
    const requested = await notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    return null;
  }

  const token = await notifications.getExpoPushTokenAsync({
    projectId,
  });

  return token.data;
}
