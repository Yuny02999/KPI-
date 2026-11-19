import { DeviceEventEmitter, NativeModules, PermissionsAndroid } from "react-native";

const native = NativeModules.RecorderNative;
const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
let nextWatchId = 0;
let pendingPermission;

export const Accuracy = { BestForNavigation: "navigation", High: "high", Balanced: "balanced" };

export async function getForegroundPermissionsAsync() {
  const [precise, approximate] = await Promise.all([
    PermissionsAndroid.check(fine),
    PermissionsAndroid.check(coarse)
  ]);
  return {
    status: precise || approximate ? "granted" : "denied",
    android: { accuracy: precise ? "fine" : approximate ? "coarse" : "none" }
  };
}

export async function requestForegroundPermissionsAsync() {
  const permission = await getForegroundPermissionsAsync();
  if (permission.status === "granted") return permission;
  if (!pendingPermission) {
    pendingPermission = PermissionsAndroid.requestMultiple([fine, coarse])
      .finally(() => { pendingPermission = undefined; });
  }
  await pendingPermission;
  return getForegroundPermissionsAsync();
}

export const getProviderStatusAsync = () => native.getProviderStatus();
export const hasServicesEnabledAsync = async () =>
  (await getProviderStatusAsync()).locationServicesEnabled;

export const getLastKnownPositionAsync = ({ maxAge, requiredAccuracy }) =>
  native.getLastKnownPosition(maxAge, requiredAccuracy);

export const getCurrentPositionAsync = ({ accuracy, timeout, targetAccuracy, maxAge }) =>
  native.getCurrentPosition(accuracy, timeout, targetAccuracy, maxAge);

export const cancelCurrentPosition = () => native.cancelCurrentPosition();

export async function watchPositionAsync({ timeInterval, distanceInterval }, onPosition) {
  const id = ++nextWatchId;
  const subscription = DeviceEventEmitter.addListener("RecorderLocation", (event) => {
    if (event.id === id) onPosition(event);
  });
  try {
    await native.startWatch(id, timeInterval, distanceInterval);
  } catch (error) {
    subscription.remove();
    throw error;
  }
  return {
    remove() {
      subscription.remove();
      native.stopWatch(id);
    }
  };
}
