export const DEFAULT_TIME_ZONE = "UTC";
export const TIME_ZONE_COOKIE = "wc_timezone";

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}
